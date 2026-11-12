package ru.onedex.newyear.music;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import javazoom.jl.decoder.Bitstream;
import javazoom.jl.decoder.Decoder;
import javazoom.jl.decoder.Header;
import javazoom.jl.decoder.SampleBuffer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.sound.SoundCategory;
import org.lwjgl.stb.STBVorbis;
import org.lwjgl.stb.STBVorbisInfo;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;
import ru.onedex.newyear.NewYearClient;
import ru.onedex.newyear.config.NyConfig;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.SourceDataLine;
import java.io.BufferedInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.IntBuffer;
import java.nio.ShortBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * New Year music player. Decodes OGG (built-in songs, stb_vorbis from the game) and MP3 (songs from the
 * {@code .minecraft/1dex1-music} folder, JLayer), plays them through Java Sound and analyses the signal
 * on the fly (loudness + bass beats) so snow and garlands can react to the music.
 */
public final class MusicPlayer {
    private MusicPlayer() {}

    public record Track(String title, String artist, String resource, Path file) {
        public String label() {
            return artist.isEmpty() ? title : artist + " — " + title;
        }
    }

    private static final List<Track> tracks = new ArrayList<>();
    private static final Random RNG = new Random();
    private static volatile Thread thread;
    private static volatile boolean stopFlag, paused;
    private static volatile int current = -1;
    private static volatile long playedFrames, totalFrames;
    private static volatile int sampleRate = 44100;

    // analysis results (written by the audio thread, read by the render thread)
    private static final int RING = 4096;
    private static final long[] ringPos = new long[RING];
    private static final float[] ringEnergy = new float[RING];
    private static final boolean[] ringBeat = new boolean[RING];
    private static volatile int ringHead;
    private static volatile long playheadFrames;
    private static int ringRead;
    private static float energy, pulse;
    private static long beats;
    private static long lastNanos = System.nanoTime();

    // ------------------------------------------------------------------ library

    public static Path folder() {
        return FabricLoader.getInstance().getGameDir().resolve("1dex1-music");
    }

    public static synchronized void reload() {
        tracks.clear();
        try {
            ModContainer mod = FabricLoader.getInstance().getModContainer("dexnewyear").orElse(null);
            Path idx = mod == null ? null : mod.findPath("assets/dexnewyear/music/index.json").orElse(null);
            if (idx != null && Files.exists(idx)) {
                JsonArray arr = JsonParser.parseString(Files.readString(idx, StandardCharsets.UTF_8)).getAsJsonArray();
                for (JsonElement el : arr) {
                    JsonObject o = el.getAsJsonObject();
                    tracks.add(new Track(o.get("title").getAsString(), o.get("artist").getAsString(),
                            "assets/dexnewyear/music/" + o.get("file").getAsString(), null));
                }
            }
        } catch (Exception e) {
            NewYearClient.LOGGER.warn("Failed to read built-in songs", e);
        }
        try {
            Path dir = folder();
            Files.createDirectories(dir);
            try (var stream = Files.list(dir)) {
                stream.filter(p -> {
                    String n = p.getFileName().toString().toLowerCase(Locale.ROOT);
                    return n.endsWith(".ogg") || n.endsWith(".mp3");
                }).sorted().forEach(p -> {
                    String n = p.getFileName().toString();
                    n = n.substring(0, n.lastIndexOf('.'));
                    int dash = n.indexOf(" - ");
                    tracks.add(dash > 0 ? new Track(n.substring(dash + 3).trim(), n.substring(0, dash).trim(), null, p)
                            : new Track(n, "", null, p));
                });
            }
        } catch (Exception e) {
            NewYearClient.LOGGER.warn("Failed to list music folder", e);
        }
        NewYearClient.LOGGER.info("New Year music: {} songs", tracks.size());
    }

    public static synchronized List<Track> tracks() {
        return new ArrayList<>(tracks);
    }

    public static int currentIndex() {
        return current;
    }

    public static Track currentTrack() {
        int c = current;
        synchronized (MusicPlayer.class) {
            return c >= 0 && c < tracks.size() ? tracks.get(c) : null;
        }
    }

    public static boolean isPlaying() {
        return thread != null && !paused;
    }

    public static boolean isPaused() {
        return thread != null && paused;
    }

