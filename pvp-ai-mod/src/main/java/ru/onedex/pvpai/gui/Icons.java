package ru.onedex.pvpai.gui;

/** Vector icons drawn in a 16x16 design box (baked once into textures by {@link R2D#icon}). */
public final class Icons {
    private Icons() {}

    public static void crosshair(R2D.Canvas c, float s) {
        float m = 8 * s;
        c.ring(m, m, 5.2f * s, 1.25f * s);
        c.disc(m, m, 1.5f * s);
        c.line(m, 0.8f * s, m, 3.2f * s, 1.25f * s);
        c.line(m, 12.8f * s, m, 15.2f * s, 1.25f * s);
        c.line(0.8f * s, m, 3.2f * s, m, 1.25f * s);
        c.line(12.8f * s, m, 15.2f * s, m, 1.25f * s);
    }

    public static void sliders(R2D.Canvas c, float s) {
        c.line(2 * s, 5 * s, 14 * s, 5 * s, 1.25f * s);
        c.line(2 * s, 11 * s, 14 * s, 11 * s, 1.25f * s);
        c.disc(6 * s, 5 * s, 2.3f * s);
        c.disc(10.5f * s, 11 * s, 2.3f * s);
    }

    /** Chevron pointing right, rotated clockwise by {@code degrees} (90 = pointing down). */
    public static void chevron(R2D.Canvas c, float s, float degrees) {
        double a = Math.toRadians(degrees);
        float[][] pts = {{-2.6f, -5.2f}, {2.6f, 0f}, {-2.6f, 5.2f}};
        float[][] r = new float[3][2];
        for (int i = 0; i < 3; i++) {
            r[i][0] = 8 * s + (float) (pts[i][0] * Math.cos(a) - pts[i][1] * Math.sin(a)) * s;
            r[i][1] = 8 * s + (float) (pts[i][0] * Math.sin(a) + pts[i][1] * Math.cos(a)) * s;
        }
        c.line(r[0][0], r[0][1], r[1][0], r[1][1], 1.9f * s);
        c.line(r[1][0], r[1][1], r[2][0], r[2][1], 1.9f * s);
    }
}
