package ru.onedex.newyear.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.sound.PositionedSoundInstance;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.Identifier;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.music.MusicFx;
import ru.onedex.newyear.render.Garland;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * A Christmas tree with twinkling lights and three presents under it, drawn on the New Year picture
 * of the main menu. Click a present: the lid flies off, confetti and sparkles burst out and a little
 * surprise pops up; a few seconds later the lid drops back on.
 */
public final class TitleGifts {
    private TitleGifts() {}

    private static final Identifier ATLAS = Identifier.of("dexnewyear", "textures/gui/tree_gifts.png");
    private static final Identifier GLOW = Identifier.of("dexnewyear", "textures/entity/glow.png");
    private static final Random RNG = new Random();

    /** A sprite of the atlas: atlas rect (u, v, w, h) and where it sits on the 1600x900 picture. */
    private record Spr(int u, int v, int w, int h, float x, float y, float dw, float dh) {
    }

    private static final Spr TREE = new Spr(0, 0, 566, 923, 229.5f, 295.5f, 283.0f, 461.5f);
    // presents, drawn back to front
    private static final Spr[] BODY = {
            new Spr(574, 385, 138, 92, 337.0f, 765.0f, 69.0f, 46.0f),
            new Spr(574, 0, 164, 109, 170.5f, 759.5f, 82.0f, 54.5f),
            new Spr(574, 176, 201, 129, 223.0f, 762.5f, 100.5f, 64.5f)};
    private static final Spr[] LID = {
            new Spr(574, 481, 153, 53, 333.0f, 756.0f, 76.5f, 26.5f),
            new Spr(574, 113, 180, 59, 166.5f, 749.0f, 90.0f, 29.5f),
            new Spr(574, 309, 217, 72, 219.0f, 748.0f, 108.5f, 36.0f)};
    private static final int[] RIBBON = {0xFFE1E4EC, 0xFFECBE3C, 0xFFCE202A};
    private static final float STAR_X = 370.77f, STAR_Y = 356.81f;
    private static final float[] LIGHTS = {
            354.85f, 661.93f, 291.31f, 642.24f, 400.53f, 509.24f, 463.79f, 625.28f, 407.42f, 615.99f, 374.46f, 594.18f,
            407.58f, 459.52f, 482.76f, 677.37f, 377.15f, 695.74f, 401.78f, 531.41f, 451.68f, 707.97f, 505.67f, 661.66f,
            295.17f, 615.24f, 338.4f, 541.55f, 313.65f, 503.18f, 337.74f, 505.98f, 430.39f, 500.7f, 363.97f, 414.81f,
            449.35f, 603.65f, 253.21f, 696.17f, 242.13f, 698.75f, 350.88f, 546.67f, 432.25f, 659.42f, 391.97f, 664.34f,
            381.2f, 399.11f, 492.48f, 674.87f, 293.93f, 713.4f, 341.37f, 618.64f, 499.13f, 589.8f};
    private static final Item[] SURPRISES = {
            Items.DIAMOND, Items.EMERALD, Items.GOLDEN_APPLE, Items.CAKE, Items.COOKIE, Items.SNOWBALL, Items.TOTEM_OF_UNDYING,
            Items.NETHER_STAR, Items.FIREWORK_ROCKET, Items.MUSIC_DISC_CAT, Items.SPRUCE_SAPLING, Items.ENCHANTED_GOLDEN_APPLE,
            Items.AMETHYST_SHARD, Items.HEART_OF_THE_SEA, Items.PUMPKIN_PIE, Items.GLOW_BERRIES};
    private static final int[] CONFETTI = {0xFFFF3B30, 0xFFFFCC00, 0xFF34C759, 0xFF0A84FF, 0xFFFF2D92, 0xFFFFFFFF, 0xFFFF9500, 0xFFAF52DE};

    /** 0 closed, 1 open (lid flew off), 2 lid dropping back. */
    private static final int[] state = new int[3];
    private static final long[] since = new long[3];
    private static final float[] lidVx = new float[3], lidVr = new float[3];
    private static final ItemStack[] surprise = new ItemStack[3];

    private static final class Bit {
        float x, y, vx, vy, age, life, w, h, spin, phase;
        int color;
        boolean star;
    }

    private static final List<Bit> bits = new ArrayList<>();
    private static long lastNanos = System.nanoTime();

