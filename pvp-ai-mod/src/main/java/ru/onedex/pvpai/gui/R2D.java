package ru.onedex.pvpai.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Style;
import net.minecraft.text.StyleSpriteSource;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

/**
 * Small 2D toolkit: anti-aliased rounded rectangles, circles and lines drawn at real
 * screen-pixel resolution, plus crisp TrueType text (Inter) instead of the Minecraft font.
 */
public final class R2D {
    private R2D() {}

    private static DrawContext ctx;
    private static int scale = 2;
    /** Global opacity multiplier (used by open/close animation). */
    public static float alpha = 1f;

    public enum Font {
        M7("m7", 7), M8("m8", 8), S9("s9", 9), S11("s11", 11), B20("b20", 20);

        final String id;
        final float size;

        Font(String id, float size) {
            this.id = id;
            this.size = size;
        }
    }

    private static final Identifier[][] FONT_IDS = new Identifier[Font.values().length][7];

    static {
        for (Font f : Font.values()) {
            for (int s = 1; s <= 6; s++) FONT_IDS[f.ordinal()][s] = Identifier.of("dexpvpai", f.id + "_" + s);
        }
    }

    public static void begin(DrawContext context) {
        ctx = context;
        scale = Math.max(1, MinecraftClient.getInstance().getWindow().getScaleFactor());
        alpha = 1f;
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

    private static int mul(int color, float cov) {
        return withAlpha(color, cov * alpha);
    }

    // ------------------------------------------------------------------ pixel space

    private static void pushPx() {
        ctx.getMatrices().pushMatrix();
        ctx.getMatrices().scale(1f / scale, 1f / scale);
    }

    private static void popPx() {
        ctx.getMatrices().popMatrix();
    }

    private static void px(int x1, int y1, int x2, int y2, int color, float cov) {
        if (x2 <= x1 || y2 <= y1) return;
        int c = mul(color, cov);
        if ((c >>> 24) == 0) return;
        ctx.fill(x1, y1, x2, y2, c);
    }

    public static void rect(float x, float y, float w, float h, int color) {
        pushPx();
        px(Math.round(x * scale), Math.round(y * scale), Math.round((x + w) * scale), Math.round((y + h) * scale), color, 1f);
        popPx();
    }

    /** Vertical gradient (top color to bottom color). */
    public static void gradientV(float x, float y, float w, float h, int top, int bottom) {
        if (w <= 0 || h <= 0) return;
        pushPx();
        ctx.fillGradient(Math.round(x * scale), Math.round(y * scale), Math.round((x + w) * scale), Math.round((y + h) * scale),
                mul(top, 1f), mul(bottom, 1f));
        popPx();
    }

    /** Anti-aliased filled rounded rectangle. */
    public static void roundRect(float x, float y, float w, float h, float r, int color) {
        if (w <= 0 || h <= 0) return;
        pushPx();
        int x0 = Math.round(x * scale), y0 = Math.round(y * scale);
        int x1 = Math.round((x + w) * scale), y1 = Math.round((y + h) * scale);
        float R = Math.min(r * scale, Math.min(x1 - x0, y1 - y0) / 2f);
        int rc = (int) Math.ceil(R);
        if (rc <= 0) {
            px(x0, y0, x1, y1, color, 1f);
            popPx();
            return;
        }
        px(x0, y0 + rc, x1, y1 - rc, color, 1f);
        float cxL = x0 + R, cxR = x1 - R;
        for (int j = 0; j < rc; j++) {
            int pyTop = y0 + j;
            int pyBot = y1 - 1 - j;
            float cyTop = y0 + R;
            float dy = Math.max(0, cyTop - (pyTop + 0.5f));
            // left partial pixels until full coverage
            int k = 0;
            for (; k < rc; k++) {
                float dx = Math.max(0, cxL - (x0 + k + 0.5f));
                float cov = clamp01(R - (float) Math.sqrt(dx * dx + dy * dy) + 0.5f);
                if (cov >= 0.999f) break;
                if (cov > 0.002f) {
                    px(x0 + k, pyTop, x0 + k + 1, pyTop + 1, color, cov);
                    px(x1 - 1 - k, pyTop, x1 - k, pyTop + 1, color, cov);
                    if (pyBot != pyTop) {
                        px(x0 + k, pyBot, x0 + k + 1, pyBot + 1, color, cov);
                        px(x1 - 1 - k, pyBot, x1 - k, pyBot + 1, color, cov);
                    }
                }
            }
            px(x0 + k, pyTop, x1 - k, pyTop + 1, color, 1f);
            if (pyBot != pyTop) px(x0 + k, pyBot, x1 - k, pyBot + 1, color, 1f);
        }
        popPx();
    }

    /** Anti-aliased rounded outline of the given thickness (in GUI units). */
    public static void roundOutline(float x, float y, float w, float h, float r, float thick, int color) {
        if (w <= 0 || h <= 0) return;
        pushPx();
        int x0 = Math.round(x * scale), y0 = Math.round(y * scale);
        int x1 = Math.round((x + w) * scale), y1 = Math.round((y + h) * scale);
        int t = Math.max(1, Math.round(thick * scale));
        float R = Math.min(r * scale, Math.min(x1 - x0, y1 - y0) / 2f);
        float Ri = Math.max(0, R - t);
        int rc = (int) Math.ceil(R);
        int edge = Math.max(rc, t);
        // straight parts
        px(x0 + edge, y0, x1 - edge, y0 + t, color, 1f);
        px(x0 + edge, y1 - t, x1 - edge, y1, color, 1f);
        px(x0, y0 + edge, x0 + t, y1 - edge, color, 1f);
        px(x1 - t, y0 + edge, x1, y1 - edge, color, 1f);
        // corners
        for (int j = 0; j < edge; j++) {
            for (int i = 0; i < edge; i++) {
                float dx = Math.max(0, x0 + R - (x0 + i + 0.5f));
                float dy = Math.max(0, y0 + R - (y0 + j + 0.5f));
                float d = (float) Math.sqrt(dx * dx + dy * dy);
                float outer = clamp01(R - d + 0.5f);
                float inner;
                if (Ri > 0) inner = clamp01(Ri - d + 0.5f);
                else inner = 0;
                // inner rect boundary for pixels outside the arc zone
                boolean insideInnerRect = i >= t && j >= t;
                if (!insideInnerRect) inner = 0;
                else if (dx == 0 && dy == 0) inner = 1;
                float cov = outer - inner;
                if (cov <= 0.002f) continue;
                px(x0 + i, y0 + j, x0 + i + 1, y0 + j + 1, color, cov);
                px(x1 - 1 - i, y0 + j, x1 - i, y0 + j + 1, color, cov);
                px(x0 + i, y1 - 1 - j, x0 + i + 1, y1 - j, color, cov);
                px(x1 - 1 - i, y1 - 1 - j, x1 - i, y1 - j, color, cov);
            }
        }
        popPx();
    }

    /** Anti-aliased filled circle. */
    public static void circle(float cx, float cy, float r, int color) {
        pushPx();
        float CX = cx * scale, CY = cy * scale, Rr = r * scale;
        int yA = (int) Math.floor(CY - Rr), yB = (int) Math.ceil(CY + Rr);
        int xA = (int) Math.floor(CX - Rr), xB = (int) Math.ceil(CX + Rr);
        for (int py = yA; py < yB; py++) {
            int runStart = -1;
            for (int pxl = xA; pxl <= xB; pxl++) {
                float cov = pxl == xB ? 0 : clamp01(Rr - (float) Math.hypot(pxl + 0.5f - CX, py + 0.5f - CY) + 0.5f);
                if (cov >= 0.999f) {
                    if (runStart < 0) runStart = pxl;
                    continue;
                }
                if (runStart >= 0) {
                    px(runStart, py, pxl, py + 1, color, 1f);
                    runStart = -1;
                }
                if (cov > 0.002f) px(pxl, py, pxl + 1, py + 1, color, cov);
            }
        }
        popPx();
    }

    /** Anti-aliased line segment with round caps. */
    public static void line(float ax, float ay, float bx, float by, float thick, int color) {
        pushPx();
        float AX = ax * scale, AY = ay * scale, BX = bx * scale, BY = by * scale, hw = thick * scale / 2f;
        int xA = (int) Math.floor(Math.min(AX, BX) - hw - 1), xB = (int) Math.ceil(Math.max(AX, BX) + hw + 1);
        int yA = (int) Math.floor(Math.min(AY, BY) - hw - 1), yB = (int) Math.ceil(Math.max(AY, BY) + hw + 1);
        float vx = BX - AX, vy = BY - AY;
        float len2 = vx * vx + vy * vy;
        for (int py = yA; py < yB; py++) {
            for (int pxl = xA; pxl < xB; pxl++) {
                float qx = pxl + 0.5f - AX, qy = py + 0.5f - AY;
                float t = len2 == 0 ? 0 : clamp01((qx * vx + qy * vy) / len2);
                float dx = qx - vx * t, dy = qy - vy * t;
                float cov = clamp01(hw - (float) Math.sqrt(dx * dx + dy * dy) + 0.5f);
                if (cov > 0.002f) px(pxl, py, pxl + 1, py + 1, color, cov);
            }
        }
        popPx();
    }

    /** Soft shadow made of stacked translucent rounded rects. */
    public static void shadow(float x, float y, float w, float h, float r, float spread, int color) {
        int steps = 6;
        for (int i = steps; i >= 1; i--) {
            float s = spread * i / steps;
            roundRect(x - s, y - s + spread * 0.25f, w + s * 2, h + s * 2, r + s, withAlpha(color, 1f / (steps + 2)));
        }
    }

    // ------------------------------------------------------------------ text

    public static Text text(String s, Font f) {
        int sc = Math.min(6, Math.max(1, scale));
        return Text.literal(s).setStyle(Style.EMPTY.withFont(new StyleSpriteSource.Font(FONT_IDS[f.ordinal()][sc])));
    }

    public static float width(String s, Font f) {
        return tr().getWidth(text(s, f));
    }

    private static TextRenderer tr() {
        return MinecraftClient.getInstance().textRenderer;
    }

    /** Draws text so that the middle of its capital letters sits on {@code cy}. */
    public static void textMid(String s, Font f, float x, float cy, int color) {
        int c = withAlpha(color, alpha);
        if ((c >>> 24) < 4) return;
        float y = cy - 7f + 0.364f * f.size;
        ctx.drawText(tr(), text(s, f), Math.round(x), Math.round(y), c, false);
    }

    public static void textMidCentered(String s, Font f, float cx, float cy, int color) {
        textMid(s, f, cx - width(s, f) / 2f, cy, color);
    }

    public static void textMidRight(String s, Font f, float rx, float cy, int color) {
        textMid(s, f, rx - width(s, f), cy, color);
    }

    public static int scale() {
        return scale;
    }

    private static float clamp01(float v) {
        return v < 0 ? 0 : (v > 1 ? 1 : v);
    }
}