    public static float progress() {
        long t = totalFrames;
        return t <= 0 ? 0 : Math.min(1f, playheadFrames / (float) t);
    }

    public static int positionSeconds() {
        return (int) (playheadFrames / Math.max(1, sampleRate));
    }

    public static int lengthSeconds() {
        return (int) (totalFrames / Math.max(1, sampleRate));
    }

    // ------------------------------------------------------------------ control

    public static synchronized void play(int index) {
        stop();
        if (tracks.isEmpty()) return;
        index = Math.floorMod(index, tracks.size());
        current = index;
        NyConfig.INSTANCE.lastSong = index;
        Track t = tracks.get(index);
        stopFlag = false;
        paused = false;
        Thread th = new Thread(() -> run(t), "1DEX1 Music");
        th.setDaemon(true);
        thread = th;
        th.start();
    }

    public static synchronized void stop() {
        Thread th = thread;
        thread = null;
        stopFlag = true;
        paused = false;
        if (th != null) {
            th.interrupt();
            try {
                th.join(500);
            } catch (InterruptedException ignored) {
            }
        }
        energy = 0;
        pulse = 0;
    }

    public static void togglePause() {
        if (thread == null) {
            play(Math.max(0, NyConfig.INSTANCE.lastSong));
            return;
        }
        paused = !paused;
    }

    public static void next() {
        if (tracks.isEmpty()) return;
        if (NyConfig.INSTANCE.musicOrder == 2 && tracks.size() > 1) {
            int n;
            do n = RNG.nextInt(tracks.size()); while (n == current);
            play(n);
        } else {
            play(current + 1);
        }
    }

    public static void previous() {
        play(current - 1);
    }