    // transform of the picture: screen = off + image * scale (set by TitleBackground every frame)
    private static float offX, offY, scale = 1;

    static void setTransform(float x, float y, float s) {
        offX = x;
        offY = y;
        scale = s;
    }

    private static float sx(float ix) {
        return offX + ix * scale;
    }

    private static float sy(float iy) {
        return offY + iy * scale;
    }

    private static float sec(long since) {
        return (System.nanoTime() - since) / 1e9f;
    }

    public static boolean enabled() {
        NyConfig c = NyConfig.INSTANCE;
        return c.titleBackground && c.titleGifts;
    }

    // ------------------------------------------------------------------ drawing

    static void render(DrawContext ctx, int width, int height) {
        long now = System.nanoTime();
        float dt = Math.min(0.05f, (now - lastNanos) / 1e9f);
        lastNanos = now;
        MinecraftClient mc = MinecraftClient.getInstance();
        double mx = mc.mouse.getX() * width / Math.max(1, mc.getWindow().getWidth());
        double my = mc.mouse.getY() * height / Math.max(1, mc.getWindow().getHeight());
        float time = (now % 100_000_000_000L) / 1e9f;

        draw(TREE, 0, 0, 0, 0xFFFFFFFF);
        // twinkling lights on the tree
        long beat = MusicFx.garlandStep();
        long step = beat >= 0 ? beat : (long) (time / 0.55f);
        for (int i = 0; i < LIGHTS.length / 2; i++) {
            int col = Garland.COLORS[i % Garland.COLORS.length];
            boolean on = Math.floorMod(step + i, 3) != 0;
            float lv = on ? 0.8f + 0.2f * (float) Math.sin(time * 5 + i) : 0.18f;
            float x = sx(LIGHTS[i * 2]), y = sy(LIGHTS[i * 2 + 1]);
            float r = 9 * scale * (0.6f + 0.4f * lv);
            R2D.sprite(GLOW, x - r * 2, y - r * 2, r * 4, r * 4, 0, 0, 64, 64, false, R2D.withAlpha(col, 0.55f * lv));
            R2D.circle(x, y, Math.max(0.6f, 3.2f * scale), on ? R2D.lerpColor(col, 0xFFFFFFFF, 0.35f) : Garland.dim(col));
        }
        // the star breathes
        float sp = 0.75f + 0.25f * (float) Math.sin(time * 1.7f);
        float sr = 46 * scale * sp;
        R2D.sprite(GLOW, sx(STAR_X) - sr, sy(STAR_Y) - sr, sr * 2, sr * 2, 0, 0, 64, 64, false, R2D.withAlpha(0xFFFFD36A, 0.6f * sp));

        // presents
        for (int g = 0; g < 3; g++) {
            Spr b = BODY[g], l = LID[g];
            boolean hover = state[g] == 0 && hit(g, mx, my) && !overWidget(mc, mx, my);
            float wig = hover ? (float) Math.sin(time * 22) * 0.06f : 0;
            float px = b.x + b.dw / 2, py = b.y + b.dh;          // pivot: bottom center
            draw(b, wig, px, py, 0xFFFFFFFF);
            if (state[g] == 0) {
                draw(l, wig, px, py, 0xFFFFFFFF);
            } else if (state[g] == 1) {
                float t = sec(since[g]);
                // the lid flies up, tumbles and fades away
                float lx = lidVx[g] * t, ly = -560 * t + 640 * t * t;
                float a = Math.max(0, Math.min(1, (1.5f - t) / 0.5f));
                if (a > 0) drawMoved(l, lx, ly, lidVr[g] * t, a);
                drawSurprise(ctx, g, t);
                if (t > 4.5f) {
                    state[g] = 2;
                    since[g] = System.nanoTime();
                }
            } else {
                float t = sec(since[g]);
                // drops back on with a little bounce
                float d = Math.min(1, t / 0.35f);
                float off = -60 * (1 - d) * (1 - d);
                if (d >= 1) off = -6 * (float) Math.abs(Math.sin((t - 0.35f) * 14)) * Math.max(0, 1 - (t - 0.35f) / 0.4f);
                drawMoved(l, 0, off, 0, Math.min(1, t / 0.12f));
                if (t > 0.8f) state[g] = 0;
            }
        }
        // confetti and sparkles
        for (Iterator<Bit> it = bits.iterator(); it.hasNext(); ) {
            Bit p = it.next();
            p.age += dt;
            if (p.age >= p.life) {
                it.remove();
                continue;
            }
            p.vy += (p.star ? 60 : 210) * dt;
            p.vx *= (float) Math.pow(p.star ? 0.4 : 0.55, dt);
            if (!p.star) p.vy = Math.min(p.vy, 70);
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            float a = Math.min(1, (p.life - p.age) / 0.5f);
            float x = sx(p.x), y = sy(p.y);
            if (p.star) {
                float tw = 0.6f + 0.4f * (float) Math.sin(p.age * 18 + p.phase);
                float r = p.w * scale * tw;
                R2D.sprite(GLOW, x - r * 2, y - r * 2, r * 4, r * 4, 0, 0, 64, 64, false, R2D.withAlpha(p.color, 0.8f * a));
                R2D.rect(x - r * 1.6f, y - 0.35f, r * 3.2f, 0.7f, R2D.withAlpha(0xFFFFFFFF, a * tw));
                R2D.rect(x - 0.35f, y - r * 1.6f, 0.7f, r * 3.2f, R2D.withAlpha(0xFFFFFFFF, a * tw));
            } else {
                // flutter: the paper turns, so it looks thinner and wider in turn
                float f = (float) Math.abs(Math.cos(p.age * p.spin + p.phase));
                float w = Math.max(0.5f, p.w * scale * (0.25f + 0.75f * f)), h = p.h * scale;
                R2D.rect(x - w / 2, y - h / 2, w, h, R2D.withAlpha(R2D.lerpColor(p.color, 0xFF000000, 0.35f * (1 - f)), a));
            }
        }
    }

