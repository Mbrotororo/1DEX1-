package ru.onedex.newyear.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.text.Style;
import net.minecraft.text.StyleSpriteSource;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

import java.util.HashMap;
import java.util.Map;

/**
 * Lightweight 2D toolkit.
 *
 * Every shape is drawn at real screen-pixel resolution from small cached anti-aliased textures,
 * so a rounded rectangle costs ~7 draw elements instead of hundreds (keeps FPS high).
 * Text uses Inter rasterized at the exact pixel size, so it is sharp at any scale.
 *
 * Coordinates are in "units"; {@link #k} pixels per unit (GUI scale, times HUD scale for the HUD).
 */
public final class R2D {
    private R2D() {}

    private static DrawContext ctx;
    private static int guiScale = 2;
    /** Pixels per unit. */
    private static float k = 2;
    /** Global opacity multiplier (open/close animation). */
    public static float alpha = 1f;
    /** Draw elements submitted (for performance checks). */
    public static int elements;

    public enum Font {
        M6('m', 6), M7('m', 7), M8('m', 8), S8('s', 8), S9('s', 9), S11('s', 11), B13('b', 13), B20('b', 20);

        final char weight;
        final float size;

        Font(char weight, float size) {
            this.weight = weight;
            this.size = size;
        }
    }

    private static final Identifier[][] FONT_IDS = new Identifier[3][73];

    static {
        char[] w = {'m', 's', 'b'};
        for (int i = 0; i < 3; i++) {
            for (int n = 5; n <= 72; n++) FONT_IDS[i][n] = Identifier.of("dexnewyear", "px_" + w[i] + "_" + n);
        }
    }

    public static void begin(DrawContext context) {
        ctx = context;
        guiScale = Math.max(1, MinecraftClient.getInstance().getWindow().getScaleFactor());
        k = guiScale;
        alpha = 1f;
    }

    /** Sets how many pixels one unit is (default: GUI scale). */
    public static void unit(float pxPerUnit) {
        k = Math.max(0.5f, pxPerUnit);
    }

    public static float unit() {
        return k;
    }

    public static int guiScale() {
        return guiScale;
    }

    public static DrawContext ctx() {
        return ctx;
    }

    // ------------------------------------------------------------------ colors

    public static int argb(int a, int r, int g, int b) {
        return (a & 255) << 24 | (r & 255) << 16 | (g & 255) << 8 | (b & 255);
    }

    public static int withAlpha(int color, float a) {
        int base = (color >>> 24) & 255;
        int na = Math.round(base * Math.max(0, Math.min(1, a)));
        return (na << 24) | (color & 0xFFFFFF);
    }