    /** Called every client tick: start/stop with the setting, continue with the next song. */
    public static void tick(MinecraftClient mc) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.music) {
            if (thread != null) stop();
            return;
        }
        if (thread == null && !tracks.isEmpty()) {
            play(Math.max(0, Math.min(tracks.size() - 1, c.lastSong)));
        }
    }

    private static void finished() {
        MinecraftClient.getInstance().execute(() -> {
            if (!NyConfig.INSTANCE.music || thread != null) return;
            if (NyConfig.INSTANCE.musicOrder == 1) play(current);
            else next();
        });
    }

    // ------------------------------------------------------------------ analysis access (render thread)

    /** Smoothed loudness 0..1 (0 when nothing plays). */
    public static float energy() {
        return energy;
    }

    /** 1 right after a beat, decays to 0. */
    public static float pulse() {
        return pulse;
    }

    /** Number of beats so far (for blinking in rhythm). */
    public static long beats() {
        return beats;
    }

    /** Fresh beats since the last frame are consumed here; returns true on a new beat. */
    public static boolean updateFrame() {
        long now = System.nanoTime();
        float dt = Math.min(0.1f, (now - lastNanos) / 1e9f);
        lastNanos = now;
        boolean beat = false;
        float target = 0;
        if (thread != null && !paused) {
            long head = playheadFrames;
            int h = ringHead;
            while (ringRead != h && ringPos[ringRead % RING] <= head) {
                int i = ringRead % RING;
                target = ringEnergy[i];
                if (ringBeat[i]) beat = true;
                ringRead++;
            }
            if (target == 0) target = energy;
        }
        energy += (target - energy) * (1 - (float) Math.exp(-dt * 10));
        pulse = Math.max(0, pulse - dt * 3.2f);
        if (beat) {
            pulse = 1;
            beats++;
        }
        return beat;
    }

    // ------------------------------------------------------------------ audio thread

    private interface Pcm extends AutoCloseable {
        /** Fills {@code out} with interleaved stereo samples; returns frames read, 0 at the end. */
        int read(short[] out) throws Exception;

        int rate();

        long length();

        @Override
        void close();
    }

    private static void run(Track t) {
        Pcm pcm = null;
        SourceDataLine line = null;
        try {
            pcm = open(t);
            sampleRate = pcm.rate();
            totalFrames = pcm.length();
            playedFrames = 0;
            playheadFrames = 0;
            ringHead = 0;
            ringRead = 0;
            try {
                AudioFormat fmt = new AudioFormat(pcm.rate(), 16, 2, true, false);
                line = AudioSystem.getSourceDataLine(fmt);
                line.open(fmt, pcm.rate() / 5 * 4);
                line.start();
            } catch (Throwable e) {
                NewYearClient.LOGGER.warn("No audio output for music ({}), effects only", e.toString());
                line = null;
            }
            short[] buf = new short[1024 * 2];
            byte[] bytes = new byte[buf.length * 2];
            float avg = 0.0001f, bassAvg = 0.0001f, lp = 0, peak = 0.05f;
            long lastBeat = -100000;
            long startNanos = System.nanoTime();
            while (!stopFlag) {
                if (paused) {
                    if (line != null && line.isRunning()) line.stop();
                    Thread.sleep(30);
                    startNanos = System.nanoTime() - (long) (playedFrames * 1e9 / sampleRate);
                    continue;
                }
                if (line != null && !line.isRunning()) line.start();
                int frames = pcm.read(buf);
                if (frames <= 0) break;
                // ---- analysis: loudness and bass energy (one-pole low-pass ~150 Hz)
                double sum = 0, bass = 0;
                float alpha = (float) (1 - Math.exp(-2 * Math.PI * 150 / sampleRate));
                for (int i = 0; i < frames; i++) {
                    float m = (buf[i * 2] + buf[i * 2 + 1]) * 0.5f / 32768f;
                    lp += (m - lp) * alpha;
                    sum += m * m;
                    bass += lp * lp;
                }
                float rms = (float) Math.sqrt(sum / frames);
                float bassRms = (float) Math.sqrt(bass / frames);
                peak = Math.max(peak * 0.9995f, rms);
                avg += (rms - avg) * 0.02f;
                bassAvg += (bassRms - bassAvg) * 0.03f;
                long pos = playedFrames + frames;
                boolean beat = bassRms > bassAvg * 1.45f && bassRms > 0.02f && pos - lastBeat > sampleRate * 0.28f;
                if (beat) lastBeat = pos;
                int slot = ringHead % RING;
                ringPos[slot] = pos;
                ringEnergy[slot] = Math.min(1f, rms / Math.max(0.05f, peak));
                ringBeat[slot] = beat;
                ringHead = ringHead + 1;
                // ---- volume
                float vol = volume();
                for (int i = 0; i < frames * 2; i++) {
                    int s = Math.round(buf[i] * vol);
                    s = Math.max(-32768, Math.min(32767, s));
                    bytes[i * 2] = (byte) s;
                    bytes[i * 2 + 1] = (byte) (s >> 8);
                }
                if (line != null) {
                    line.write(bytes, 0, frames * 4);
                    playedFrames = pos;
                    playheadFrames = line.getLongFramePosition();
                } else {
                    playedFrames = pos;
                    long due = startNanos + (long) (pos * 1e9 / sampleRate);
                    long wait = due - System.nanoTime();
                    if (wait > 0) Thread.sleep(wait / 1_000_000, (int) (wait % 1_000_000));
                    playheadFrames = pos;
                }
            }
            if (line != null && !stopFlag) {
                line.drain();
                playheadFrames = playedFrames;
            }
        } catch (InterruptedException ignored) {
        } catch (Throwable e) {
            NewYearClient.LOGGER.error("Music playback failed: {}", t.label(), e);
        } finally {
            if (line != null) {
                try {
                    line.stop();
                    line.close();
                } catch (Throwable ignored) {
                }
            }
            if (pcm != null) pcm.close();
            boolean natural = !stopFlag;
            if (Thread.currentThread() == thread) thread = null;
            if (natural) finished();
        }
    }

    private static float volume() {
        float master = 1f;
        try {
            master = MinecraftClient.getInstance().options.getSoundVolume(SoundCategory.MASTER);
        } catch (Throwable ignored) {
        }
        float v = NyConfig.INSTANCE.musicVolume * master;
        return v * v; // perceptual curve
    }

    private static Pcm open(Track t) throws Exception {
        String name = t.file != null ? t.file.getFileName().toString().toLowerCase(Locale.ROOT) : t.resource;
        if (name.endsWith(".mp3")) return mp3(t);
        return ogg(t);
    }

    private static InputStream stream(Track t) throws Exception {
        if (t.file != null) return Files.newInputStream(t.file);
        ModContainer mod = FabricLoader.getInstance().getModContainer("dexnewyear").orElseThrow();
        return Files.newInputStream(mod.findPath(t.resource).orElseThrow());
    }

    private static Pcm ogg(Track t) throws Exception {
        byte[] data;
        try (InputStream in = stream(t)) {
            data = in.readAllBytes();
        }
        ByteBuffer mem = MemoryUtil.memAlloc(data.length);
        mem.put(data).flip();
        long handle;
        int channels, rate;
        long length;
        try (MemoryStack stack = MemoryStack.stackPush()) {
            IntBuffer err = stack.mallocInt(1);
            handle = STBVorbis.stb_vorbis_open_memory(mem, err, null);
            if (handle == 0) {
                MemoryUtil.memFree(mem);
                throw new IllegalStateException("stb_vorbis error " + err.get(0));
            }
            STBVorbisInfo info = STBVorbisInfo.malloc(stack);
            STBVorbis.stb_vorbis_get_info(handle, info);
            channels = info.channels();
            rate = info.sample_rate();
            length = STBVorbis.stb_vorbis_stream_length_in_samples(handle);
        }
        final int ch = channels, sr = rate;
        final long len = length;
        final long h = handle;
        final ShortBuffer tmp = MemoryUtil.memAllocShort(1024 * Math.max(1, ch));
        return new Pcm() {
            public int read(short[] out) {
                tmp.clear();
                int frames = STBVorbis.stb_vorbis_get_samples_short_interleaved(h, ch, tmp);
                for (int i = 0; i < frames; i++) {
                    short l = tmp.get(i * ch);
                    short r = ch > 1 ? tmp.get(i * ch + 1) : l;
                    out[i * 2] = l;
                    out[i * 2 + 1] = r;
                }
                return frames;
            }

            public int rate() {
                return sr;
            }

            public long length() {
                return len;
            }

            public void close() {
                STBVorbis.stb_vorbis_close(h);
                MemoryUtil.memFree(mem);
                MemoryUtil.memFree(tmp);
            }
        };
    }

    private static Pcm mp3(Track t) throws Exception {
        InputStream in = new BufferedInputStream(stream(t), 64 * 1024);
        Bitstream bs = new Bitstream(in);
        Decoder dec = new Decoder();
        long fileLen = t.file != null ? Files.size(t.file) : 0;
        return new Pcm() {
            short[] pending = new short[0];
            int pendingPos;
            int rate = 44100;
            boolean first = true;
            long estimated;

            public int read(short[] out) throws Exception {
                int frames = 0;
                int want = out.length / 2;
                while (frames < want) {
                    if (pendingPos >= pending.length) {
                        Header h = bs.readFrame();
                        if (h == null) break;
                        SampleBuffer sb = (SampleBuffer) dec.decodeFrame(h, bs);
                        int chs = dec.getOutputChannels();
                        rate = dec.getOutputFrequency();
                        if (first) {
                            first = false;
                            float ms = h.ms_per_frame();
                            int bitrate = h.bitrate();
                            estimated = bitrate > 0 ? (long) (fileLen * 8.0 / bitrate * rate) : 0;
                            if (ms <= 0) estimated = 0;
                        }
                        short[] b = sb.getBuffer();
                        int len = sb.getBufferLength();
                        if (chs == 1) {
                            pending = new short[len * 2];
                            for (int i = 0; i < len; i++) pending[i * 2] = pending[i * 2 + 1] = b[i];
                        } else {
                            pending = java.util.Arrays.copyOf(b, len);
                        }
                        pendingPos = 0;
                        bs.closeFrame();
                    }
                    int n = Math.min(want - frames, (pending.length - pendingPos) / 2);
                    System.arraycopy(pending, pendingPos, out, frames * 2, n * 2);
                    pendingPos += n * 2;
                    frames += n;
                }
                return frames;
            }

            public int rate() {
                if (first) {
                    try {
                        // decode the first frame to learn the sample rate
                        short[] probe = new short[2];
                        int got = read(probe);
                        if (got > 0) pendingPos -= 2;
                    } catch (Exception ignored) {
                    }
                }
                return rate;
            }

            public long length() {
                return estimated;
            }

            public void close() {
                try {
                    bs.close();
                } catch (Exception ignored) {
                }
            }
        };
    }
}