    private static void draw(Spr s, float angle, float pivX, float pivY, int color) {
        DrawContext ctx = R2D.ctx();
        if (angle != 0) {
            ctx.getMatrices().pushMatrix();
            ctx.getMatrices().translate(sx(pivX), sy(pivY));
            ctx.getMatrices().rotate(angle);
            ctx.getMatrices().translate(-sx(pivX), -sy(pivY));
        }
        R2D.sprite(ATLAS, sx(s.x), sy(s.y), s.dw * scale, s.dh * scale, s.u, s.v, s.w, s.h, false, color);
        if (angle != 0) ctx.getMatrices().popMatrix();
    }

    private static void drawMoved(Spr s, float dx, float dy, float angle, float alpha) {
        DrawContext ctx = R2D.ctx();
        float cx = s.x + s.dw / 2 + dx, cy = s.y + s.dh / 2 + dy;
        ctx.getMatrices().pushMatrix();
        ctx.getMatrices().translate(sx(cx), sy(cy));
        ctx.getMatrices().rotate(angle);
        ctx.getMatrices().translate(-sx(cx), -sy(cy));
        R2D.sprite(ATLAS, sx(s.x + dx), sy(s.y + dy), s.dw * scale, s.dh * scale, s.u, s.v, s.w, s.h, false, R2D.withAlpha(0xFFFFFFFF, alpha));
        ctx.getMatrices().popMatrix();
    }

    /** The surprise jumps out of the box, hangs there bobbing and pops away. */
    private static void drawSurprise(DrawContext ctx, int g, float t) {
        if (surprise[g] == null || t > 4.2f) return;
        Spr b = BODY[g];
        float rise = 1 - (float) Math.pow(1 - Math.min(1, t / 0.6f), 3);
        float s = (0.4f + 0.9f * rise) * (t > 3.8f ? Math.max(0, 1 - (t - 3.8f) / 0.4f) : 1);
        if (s <= 0.02f) return;
        float cx = sx(b.x + b.dw / 2), cy = sy(b.y + 4) - rise * 120 * scale + (float) Math.sin(t * 4) * 6 * scale * rise;
        float size = Math.max(10, 70 * scale) * s;
        R2D.sprite(GLOW, cx - size * 1.1f, cy - size * 1.1f, size * 2.2f, size * 2.2f, 0, 0, 64, 64, false, R2D.withAlpha(0xFFFFE9A8, 0.55f * rise));
        ctx.getMatrices().pushMatrix();
        ctx.getMatrices().translate(cx, cy);
        ctx.getMatrices().rotate((float) Math.sin(t * 3) * 0.15f);
        ctx.getMatrices().scale(size / 16f, size / 16f);
        ctx.drawItem(surprise[g], -8, -8);
        ctx.getMatrices().popMatrix();
    }