    public static int lerpColor(int a, int b, float t) {
        t = Math.max(0, Math.min(1, t));
        int aa = (a >>> 24) & 255, ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        int ba = (b >>> 24) & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        return argb(Math.round(aa + (ba - aa) * t), Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t));
    }

    private static int mul(int color) {
        return withAlpha(color, alpha);
    }

    // ------------------------------------------------------------------ pixel space

    private static void pushPx() {
        ctx.getMatrices().pushMatrix();
        ctx.getMatrices().scale(1f / guiScale, 1f / guiScale);
    }

    private static void popPx() {
        ctx.getMatrices().popMatrix();
    }

    private static int p(float units) {
        return Math.round(units * k);
    }

    private static void fillPx(int x1, int y1, int x2, int y2, int color) {
        if (x2 <= x1 || y2 <= y1 || (color >>> 24) == 0) return;
        ctx.fill(x1, y1, x2, y2, color);
        elements++;
    }

    private static void texPx(Identifier id, int x, int y, int w, int h, int u, int v, int texW, int texH, int color) {
        if (w <= 0 || h <= 0 || (color >>> 24) == 0) return;
        ctx.drawTexture(RenderPipelines.GUI_TEXTURED, id, x, y, u, v, w, h, w, h, texW, texH, color);
        elements++;
    }

    // ------------------------------------------------------------------ cached shape textures

    private interface Coverage {
        float at(int x, int y);
    }

    private static final Map<String, Identifier> TEXTURES = new HashMap<>();
    private static int texCounter;

    private static Identifier shapeTexture(String key, int w, int h, Coverage cov) {
        Identifier id = TEXTURES.get(key);
        if (id != null) return id;
        NativeImage img = new NativeImage(w, h, false);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int a = Math.round(clamp01(cov.at(x, y)) * 255);
                img.setColorArgb(x, y, (a << 24) | 0xFFFFFF);
            }
        }
        id = Identifier.of("dexnewyear", "dyn/" + (texCounter++));
        final String name = "dexnewyear " + key;
        MinecraftClient.getInstance().getTextureManager().registerTexture(id, new NativeImageBackedTexture(() -> name, img));
        TEXTURES.put(key, id);
        return id;
    }

    /** Filled disc of radius R pixels, texture size 2R x 2R. */
    private static Identifier disc(int R) {
        return shapeTexture("d" + R, 2 * R, 2 * R, (x, y) -> {
            double d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
            return (float) (R - d + 0.5);
        });
    }

    /** Ring of outer radius R and thickness T pixels. */
    private static Identifier ring(int R, int T) {
        return shapeTexture("r" + R + "_" + T, 2 * R, 2 * R, (x, y) -> {
            double d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
            float outer = clamp01((float) (R - d + 0.5));
            float inner = clamp01((float) (R - T - d + 0.5));
            return outer - inner;
        });
    }

    // ------------------------------------------------------------------ shapes

    public static void rect(float x, float y, float w, float h, int color) {
        pushPx();
        fillPx(p(x), p(y), p(x + w), p(y + h), mul(color));
        popPx();
    }

    /** Vertical gradient (top color to bottom color). */
    public static void gradientV(float x, float y, float w, float h, int top, int bottom) {
        if (w <= 0 || h <= 0) return;
        pushPx();
        ctx.fillGradient(p(x), p(y), p(x + w), p(y + h), mul(top), mul(bottom));
        elements++;
        popPx();
    }

    /** Anti-aliased filled rounded rectangle. */
    public static void roundRect(float x, float y, float w, float h, float r, int color) {
        if (w <= 0 || h <= 0) return;
        int c = mul(color);
        if ((c >>> 24) == 0) return;
        int x0 = p(x), y0 = p(y), x1 = p(x + w), y1 = p(y + h);
        int R = Math.min(Math.round(r * k), Math.min(x1 - x0, y1 - y0) / 2);
        pushPx();
        if (R <= 0) {
            fillPx(x0, y0, x1, y1, c);
        } else {
            Identifier t = disc(R);
            int s = 2 * R;
            texPx(t, x0, y0, R, R, 0, 0, s, s, c);
            texPx(t, x1 - R, y0, R, R, R, 0, s, s, c);
            texPx(t, x0, y1 - R, R, R, 0, R, s, s, c);
            texPx(t, x1 - R, y1 - R, R, R, R, R, s, s, c);
            fillPx(x0 + R, y0, x1 - R, y0 + R, c);
            fillPx(x0, y0 + R, x1, y1 - R, c);
            fillPx(x0 + R, y1 - R, x1 - R, y1, c);
        }
        popPx();
    }

    /** Anti-aliased rounded outline; thickness is at least one pixel. */
    public static void roundOutline(float x, float y, float w, float h, float r, float thick, int color) {
        if (w <= 0 || h <= 0) return;
        int c = mul(color);
        if ((c >>> 24) == 0) return;
        int x0 = p(x), y0 = p(y), x1 = p(x + w), y1 = p(y + h);
        int T = Math.max(1, Math.round(thick * k));
        int R = Math.max(T + 1, Math.min(Math.round(r * k), Math.min(x1 - x0, y1 - y0) / 2));
        pushPx();
        Identifier t = ring(R, T);
        int s = 2 * R;
        texPx(t, x0, y0, R, R, 0, 0, s, s, c);
        texPx(t, x1 - R, y0, R, R, R, 0, s, s, c);
        texPx(t, x0, y1 - R, R, R, 0, R, s, s, c);
        texPx(t, x1 - R, y1 - R, R, R, R, R, s, s, c);
        fillPx(x0 + R, y0, x1 - R, y0 + T, c);
        fillPx(x0 + R, y1 - T, x1 - R, y1, c);
        fillPx(x0, y0 + R, x0 + T, y1 - R, c);
        fillPx(x1 - T, y0 + R, x1, y1 - R, c);
        popPx();
    }

    /** Anti-aliased filled circle. */
    public static void circle(float cx, float cy, float r, int color) {
        int c = mul(color);
        if ((c >>> 24) == 0) return;
        int R = Math.max(1, Math.round(r * k));
        pushPx();
        texPx(disc(R), p(cx) - R, p(cy) - R, 2 * R, 2 * R, 0, 0, 2 * R, 2 * R, c);
        popPx();
    }

    /** Thick line with round caps (drawn as a chain of anti-aliased discs; meant for short strokes). */
    public static void line(float ax, float ay, float bx, float by, float thick, int color) {
        float len = (float) Math.hypot(bx - ax, by - ay);
        float r = Math.max(0.3f, thick / 2f);
        int steps = Math.max(1, (int) Math.ceil(len / Math.max(0.25f, r * 0.6f)));
        for (int i = 0; i <= steps; i++) {
            float t = i / (float) steps;
            circle(ax + (bx - ax) * t, ay + (by - ay) * t, r, color);
        }
    }

    /** Anti-aliased circle outline. */
    public static void ring(float cx, float cy, float r, float thick, int color) {
        int c = mul(color);
        if ((c >>> 24) == 0) return;
        int R = Math.max(2, Math.round(r * k));
        int T = Math.max(1, Math.round(thick * k));
        pushPx();
        texPx(ring(R, T), p(cx) - R, p(cy) - R, 2 * R, 2 * R, 0, 0, 2 * R, 2 * R, c);
        popPx();
    }

    // ------------------------------------------------------------------ icons (cached vector drawings)

    /** Small vector canvas in pixel coordinates used to bake icons into textures. */
    public static final class Canvas {
        final int size;
        final float[] cov;

        Canvas(int size) {
            this.size = size;
            this.cov = new float[size * size];
        }

        public void line(float ax, float ay, float bx, float by, float thick) {
            float hw = thick / 2f;
            float vx = bx - ax, vy = by - ay;
            float len2 = vx * vx + vy * vy;
            for (int y = 0; y < size; y++) {
                for (int x = 0; x < size; x++) {
                    float qx = x + 0.5f - ax, qy = y + 0.5f - ay;
                    float t = len2 == 0 ? 0 : clamp01((qx * vx + qy * vy) / len2);
                    float dx = qx - vx * t, dy = qy - vy * t;
                    put(x, y, hw - (float) Math.sqrt(dx * dx + dy * dy) + 0.5f);
                }
            }
        }

        public void disc(float cx, float cy, float r) {
            for (int y = 0; y < size; y++) {
                for (int x = 0; x < size; x++) put(x, y, r - (float) Math.hypot(x + 0.5f - cx, y + 0.5f - cy) + 0.5f);
            }
        }

        public void ring(float cx, float cy, float r, float t) {
            for (int y = 0; y < size; y++) {
                for (int x = 0; x < size; x++) {
                    float d = (float) Math.hypot(x + 0.5f - cx, y + 0.5f - cy);
                    put(x, y, Math.min(r - d + 0.5f, d - (r - t) + 0.5f));
                }
            }
        }

        private void put(int x, int y, float c) {
            c = clamp01(c);
            int i = y * size + x;
            if (c > cov[i]) cov[i] = c;
        }
    }

    public interface Painter {
        void paint(Canvas c, float s);
    }

    /**
     * Draws a cached icon centered on (cx, cy). The painter works in a 16x16 design box scaled by {@code s}.
     */
    public static void icon(String key, float cx, float cy, float sizeUnits, int color, Painter painter) {
        int c = mul(color);
        if ((c >>> 24) == 0) return;
        int px = Math.max(4, Math.round(sizeUnits * k));
        Identifier id = TEXTURES.get("i" + key + "_" + px);
        if (id == null) {
            Canvas canvas = new Canvas(px);
            painter.paint(canvas, px / 16f);
            id = shapeTexture("i" + key + "_" + px, px, px, (x, y) -> canvas.cov[y * px + x]);
        }
        pushPx();
        texPx(id, p(cx) - px / 2, p(cy) - px / 2, px, px, 0, 0, px, px, c);
        popPx();
    }

    private static NativeImage avatarSource;
    private static boolean avatarFailed;

    /**
     * Draws a picture from the mod resources with rounded corners. It is downscaled on the CPU with
     * area averaging to the exact pixel size once (cached), so it stays smooth and sharp.
     */
    public static void picture(Identifier resource, float x, float y, float size, float radius) {
        int px = Math.max(4, Math.round(size * k));
        int rpx = Math.round(radius * k);
        String key = "pic" + resource + "_" + px + "_" + rpx;
        Identifier id = TEXTURES.get(key);
        if (id == null) {
            if (avatarSource == null && !avatarFailed) {
                try (var in = MinecraftClient.getInstance().getResourceManager().getResource(resource).orElseThrow().getInputStream()) {
                    avatarSource = NativeImage.read(in);
                } catch (Exception e) {
                    avatarFailed = true;
                }
            }
            if (avatarSource == null) return;
            NativeImage srcImg = avatarSource;
            int sw = srcImg.getWidth(), sh = srcImg.getHeight();
            NativeImage img = new NativeImage(px, px, false);
            for (int ty = 0; ty < px; ty++) {
                int y0 = ty * sh / px, y1 = Math.max(y0 + 1, (ty + 1) * sh / px);
                for (int tx = 0; tx < px; tx++) {
                    int x0 = tx * sw / px, x1 = Math.max(x0 + 1, (tx + 1) * sw / px);
                    long r = 0, g = 0, b = 0, n = 0;
                    for (int yy = y0; yy < y1; yy++) {
                        for (int xx = x0; xx < x1; xx++) {
                            int c = srcImg.getColorArgb(xx, yy);
                            r += (c >> 16) & 255;
                            g += (c >> 8) & 255;
                            b += c & 255;
                            n++;
                        }
                    }
                    int a = Math.round(roundedCoverage(tx, ty, px, px, rpx) * 255);
                    img.setColorArgb(tx, ty, (a << 24) | ((int) (r / n) << 16) | ((int) (g / n) << 8) | (int) (b / n));
                }
            }
            id = Identifier.of("dexnewyear", "dyn/" + (texCounter++));
            final String name = "dexnewyear " + key;
            MinecraftClient.getInstance().getTextureManager().registerTexture(id, new NativeImageBackedTexture(() -> name, img));
            TEXTURES.put(key, id);
        }
        pushPx();
        texPx(id, p(x), p(y), px, px, 0, 0, px, px, mul(0xFFFFFFFF));
        popPx();
    }

    /** Player face from the skin (pixel-exact). */
    public static void head(net.minecraft.entity.player.SkinTextures skin, float x, float y, float size) {
        pushPx();
        net.minecraft.client.gui.PlayerSkinDrawer.draw(ctx, skin, p(x), p(y), Math.max(8, Math.round(size * k)), mul(0xFFFFFFFF));
        elements += 2;
        popPx();
    }

    // ------------------------------------------------------------------ procedural images (color picker)

    public interface Pixels {
        int argb(int x, int y, int w, int h);
    }

    private static final Map<String, NativeImageBackedTexture> DYN = new HashMap<>();
    private static final Map<String, String> DYN_VERSION = new HashMap<>();
    private static final Map<String, Identifier> DYN_ID = new HashMap<>();

    /** Draws an image generated pixel by pixel; regenerated only when {@code version} or size changes. */
    public static void image(String key, String version, float x, float y, float w, float h, Pixels gen) {
        image(key, version, x, y, w, h, 1, gen);
    }

    /** Same, but the image is generated at 1/{@code down} resolution and stretched (for soft, large overlays). */
    public static void image(String key, String version, float x, float y, float w, float h, int down, Pixels gen) {
        int x0 = p(x), y0 = p(y), fullW = p(x + w) - x0, fullH = p(y + h) - y0;
        int W = Math.max(1, fullW / down), H = Math.max(1, fullH / down);
        if (W <= 0 || H <= 0) return;
        String ver = version + "@" + W + "x" + H;
        NativeImageBackedTexture tex = DYN.get(key);
        Identifier id = DYN_ID.get(key);
        boolean sizeOk = tex != null && tex.getImage() != null && tex.getImage().getWidth() == W && tex.getImage().getHeight() == H;
        if (!sizeOk) {
            if (id != null) MinecraftClient.getInstance().getTextureManager().destroyTexture(id);
            NativeImage img = new NativeImage(W, H, false);
            final String name = "dexnewyear " + key;
            tex = new NativeImageBackedTexture(() -> name, img);
            id = Identifier.of("dexnewyear", "dyn/img_" + (texCounter++));
            MinecraftClient.getInstance().getTextureManager().registerTexture(id, tex);
            DYN.put(key, tex);
            DYN_ID.put(key, id);
            DYN_VERSION.remove(key);
        }
        if (!ver.equals(DYN_VERSION.get(key))) {
            NativeImage img = tex.getImage();
            for (int yy = 0; yy < H; yy++) for (int xx = 0; xx < W; xx++) img.setColorArgb(xx, yy, gen.argb(xx, yy, W, H));
            tex.upload();
            DYN_VERSION.put(key, ver);
        }
        pushPx();
        if (fullW <= 0 || fullH <= 0) {
            popPx();
            return;
        }
        ctx.drawTexture(net.minecraft.client.gl.RenderPipelines.GUI_TEXTURED, id, x0, y0, 0, 0, fullW, fullH, W, H, W, H, mul(0xFFFFFFFF));
        elements++;
        popPx();
    }

    /** Frees a generated image (e.g. a melted snow drift). */
    public static void disposeImage(String key) {
        Identifier id = DYN_ID.remove(key);
        DYN.remove(key);
        DYN_VERSION.remove(key);
        if (id != null) MinecraftClient.getInstance().getTextureManager().destroyTexture(id);
    }

    /** Coverage of a rounded rectangle of size w x h px with radius r px at pixel (x, y) (used to round images). */
    public static float roundedCoverage(int x, int y, int w, int h, float r) {
        float cx = Math.max(r, Math.min(w - r, x + 0.5f));
        float cy = Math.max(r, Math.min(h - r, y + 0.5f));
        float d = (float) Math.hypot(x + 0.5f - cx, y + 0.5f - cy);
        return clamp01(r - d + 0.5f);
    }

    // ------------------------------------------------------------------ text

    private static int fontPx(Font f) {
        return Math.max(5, Math.min(72, Math.round(f.size * k)));
    }

    private static Text text(String s, Font f) {
        int w = f.weight == 'm' ? 0 : (f.weight == 's' ? 1 : 2);
        return Text.literal(s).setStyle(Style.EMPTY.withFont(new StyleSpriteSource.Font(FONT_IDS[w][fontPx(f)])));
    }

    private static TextRenderer tr() {
        return MinecraftClient.getInstance().textRenderer;
    }

    /** Text width in units. */
    public static float width(String s, Font f) {
        return tr().getWidth(text(s, f)) / k;
    }

    /** Draws text so that the middle of its capital letters sits on {@code cy}. */
    public static void textMid(String s, Font f, float x, float cy, int color) {
        int c = mul(color);
        if ((c >>> 24) < 4) return;
        int n = fontPx(f);
        int yPx = Math.round(cy * k - 7f + 0.364f * n);
        pushPx();
        ctx.drawText(tr(), text(s, f), p(x), yPx, c, false);
        elements++;
        popPx();
    }

    public static void textMidCentered(String s, Font f, float cx, float cy, int color) {
        textMid(s, f, cx - width(s, f) / 2f, cy, color);
    }

    public static void textMidRight(String s, Font f, float rx, float cy, int color) {
        textMid(s, f, rx - width(s, f), cy, color);
    }

    /** Shortens the string with an ellipsis so it fits {@code max} units. */
    public static String fit(String s, Font f, float max) {
        if (width(s, f) <= max) return s;
        while (s.length() > 1 && width(s + "…", f) > max) s = s.substring(0, s.length() - 1);
        return s + "…";
    }

    static float clamp01(float v) {
        return v < 0 ? 0 : (v > 1 ? 1 : v);
    }
}
