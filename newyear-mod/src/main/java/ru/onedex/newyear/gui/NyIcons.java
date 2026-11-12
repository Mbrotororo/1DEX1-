package ru.onedex.newyear.gui;

/** Vector icons in a 16x16 design box (baked once into textures by {@link R2D#icon}). */
public final class NyIcons {
    private NyIcons() {}

    public static R2D.Painter forModule(int i) {
        return switch (i) {
            case 0 -> NyIcons::snowflake;
            case 1 -> NyIcons::screen;
            case 2 -> NyIcons::hat;
            case 3 -> NyIcons::garland;
            case 4 -> NyIcons::frost;
            case 5 -> NyIcons::breath;
            case 6 -> NyIcons::star;
            default -> NyIcons::sliders;
        };
    }

    public static void snowflake(R2D.Canvas c, float s) {
        float m = 8 * s;
        for (int k = 0; k < 3; k++) {
            double a = k * Math.PI / 3 + Math.PI / 2;
            float dx = (float) Math.cos(a) * 6.5f * s, dy = (float) Math.sin(a) * 6.5f * s;
            c.line(m - dx, m - dy, m + dx, m + dy, 1.3f * s);
        }
        for (int k = 0; k < 6; k++) {
            double a = k * Math.PI / 3 + Math.PI / 2;
            float bx = m + (float) Math.cos(a) * 4.0f * s, by = m + (float) Math.sin(a) * 4.0f * s;
            for (int sg = -1; sg <= 1; sg += 2) {
                double b = a + sg * 0.8;
                c.line(bx, by, bx + (float) Math.cos(b) * 2.3f * s, by + (float) Math.sin(b) * 2.3f * s, 1.1f * s);
            }
        }
    }

    public static void screen(R2D.Canvas c, float s) {
        c.line(2 * s, 3 * s, 14 * s, 3 * s, 1.2f * s);
        c.line(2 * s, 11 * s, 14 * s, 11 * s, 1.2f * s);
        c.line(2 * s, 3 * s, 2 * s, 11 * s, 1.2f * s);
        c.line(14 * s, 3 * s, 14 * s, 11 * s, 1.2f * s);
        c.line(6 * s, 14 * s, 10 * s, 14 * s, 1.2f * s);
        c.disc(5 * s, 6 * s, 0.9f * s);
        c.disc(9 * s, 5.5f * s, 0.9f * s);
        c.disc(11.5f * s, 8 * s, 0.9f * s);
        c.disc(7 * s, 8.6f * s, 0.9f * s);
    }

    public static void hat(R2D.Canvas c, float s) {
        // cone
        c.line(3.5f * s, 12 * s, 9 * s, 3.5f * s, 1.4f * s);
        c.line(9 * s, 3.5f * s, 12.5f * s, 12 * s, 1.4f * s);
        c.line(9 * s, 3.5f * s, 13 * s, 5.5f * s, 1.4f * s);
        c.disc(13.6f * s, 6.6f * s, 1.7f * s);
        // brim
        c.line(2.5f * s, 12.8f * s, 13.5f * s, 12.8f * s, 2.4f * s);
    }

    public static void garland(R2D.Canvas c, float s) {
        for (int i = 0; i < 15; i++) {
            float x0 = 1 + i, x1 = 2 + i;
            float y0 = 4 + 3.2f * (float) Math.sin(Math.PI * (x0 - 1) / 14f);
            float y1 = 4 + 3.2f * (float) Math.sin(Math.PI * (x1 - 1) / 14f);
            c.line(x0 * s, y0 * s, x1 * s, y1 * s, 1.0f * s);
        }
        float[] bx = {3.5f, 8f, 12.5f};
        for (float x : bx) {
            float y = 4 + 3.2f * (float) Math.sin(Math.PI * (x - 1) / 14f);
            c.line(x * s, y * s, x * s, (y + 1.5f) * s, 1.0f * s);
            c.disc(x * s, (y + 3.6f) * s, 2.0f * s);
        }
    }

    public static void frost(R2D.Canvas c, float s) {
        // thermometer
        c.ring(8 * s, 12 * s, 2.8f * s, 1.2f * s);
        c.line(6.6f * s, 3 * s, 6.6f * s, 9.6f * s, 1.2f * s);
        c.line(9.4f * s, 3 * s, 9.4f * s, 9.6f * s, 1.2f * s);
        c.line(6.6f * s, 3 * s, 9.4f * s, 3 * s, 1.2f * s);
        c.disc(8 * s, 12 * s, 1.4f * s);
        c.line(12 * s, 4 * s, 14 * s, 4 * s, 1.0f * s);
        c.line(12 * s, 6.5f * s, 14 * s, 6.5f * s, 1.0f * s);
    }

    public static void breath(R2D.Canvas c, float s) {
        c.ring(5 * s, 9 * s, 3.2f * s, 1.2f * s);
        c.ring(10 * s, 7 * s, 3.8f * s, 1.2f * s);
        c.ring(12.5f * s, 11 * s, 2.4f * s, 1.2f * s);
    }

    public static void star(R2D.Canvas c, float s) {
        float cx = 8 * s, cy = 8.4f * s;
        float[][] p = new float[10][2];
        for (int i = 0; i < 10; i++) {
            double a = -Math.PI / 2 + i * Math.PI / 5;
            float r = (i % 2 == 0 ? 6.6f : 2.8f) * s;
            p[i][0] = cx + (float) Math.cos(a) * r;
            p[i][1] = cy + (float) Math.sin(a) * r;
        }
        for (int i = 0; i < 10; i++) {
            int j = (i + 1) % 10;
            c.line(p[i][0], p[i][1], p[j][0], p[j][1], 1.2f * s);
        }
    }

    public static void sliders(R2D.Canvas c, float s) {
        c.line(2 * s, 5 * s, 14 * s, 5 * s, 1.25f * s);
        c.line(2 * s, 11 * s, 14 * s, 11 * s, 1.25f * s);
        c.disc(6 * s, 5 * s, 2.3f * s);
        c.disc(10.5f * s, 11 * s, 2.3f * s);
    }

    public static void dots(R2D.Canvas c, float s) {
        c.disc(4 * s, 8 * s, 1.3f * s);
        c.disc(8 * s, 8 * s, 1.3f * s);
        c.disc(12 * s, 8 * s, 1.3f * s);
    }
}