    // ------------------------------------------------------------------ clicks

    private static boolean hit(int g, double mx, double my) {
        Spr b = BODY[g], l = LID[g];
        float x0 = sx(Math.min(b.x, l.x)), x1 = sx(Math.max(b.x + b.dw, l.x + l.dw));
        float y0 = sy(l.y), y1 = sy(b.y + b.dh);
        return mx >= x0 && mx <= x1 && my >= y0 && my <= y1;
    }

    private static boolean overWidget(MinecraftClient mc, double mx, double my) {
        Screen s = mc.currentScreen;
        return s != null && s.hoveredElement(mx, my).isPresent();
    }

    /** Opens a present under the mouse on the main menu. Returns true if the click was used. */
    public static boolean onClick(double mx, double my, int button) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (button != 0 || !enabled() || mc.world != null || !(mc.currentScreen instanceof TitleScreen)) return false;
        if (overWidget(mc, mx, my)) return false;
        for (int g = 2; g >= 0; g--) {
            if (state[g] != 0 || !hit(g, mx, my)) continue;
            open(g);
            return true;
        }
        return false;
    }

    private static void open(int g) {
        state[g] = 1;
        since[g] = System.nanoTime();
        lidVx[g] = (RNG.nextBoolean() ? 1 : -1) * (90 + RNG.nextFloat() * 90);
        lidVr[g] = (lidVx[g] > 0 ? 1 : -1) * (3.5f + RNG.nextFloat() * 3);
        surprise[g] = new ItemStack(SURPRISES[RNG.nextInt(SURPRISES.length)]);
        Spr b = BODY[g];
        float cx = b.x + b.dw / 2, top = b.y + 6;
        for (int i = 0; i < 70; i++) {
            Bit p = new Bit();
            p.x = cx + (RNG.nextFloat() - 0.5f) * b.dw * 0.6f;
            p.y = top;
            float ang = (float) (-Math.PI / 2 + (RNG.nextFloat() - 0.5f) * 1.9f);
            float v = 280 + RNG.nextFloat() * 340;
            p.vx = (float) Math.cos(ang) * v;
            p.vy = (float) Math.sin(ang) * v;
            p.life = 2.2f + RNG.nextFloat() * 1.6f;
            p.w = 7 + RNG.nextFloat() * 5;
            p.h = 4 + RNG.nextFloat() * 3;
            p.spin = 6 + RNG.nextFloat() * 10;
            p.phase = RNG.nextFloat() * 6.28f;
            p.color = RNG.nextFloat() < 0.25f ? RIBBON[g] : CONFETTI[RNG.nextInt(CONFETTI.length)];
            bits.add(p);
        }
        for (int i = 0; i < 16; i++) {
            Bit p = new Bit();
            p.star = true;
            p.x = cx + (RNG.nextFloat() - 0.5f) * b.dw;
            p.y = top - RNG.nextFloat() * 20;
            float ang = (float) (-Math.PI / 2 + (RNG.nextFloat() - 0.5f) * 2.6f);
            float v = 120 + RNG.nextFloat() * 200;
            p.vx = (float) Math.cos(ang) * v;
            p.vy = (float) Math.sin(ang) * v;
            p.life = 0.9f + RNG.nextFloat() * 0.9f;
            p.w = 5 + RNG.nextFloat() * 6;
            p.phase = RNG.nextFloat() * 6.28f;
            p.color = RNG.nextBoolean() ? 0xFFFFD86A : 0xFFFFFFFF;
            bits.add(p);
        }
        MinecraftClient mc = MinecraftClient.getInstance();
        mc.getSoundManager().play(PositionedSoundInstance.ui(SoundEvents.ENTITY_ITEM_PICKUP, 0.7f, 0.8f));
        mc.getSoundManager().play(PositionedSoundInstance.ui(SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, 1.4f, 1.0f));
        mc.getSoundManager().play(PositionedSoundInstance.ui(SoundEvents.ENTITY_PLAYER_LEVELUP, 1.8f, 0.35f));
    }
}
