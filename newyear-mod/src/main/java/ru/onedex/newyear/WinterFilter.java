package ru.onedex.newyear;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.R2D;

/** Winter filter: snowy grass/leaves, cold color tint and frosted screen edges. */
public final class WinterFilter {
    private WinterFilter() {}

    private static boolean lastSnowy;

    public static boolean snowyColors() {
        NyConfig c = NyConfig.INSTANCE;
        return c.winterFilter && c.snowyGrass;
    }

    /** Blends a biome color towards snowy white. */
    public static int snowy(int color, float amount) {
        int r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
        int tr = 236, tg = 242, tb = 246;
        r = Math.round(r + (tr - r) * amount);
        g = Math.round(g + (tg - g) * amount);
        b = Math.round(b + (tb - b) * amount);
        return (color & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    /** Rebuilds chunks when the snowy colors are switched so the change is visible at once. */
    public static void tick(MinecraftClient mc) {
        boolean now = snowyColors();
        if (now != lastSnowy) {
            lastSnowy = now;
            if (mc.worldRenderer != null && mc.world != null) mc.worldRenderer.reload();
        }
    }

    public static void init() {
        lastSnowy = snowyColors();
    }

    /** HUD layer under everything else: cold tint and frost on the screen edges. */
    public static void renderOverlay(DrawContext ctx, RenderTickCounter counter) {
        NyConfig c = NyConfig.INSTANCE;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (!c.winterFilter || mc.player == null || mc.options.hudHidden) return;
        R2D.begin(ctx);
        int w = ctx.getScaledWindowWidth(), h = ctx.getScaledWindowHeight();
        if (c.coldTint > 0.01f) {
            R2D.rect(0, 0, w, h, R2D.withAlpha(0xFF8CC4FF, c.coldTint * 0.13f));
        }
        if (c.frostEdges) {
            // generated once per window size at half resolution (soft, so the upscale is invisible)
            R2D.image("frost", "v2", 0, 0, w, h, 2, WinterFilter::frostPixel);
        }
    }

    private static int frostPixel(int x, int y, int W, int H) {
        float edge = Math.min(Math.min(x, W - 1 - x) / (float) W, Math.min(y, H - 1 - y) / (float) H * (H / (float) W));
        float scale = 0.055f;
        float n = fbm(x * 0.09f, y * 0.09f);
        float crystals = (float) Math.pow(Math.abs(fbm(x * 0.35f + 40, y * 0.35f + 17) * 2 - 1), 3);
        float d = edge / scale + (n - 0.5f) * 0.9f;
        float a = Math.max(0, 1 - d);
        a = a * a * (0.55f + crystals * 0.5f);
        a = Math.min(0.6f, a * 0.8f);
        int alpha = Math.round(a * 255);
        return (alpha << 24) | 0xE6F4FF;
    }

    private static float fbm(float x, float y) {
        return noise(x, y) * 0.6f + noise(x * 2.1f + 13, y * 2.1f + 7) * 0.3f + noise(x * 4.3f + 3, y * 4.3f + 29) * 0.1f;
    }

    private static float noise(float x, float y) {
        int xi = (int) Math.floor(x), yi = (int) Math.floor(y);
        float xf = x - xi, yf = y - yi;
        float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        float a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
        return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }

    private static float hash(int x, int y) {
        int h = x * 374761393 + y * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) & 0xFFFF) / 65535f;
    }
}
