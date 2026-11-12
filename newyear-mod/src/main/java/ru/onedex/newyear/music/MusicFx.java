package ru.onedex.newyear.music;

import ru.onedex.newyear.config.NyConfig;

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

}
