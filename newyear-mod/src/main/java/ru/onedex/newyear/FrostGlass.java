package ru.onedex.newyear;

import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.CampfireBlock;
import net.minecraft.block.AbstractFurnaceBlock;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.R2D;

import java.util.Random;

/**
 * Frost on the "glass" of the screen: fern-like ice crystals slowly grow in from the corners and edges
 * while the player is out in the cold or under falling snow, and melt again near a fire or in a warm place.
 */
public final class FrostGlass {
    private FrostGlass() {}

    /** Current amount of frost, 0..1 (how far the crystals have grown in). */
    private static float level;
    private static float target;
    private static int warmTicks;

    // generated pattern for the current overlay size: when each pixel appears (0..1) and how solid it is
    private static int patW, patH;
    private static float[] grow, alpha, glow, glowGrow;
    /** Pattern scale: 1 at 360 px of pattern height. */
    private static float sc = 1;

    public static void tick(MinecraftClient mc) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.frostGlass || mc.world == null || mc.player == null) {
            level = Math.max(0, level - 0.02f);
            return;
        }
        if (mc.isPaused()) return;
        World w = mc.world;
        BlockPos eye = BlockPos.ofFloored(mc.player.getEyePos());
        boolean overworldSky = w.getDimension().hasSkyLight() && !w.getDimension().hasCeiling();
        boolean sky = overworldSky && w.isSkyVisible(eye);
        boolean cold = overworldSky && w.getBiome(eye).value().isCold(eye, w.getSeaLevel());
        boolean snowing = sky && (c.snowfall || (cold && w.isRaining()));
        boolean heat = nearHeat(w, mc.player.getBlockPos());
        boolean hot = w.getRegistryKey() == World.NETHER || w.getBiome(eye).value().getTemperature() >= 1.5f;
        if (heat) warmTicks = 60; else if (warmTicks > 0) warmTicks--;

        if (warmTicks > 0 || hot || mc.player.isSubmergedIn(FluidTags.LAVA)) target = 0;
        else if (snowing) target = 0.85f;
        else if (cold) target = sky ? 0.62f : 0.45f;
        else target = 0;
        if (ru.onedex.newyear.NewYearClient.DEV && Boolean.getBoolean("dexnewyear.frostfull")) target = 1;

        if (level < target) level = Math.min(target, level + 1f / (20 * 45));        // ~45 s to freeze over
        else level = Math.max(target, level - (warmTicks > 0 ? 1f / (20 * 6) : 1f / (20 * 15)));
    }

    private static boolean nearHeat(World w, BlockPos center) {
        BlockPos.Mutable p = new BlockPos.Mutable();
        for (int dx = -4; dx <= 4; dx++) {
            for (int dy = -2; dy <= 3; dy++) {
                for (int dz = -4; dz <= 4; dz++) {
                    p.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
                    BlockState s = w.getBlockState(p);
                    if (s.isAir()) continue;
                    if (s.isOf(Blocks.FIRE) || s.isOf(Blocks.SOUL_FIRE) || s.isOf(Blocks.LAVA) || s.isOf(Blocks.MAGMA_BLOCK)
                            || s.isOf(Blocks.LAVA_CAULDRON)) return true;
                    if (s.getBlock() instanceof CampfireBlock && s.get(CampfireBlock.LIT)) return true;
                    if (s.getBlock() instanceof AbstractFurnaceBlock && s.get(AbstractFurnaceBlock.LIT)) return true;
                }
            }
        }
        return false;
    }

    public static void render(DrawContext ctx, RenderTickCounter counter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (level <= 0.003f || mc.player == null) return;
        R2D.begin(ctx);
        int w = ctx.getScaledWindowWidth(), h = ctx.getScaledWindowHeight();
        int step = Math.round(level * 60);
        // the pattern is made at about 540 px height and smoothly stretched to the screen
        int down = Math.max(1, Math.round(mc.getWindow().getFramebufferHeight() / 540f));
        R2D.image("frost_glass", "g" + step, 0, 0, w, h, down, (x, y, W, H) -> pixel(x, y, W, H, step / 60f));
    }

    private static int pixel(int x, int y, int W, int H, float lv) {
        if (W != patW || H != patH || grow == null) generate(W, H);
        int i = y * W + x;
        float g = grow[i];
        // crystals appear smoothly when the frost reaches them
        float vis = Math.max(0, Math.min(1, (lv - g) / 0.05f));
        float a = alpha[i] * vis;
        // soft icy glow around the crystals
        float gv = Math.max(0, Math.min(1, (lv - glowGrow[i]) / 0.08f));
        a = Math.min(1, a + glow[i] * gv * 0.35f);
        // frosty haze close to the edges
        float edge = Math.min(Math.min(x, W - 1 - x), Math.min(y, H - 1 - y)) / (Math.min(W, H) * 0.5f);
        float haze = Math.max(0, 1 - edge / (0.06f + 0.32f * lv * lv));
        haze = haze * haze * 0.42f * Math.min(1, lv * 2.5f) * (0.75f + 0.5f * noise(x * 0.045f, y * 0.045f));
        a = Math.min(0.92f, a + haze * (1 - a));
        int al = Math.round(a * 255);
        if (al <= 0) return 0;
        // a bit of blue in thin parts, white in thick ones
        int r = Math.round(214 + 41 * a), gg = Math.round(232 + 23 * a);
        return (al << 24) | (r << 16) | (gg << 8) | 255;
    }

    // ------------------------------------------------------------------ crystal pattern

    private static void generate(int W, int H) {
        patW = W;
        patH = H;
        grow = new float[W * H];
        alpha = new float[W * H];
        java.util.Arrays.fill(grow, 2f);
        sc = H / 360f;
        Random rnd = new Random(1337L + W * 31L + H);
        float reach = Math.min(W, H) * 0.42f;
        int perim = 2 * (W + H);
        // fern-like crystals from the edges, longer and leaning inwards in the corners
        float pos = 0;
        while (pos < perim) {
            pos += (10 + rnd.nextFloat() * 22) * sc;
            float[] e = edgePoint(pos % perim, W, H);
            float sx = e[0], sy = e[1], ang = e[2];
            float cdx = Math.min(sx, W - 1 - sx) / (W * 0.5f), cdy = Math.min(sy, H - 1 - sy) / (H * 0.5f);
            float corner = 1 - Math.min(1, (float) Math.hypot(Math.min(cdx, 1), Math.min(cdy, 1)) * 1.05f);
            float len = reach * (0.12f + 0.22f * rnd.nextFloat() + 0.7f * corner * corner);
            float toMid = (float) Math.toDegrees(Math.atan2(H / 2f - sy, W / 2f - sx));
            float a0 = lerpAngle(ang, toMid, 0.3f + 0.4f * corner) + (rnd.nextFloat() - 0.5f) * 70;
            branch(rnd, sx, sy, a0, len, 0, 0, reach, (0.75f + corner * 0.35f) * sc, 0.9f);
        }
        // a crust of tiny crystals right at the edges
        int crust = (int) (perim * 1.6f / sc);
        for (int i = 0; i < crust; i++) {
            float[] e = edgePoint(rnd.nextFloat() * perim, W, H);
            float in = (float) Math.abs(rnd.nextGaussian()) * 9 * sc;
            float rad = (float) Math.toRadians(e[2]);
            float x = e[0] + (float) Math.cos(rad) * in, y = e[1] + (float) Math.sin(rad) * in;
            branch(rnd, x, y, rnd.nextFloat() * 360, (3 + rnd.nextFloat() * 7) * sc, in, 2, reach, 0.6f * sc, 0.7f);
        }
        // glow: blurred crystals, visible as soon as a crystal nearby is
        int rad = Math.max(1, Math.round(2.2f * sc));
        glow = boxBlur(boxBlur(alpha, W, H, rad), W, H, rad);
        glowGrow = minFilter(grow, W, H, rad * 2);
    }

    private static float[] edgePoint(float p, int W, int H) {
        if (p < W) return new float[]{p, 0, 90};
        if (p < W + H) return new float[]{W - 1, p - W, 180};
        if (p < 2 * W + H) return new float[]{W - 1 - (p - W - H), H - 1, 270};
        return new float[]{0, H - 1 - (p - 2 * W - H), 0};
    }

    private static float lerpAngle(float a, float b, float t) {
        float d = ((b - a + 540) % 360) - 180;
        return a + d * t;
    }

    /** A feather-like crystal: a stem with short side branches on both sides at about 60 degrees. */
    private static void branch(Random rnd, float x, float y, float ang, float len, float start, int depth, float reach, float width, float strength) {
        float step = sc;
        float travelled = 0;
        float nextSide = (1.5f + rnd.nextFloat() * 1.5f) * sc;
        float curve = (rnd.nextFloat() - 0.5f) * 0.5f;
        while (travelled < len) {
            float rad = (float) Math.toRadians(ang);
            x += Math.cos(rad) * step;
            y += Math.sin(rad) * step;
            ang += curve + (rnd.nextFloat() - 0.5f) * 4f;
            travelled += step;
            if (x < -4 || y < -4 || x > patW + 4 || y > patH + 4) return;
            float t = (start + travelled) / reach;          // when this point freezes
            float taper = 1 - travelled / len * 0.6f;
            stamp(x, y, width * taper, strength * (0.7f + 0.3f * taper), t);
            if (depth < 2 && travelled >= nextSide) {
                nextSide = travelled + ((depth == 0 ? 2.2f : 2.8f) + rnd.nextFloat() * 2f) * sc;
                float rest = len - travelled;
                float sideLen = Math.min(rest * (0.45f + rnd.nextFloat() * 0.25f), (depth == 0 ? 26 : 9) * sc);
                if (sideLen > 2 * sc) {
                    for (int side = -1; side <= 1; side += 2) {
                        if (rnd.nextFloat() >= 0.85f) continue;
                        float sa = ang + side * (52 + rnd.nextFloat() * 14);
                        branch(rnd, x, y, sa, sideLen * (0.75f + rnd.nextFloat() * 0.3f), start + travelled, depth + 1, reach, width * 0.7f, strength * 0.75f);
                    }
                }
            }
        }
    }

    private static void stamp(float cx, float cy, float r, float a, float t) {
        int x0 = (int) Math.floor(cx - r - 1), x1 = (int) Math.ceil(cx + r + 1);
        int y0 = (int) Math.floor(cy - r - 1), y1 = (int) Math.ceil(cy + r + 1);
        for (int y = Math.max(0, y0); y <= Math.min(patH - 1, y1); y++) {
            for (int x = Math.max(0, x0); x <= Math.min(patW - 1, x1); x++) {
                float d = (float) Math.hypot(x + 0.5f - cx, y + 0.5f - cy);
                float cov = Math.max(0, Math.min(1, r + 0.5f - d));
                if (cov <= 0) continue;
                int i = y * patW + x;
                alpha[i] = Math.max(alpha[i], cov * a);
                grow[i] = Math.min(grow[i], t);
            }
        }
    }

    private static float[] boxBlur(float[] src, int W, int H, int r) {
        float[] tmp = new float[W * H], out = new float[W * H];
        for (int y = 0; y < H; y++) {
            float acc = 0;
            int row = y * W;
            for (int x = -r; x <= r; x++) acc += src[row + Math.max(0, Math.min(W - 1, x))];
            for (int x = 0; x < W; x++) {
                tmp[row + x] = acc / (2 * r + 1);
                acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
            }
        }
        for (int x = 0; x < W; x++) {
            float acc = 0;
            for (int y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
            for (int y = 0; y < H; y++) {
                out[y * W + x] = acc / (2 * r + 1);
                acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
            }
        }
        return out;
    }

    /** Smallest value in a square around every pixel. */
    private static float[] minFilter(float[] src, int W, int H, int r) {
        float[] tmp = new float[W * H], out = new float[W * H];
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                float m = 2;
                for (int k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) m = Math.min(m, src[y * W + k]);
                tmp[y * W + x] = m;
            }
        }
        for (int x = 0; x < W; x++) {
            for (int y = 0; y < H; y++) {
                float m = 2;
                for (int k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) m = Math.min(m, tmp[k * W + x]);
                out[y * W + x] = m;
            }
        }
        return out;
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
