package ru.onedex.newyear.render;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.AddressMode;
import com.mojang.blaze3d.textures.FilterMode;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.sound.MovingSoundInstance;
import net.minecraft.client.sound.SoundInstance;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.attribute.EnvironmentAttributes;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import ru.onedex.newyear.NewYearClient;
import ru.onedex.newyear.config.NyConfig;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * Now and then at night Santa's sleigh with four reindeer (Rudolph in front, his nose glowing)
 * flies across the sky, sometimes right in front of the moon, leaving a trail of golden sparkles,
 * with sleigh bells that come closer and fade away again. Only on this client.
 */
public final class SantaFlight {
    private SantaFlight() {}

    private static final Identifier SOURCE = Identifier.of("dexnewyear", "textures/entity/santa.png");
    private static final Identifier TEX = Identifier.of("dexnewyear", "dyn/santa");
    private static final Identifier GLOW = Identifier.of("dexnewyear", "textures/entity/glow.png");
    public static final SoundEvent BELLS = SoundEvent.of(Identifier.of("dexnewyear", "santa_bells"));
    /** Sprite: 4 frames stacked vertically, each 760 x 180 units; nose of the front reindeer. */
    private static final float ASPECT = 180f / 760f, NOSE_U = 0.9447f, NOSE_V = 0.274f;
    private static final float LENGTH = 30f, SPEED = 16f, HALF_PATH = 135f;
    private static final Random RNG = new Random();

    private static boolean texReady, texFailed;
    private static boolean flying;
    private static long startNanos;
    private static double cx, cy, cz;       // closest point of the path
    private static double fx, fz;           // flight direction (horizontal, unit)
    private static float nextIn = 10;        // seconds until the next flight
    private static ClientWorld world;
    private static Bells bells;

    private static final class Spark {
        double x, y, z, vx, vy, vz;
        float age, life, size;
        int color;
    }

    private static final List<Spark> sparks = new ArrayList<>();

    // ------------------------------------------------------------------ timing

    private static float t() {
        return (System.nanoTime() - startNanos) / 1e9f;
    }

    private static float duration() {
        return HALF_PATH * 2 / SPEED;
    }

    private static boolean night(ClientWorld w) {
        if (!w.getDimension().hasSkyLight() || w.getDimension().hasCeiling()) return false;
        long time = Math.floorMod(w.getTimeOfDay(), 24000L);
        return time >= 13000 && time < 23000;
    }

