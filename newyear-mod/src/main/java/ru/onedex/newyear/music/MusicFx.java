package ru.onedex.newyear.music;

import net.minecraft.client.gui.DrawContext;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.R2D;

/** Music-driven effects shared by the snow, the garlands and the screen. */
public final class MusicFx {
    private MusicFx() {}

    /** True during the client tick in which a beat happened. */
    public static boolean beatThisTick;

    public static void tick() {
        beatThisTick = MusicPlayer.updateFrame();
        if (ru.onedex.newyear.NewYearClient.DEV && beatThisTick) ru.onedex.newyear.NewYearClient.LOGGER.info(String.format("[dev] beat #%d energy=%.2f t=%ds", MusicPlayer.beats(), MusicPlayer.energy(), MusicPlayer.positionSeconds()));
    }

    private static boolean active() {
        return MusicPlayer.isPlaying();
    }

    /** Snow fall speed multiplier (1 = normal). */
    public static float snowSpeed() {
        return active() && NyConfig.INSTANCE.fxSpeedSnow ? 1f + MusicPlayer.energy() * 1.6f : 1f;
    }

    /** Snow amount multiplier. */
    public static float snowAmount() {
        return active() && NyConfig.INSTANCE.fxSpeedSnow ? 1f + MusicPlayer.energy() * 0.9f : 1f;
    }

    public static boolean snowBeat() {
        return active() && NyConfig.INSTANCE.fxBeatSnow && beatThisTick;
    }

    /** Step for blinking garlands, or -1 to use the normal timer. */
    public static long garlandStep() {
        return active() && NyConfig.INSTANCE.fxGarlands ? MusicPlayer.beats() : -1;
    }

    /** Soft colored glow on the screen edges that pulses on beats. */
    public static void renderPulse(DrawContext ctx) {
        if (!active() || !NyConfig.INSTANCE.fxPulse) return;
        float p = MusicPlayer.pulse() * 0.7f + MusicPlayer.energy() * 0.15f;
        if (p < 0.02f) return;
        R2D.begin(ctx);
        int w = ctx.getScaledWindowWidth(), h = ctx.getScaledWindowHeight();
        int c = NyConfig.INSTANCE.accentColor();
        float a = Math.min(0.35f, p * 0.32f);
        float edge = Math.max(18, Math.min(w, h) * 0.12f);
        R2D.gradientV(0, 0, w, edge, R2D.withAlpha(c, a), c & 0x00FFFFFF);
        R2D.gradientV(0, h - edge, w, edge, c & 0x00FFFFFF, R2D.withAlpha(c, a));
    }
}
