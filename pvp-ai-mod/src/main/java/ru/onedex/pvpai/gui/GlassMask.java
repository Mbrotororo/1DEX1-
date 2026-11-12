package ru.onedex.pvpai.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;

import java.util.ArrayList;
import java.util.List;

/**
 * Mask that tells the glass shader where to blur: only under the menu panels (iOS-style glass),
 * the rest of the screen stays sharp. Redrawn only when panels move.
 */
public final class GlassMask {
    private GlassMask() {}

    public static final int MW = 960, MH = 540;
    /** Post effects look textures up as "textures/effect/<name>.png"; the shader samples it as "dexpvpai:glass_mask". */
    public static final Identifier ID = Identifier.of("dexpvpai", "textures/effect/glass_mask.png");

    private record Shape(float x, float y, float w, float h, float r, float a) {
    }

    private static NativeImageBackedTexture tex;
    private static final List<Shape> pending = new ArrayList<>();
    private static final List<int[]> drawnBoxes = new ArrayList<>();
    private static String lastSignature = "";

    /** Must run on the render thread before the glass post effect is first loaded. */
    public static void ensure() {
        if (tex != null) return;
        NativeImage img = new NativeImage(MW, MH, false);
        img.fillRect(0, 0, MW, MH, 0);
        tex = new NativeImageBackedTexture(() -> "dexpvpai glass mask", img);
        MinecraftClient.getInstance().getTextureManager().registerTexture(ID, tex);
    }

    public static void begin() {
        pending.clear();
    }

    /** Adds a rounded rectangle (screen GUI units) that should look like glass, with opacity {@code a}. */
    public static void add(float x, float y, float w, float h, float r, float a) {
        if (w > 0 && h > 0 && a > 0.003f) pending.add(new Shape(x, y, w, h, r, Math.min(1f, a)));
    }

    public static void commit(float screenW, float screenH) {
        ensure();
        float sx = MW / screenW, sy = MH / screenH;
        StringBuilder sig = new StringBuilder();
        for (Shape s : pending) {
            sig.append(Math.round(s.x * sx * 4)).append(',').append(Math.round(s.y * sy * 4)).append(',')
                    .append(Math.round(s.w * sx * 4)).append(',').append(Math.round(s.h * sy * 4)).append(',')
                    .append(Math.round(s.a * 64)).append(';');
        }
        String signature = sig.toString();
        if (signature.equals(lastSignature)) return;
        lastSignature = signature;

        NativeImage img = tex.getImage();
        if (img == null) return;
        for (int[] b : drawnBoxes) img.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1], 0);
        drawnBoxes.clear();
        for (Shape s : pending) {
            // a hair inside the panel so the blur never leaks past its border
            float x0 = s.x * sx + 0.5f, y0 = s.y * sy + 0.5f, x1 = (s.x + s.w) * sx - 0.5f, y1 = (s.y + s.h) * sy - 0.5f;
            float R = Math.max(1f, Math.min(s.r * sx, Math.min(x1 - x0, y1 - y0) / 2f));
            int bx0 = Math.max(0, (int) Math.floor(x0)), by0 = Math.max(0, (int) Math.floor(y0));
            int bx1 = Math.min(MW, (int) Math.ceil(x1)), by1 = Math.min(MH, (int) Math.ceil(y1));
            if (bx1 <= bx0 || by1 <= by0) continue;
            drawnBoxes.add(new int[]{bx0, by0, bx1, by1});
            for (int py = by0; py < by1; py++) {
                float fy = py + 0.5f;
                float cy = Math.max(y0 + R, Math.min(y1 - R, fy));
                for (int px = bx0; px < bx1; px++) {
                    float fx = px + 0.5f;
                    float cx = Math.max(x0 + R, Math.min(x1 - R, fx));
                    float d = (float) Math.hypot(fx - cx, fy - cy);
                    float cov = R - d + 0.5f;
                    if (cov <= 0) continue;
                    int a = Math.round(Math.min(1f, cov) * s.a * 255);
                    int old = (img.getColorArgb(px, py) >>> 24) & 255;
                    if (a > old) img.setColorArgb(px, py, (a << 24) | 0xFFFFFF);
                }
            }
        }
        tex.upload();
    }
}