    public static void tick(MinecraftClient mc) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.santa || mc.world == null || mc.player == null) {
            stop();
            nextIn = 10;
            return;
        }
        if (mc.world != world) {
            stop();
            world = mc.world;
            nextIn = 10;
        }
        // sparkles drift down and fade
        for (Iterator<Spark> it = sparks.iterator(); it.hasNext(); ) {
            Spark s = it.next();
            s.age += 0.05f;
            s.vy -= 0.12 * 0.05;
            s.x += s.vx * 0.05;
            s.y += s.vy * 0.05;
            s.z += s.vz * 0.05;
            if (s.age >= s.life) it.remove();
        }
        if (flying) {
            float t = t();
            if (t >= duration()) {
                stop();
                nextIn = NewYearClient.DEV ? 6 : (c.santaFrequency == 1 ? 40 + RNG.nextFloat() * 50 : 150 + RNG.nextFloat() * 180);
                return;
            }
            // golden trail behind the sleigh
            double[] p = pos(t);
            for (int i = 0; i < 3; i++) {
                Spark s = new Spark();
                double back = -LENGTH * 0.5 + RNG.nextDouble() * 1.2;
                s.x = p[0] + fx * back + (RNG.nextDouble() - 0.5) * 0.8;
                s.y = p[1] - LENGTH * ASPECT * 0.1 + (RNG.nextDouble() - 0.5) * 1.2;
                s.z = p[2] + fz * back + (RNG.nextDouble() - 0.5) * 0.8;
                s.vx = (RNG.nextDouble() - 0.5) * 0.6;
                s.vy = -0.2 - RNG.nextDouble() * 0.4;
                s.vz = (RNG.nextDouble() - 0.5) * 0.6;
                s.life = 1.0f + RNG.nextFloat() * 1.2f;
                s.size = 0.35f + RNG.nextFloat() * 0.45f;
                s.color = RNG.nextFloat() < 0.7f ? 0xFFFFD86A : 0xFFFFFFFF;
                sparks.add(s);
            }
            return;
        }
        if (mc.isPaused()) return;
        if (!night(mc.world)) {
            nextIn = Math.max(nextIn, 12);
            return;
        }
        nextIn -= 0.05f;
        if (nextIn <= 0) launch(mc);
    }

    private static void stop() {
        flying = false;
        if (bells != null) {
            bells.finish();
            bells = null;
        }
    }

    private static void launch(MinecraftClient mc) {
        Vec3d eye = mc.player.getEyePos();
        double renderBlocks = mc.options.getClampedViewDistance() * 16.0;
        double dist = Math.max(30, Math.min(66, renderBlocks * 0.5));
        // the moon direction, as the sky draws it
        float moonDeg = mc.gameRenderer.getCamera().getEnvironmentAttributeInterpolator().get(EnvironmentAttributes.MOON_ANGLE_VISUAL, 1f);
        double a = Math.toRadians(moonDeg);
        double mx = -Math.sin(a), my = Math.cos(a);
        if (RNG.nextFloat() < 0.55f && my > 0.22 && my < 0.92) {
            // right in front of the moon
            cx = eye.x + mx * dist;
            cy = eye.y + my * dist;
            cz = eye.z;
            fx = 0;
            fz = RNG.nextBoolean() ? 1 : -1;
        } else {
            double ang = RNG.nextDouble() * Math.PI * 2;
            fx = Math.cos(ang);
            fz = Math.sin(ang);
            double side = (RNG.nextBoolean() ? 1 : -1) * dist * 0.85;
            cx = eye.x - fz * side;
            cz = eye.z + fx * side;
            cy = eye.y + dist * (0.38 + RNG.nextDouble() * 0.2);
        }
        cy = Math.min(cy, mc.world.getTopYInclusive() + 80);
        startNanos = System.nanoTime();
        flying = true;
        if (NyConfig.INSTANCE.santaBells) {
            bells = new Bells();
            mc.getSoundManager().play(bells);
        }
        if (NewYearClient.DEV) NewYearClient.LOGGER.info(String.format("[dev] santa launch at %.0f %.0f %.0f dir %.2f %.2f moon %.0f", cx, cy, cz, fx, fz, moonDeg));
    }

    /** Center of the sprite at time t. */
    private static double[] pos(float t) {
        double s = t * SPEED - HALF_PATH;
        double bob = Math.sin(t * 2.1) * 0.7;
        return new double[]{cx + fx * s, cy + bob, cz + fz * s};
    }

    // ------------------------------------------------------------------ render

    private static boolean ensureTexture() {
        if (texReady) return true;
        if (texFailed) return false;
        MinecraftClient mc = MinecraftClient.getInstance();
        try (InputStream in = mc.getResourceManager().getResource(SOURCE).orElseThrow().getInputStream()) {
            NativeImage img = NativeImage.read(in);
            NativeImageBackedTexture tex = new NativeImageBackedTexture(() -> "dexnewyear santa", img) {
                {
                    this.sampler = RenderSystem.getSamplerCache().get(AddressMode.CLAMP_TO_EDGE, AddressMode.CLAMP_TO_EDGE, FilterMode.LINEAR, FilterMode.LINEAR, false);
                }
            };
            mc.getTextureManager().registerTexture(TEX, tex);
            texReady = true;
        } catch (Exception e) {
            NewYearClient.LOGGER.error("Failed to load the Santa sprite", e);
            texFailed = true;
        }
        return texReady;
    }

    public static void render(WorldRenderContext ctx) {
        if (!flying && sparks.isEmpty()) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null || mc.world != world || !ensureTexture()) return;
        Vec3d cam = mc.gameRenderer.getCamera().getCameraPos();
        Quaternionf rot = mc.gameRenderer.getCamera().getRotation();
        MatrixStack.Entry e = ctx.matrices().peek();
        float t = t();

        if (flying) {
            double[] p = pos(t);
            float px = (float) (p[0] - cam.x), py = (float) (p[1] - cam.y), pz = (float) (p[2] - cam.z);
            float hl = LENGTH / 2f, hh = LENGTH * ASPECT / 2f;
            // a little pitch with the bobbing
            float pitch = (float) (Math.cos(t * 2.1) * 0.06);
            float ux = (float) (-fx * Math.sin(pitch)), uy = (float) Math.cos(pitch), uz = (float) (-fz * Math.sin(pitch));
            float rx = (float) (fx * Math.cos(pitch)), ry = (float) Math.sin(pitch), rz = (float) (fz * Math.cos(pitch));
            int frame = (int) (t * 9) & 3;
            float v0 = frame * 0.25f, v1 = v0 + 0.25f;
            float[] back = {px - rx * hl, py - ry * hl, pz - rz * hl}, front = {px + rx * hl, py + ry * hl, pz + rz * hl};
            // face the camera: normal = forward x up
            float nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux;
            boolean flip = nx * -px + ny * -py + nz * -pz < 0;
            VertexConsumer vc = ctx.consumers().getBuffer(RenderLayers.entityTranslucent(TEX));
            int col = 0xFFDCE2F2; // moonlit
            float[][] q = {
                    {back[0] - ux * hh, back[1] - uy * hh, back[2] - uz * hh, 0, v1},
                    {front[0] - ux * hh, front[1] - uy * hh, front[2] - uz * hh, 1, v1},
                    {front[0] + ux * hh, front[1] + uy * hh, front[2] + uz * hh, 1, v0},
                    {back[0] + ux * hh, back[1] + uy * hh, back[2] + uz * hh, 0, v0}};
            int[] order = flip ? new int[]{3, 2, 1, 0} : new int[]{0, 1, 2, 3};
            for (int i : order) {
                vc.vertex(e, q[i][0], q[i][1], q[i][2]).color(col).texture(q[i][3], q[i][4]).overlay(OverlayTexture.DEFAULT_UV)
                        .light(0xF000F0).normal(e, flip ? -nx : nx, flip ? -ny : ny, flip ? -nz : nz);
            }
            // Rudolph's glowing nose
            float nu = NOSE_U - 0.5f, nv = 0.5f - NOSE_V;
            float gx = px + rx * nu * LENGTH + ux * nv * LENGTH * ASPECT;
            float gy = py + ry * nu * LENGTH + uy * nv * LENGTH * ASPECT;
            float gz = pz + rz * nu * LENGTH + uz * nv * LENGTH * ASPECT;
            float pulse = 0.75f + 0.25f * (float) Math.sin(t * 6);
            VertexConsumer gv = ctx.consumers().getBuffer(RenderLayers.eyes(GLOW));
            glow(gv, e, rot, gx, gy, gz, 1.1f * pulse, (Math.round(230 * pulse) << 24) | 0xFF3A28);
            glow(gv, e, rot, gx, gy, gz, 0.35f, 0xFFFFB0A0);
        }
        if (!sparks.isEmpty()) {
            VertexConsumer gv = ctx.consumers().getBuffer(RenderLayers.eyes(GLOW));
            float tw = (System.nanoTime() % 1_000_000_000L) / 1e9f;
            for (Spark s : sparks) {
                float life = 1 - s.age / s.life;
                float twinkle = 0.6f + 0.4f * (float) Math.sin((tw + s.size) * 40 + s.x);
                int a = Math.round(255 * life * twinkle);
                if (a <= 2) continue;
                glow(gv, e, rot, (float) (s.x - cam.x), (float) (s.y - cam.y), (float) (s.z - cam.z), s.size * (0.4f + 0.6f * life), (a << 24) | (s.color & 0xFFFFFF));
            }
        }
    }

    private static void glow(VertexConsumer vc, MatrixStack.Entry e, Quaternionf rot, float x, float y, float z, float size, int color) {
        Vector3f[] c = {new Vector3f(-size, -size, 0), new Vector3f(-size, size, 0), new Vector3f(size, size, 0), new Vector3f(size, -size, 0)};
        float[][] uv = {{0, 1}, {0, 0}, {1, 0}, {1, 1}};
        for (Vector3f v : c) v.rotate(rot).add(x, y, z);
        int[][] orders = {{0, 1, 2, 3}, {3, 2, 1, 0}};
        for (int[] o : orders) {
            for (int i : o) {
                vc.vertex(e, c[i].x, c[i].y, c[i].z).color(color).texture(uv[i][0], uv[i][1]).overlay(OverlayTexture.DEFAULT_UV).light(0xF000F0).normal(e, 0, 1, 0);
            }
        }
    }

    // ------------------------------------------------------------------ bells that follow the sleigh

    private static final class Bells extends MovingSoundInstance {
        Bells() {
            super(BELLS, SoundCategory.AMBIENT, SoundInstance.createRandom());
            this.repeat = true;
            this.repeatDelay = 0;
            this.volume = 0.01f;
            this.attenuationType = AttenuationType.LINEAR;
            update();
        }

        private void update() {
            float t = t();
            double[] p = pos(t);
            this.x = p[0];
            this.y = p[1];
            this.z = p[2];
            float d = duration();
            this.volume = Math.max(0.01f, Math.min(1f, Math.min(t / 2f, (d - t) / 2f)));
        }

        void finish() {
            setDone();
        }

        @Override
        public void tick() {
            if (!flying) {
                setDone();
                return;
            }
            update();
        }

        @Override
        public boolean shouldAlwaysPlay() {
            return true;
        }
    }
}
