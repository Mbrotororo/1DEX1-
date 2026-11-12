package ru.onedex.pvpai.gui;

public final class Ease {
    private Ease() {}

    public static float outCubic(float t) {
        t = Math.max(0, Math.min(1, t));
        float u = 1 - t;
        return 1 - u * u * u;
    }

    public static float inCubic(float t) {
        t = Math.max(0, Math.min(1, t));
        return t * t * t;
    }
}
