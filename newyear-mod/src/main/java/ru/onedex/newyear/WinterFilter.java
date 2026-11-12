package ru.onedex.newyear;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.R2D;

/** Winter filter: snowy grass/leaves and a cold color tint. */
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

    /** HUD layer under everything else: cold color tint. */
    public static void renderOverlay(DrawContext ctx, RenderTickCounter counter) {
        NyConfig c = NyConfig.INSTANCE;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (!c.winterFilter || mc.player == null || mc.options.hudHidden) return;
        R2D.begin(ctx);
        int w = ctx.getScaledWindowWidth(), h = ctx.getScaledWindowHeight();
        if (c.coldTint > 0.01f) {
            R2D.rect(0, 0, w, h, R2D.withAlpha(0xFF8CC4FF, c.coldTint * 0.13f));
        }
    }
}
