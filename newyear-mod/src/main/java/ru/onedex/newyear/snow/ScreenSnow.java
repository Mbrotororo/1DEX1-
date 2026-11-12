package ru.onedex.newyear.snow;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.R2D;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Snow falling over the screen (HUD and every menu). Flakes that hit the top edge of an interface
 * element (hotbar, chat, buttons, inventories, the New Year menu) pile up there as small snow drifts,
 * like snow on top of windows on a desktop. Drifts melt away when the element disappears.
 */
public final class ScreenSnow {
    private ScreenSnow() {}

    private static final Random RNG = new Random();
    private static final float COL = 1f;     // drift resolution: one column per GUI unit
    private static final float MAX_H = 4.5f; // max drift height (GUI units)

    private static final class Flake {
        float x, y, vy, size, phase, swayAmp, swayFreq;
        boolean big;
    }

    private static final class Drift {
        final String key;
        float x, top, w;
        float[] h;
        long lastSeen;
        float alpha;
        int version;
        int uploaded = -1;
        long lastUpload;

        Drift(String key) {
            this.key = key;
        }
    }

    private static final List<Flake> flakes = new ArrayList<>();
    private static final Map<String, Drift> drifts = new HashMap<>();
    private static final List<Drift> frame = new ArrayList<>();
    private static long lastNanos = System.nanoTime();
    private static float screenW, screenH;
    private static float time;

    /** Registers an interface element whose top edge can collect snow this frame. */
    public static void surface(String key, float x, float top, float w) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.screenSnow || !c.snowDrifts || w < 12) return;
        Drift d = drifts.get(key);
        int cols = Math.max(2, (int) Math.ceil(w / COL));
        if (d == null || d.h.length != cols) {
            d = new Drift(key);
            d.h = new float[cols];
            drifts.put(key, d);
        }
        d.x = x;
        d.top = top;
        d.w = w;
        d.lastSeen = System.nanoTime();
        if (!frame.contains(d)) frame.add(d);
    }

    /** Updates and draws flakes and drifts. Call once per frame, after all surfaces are registered. */
    public static void render(DrawContext ctx) {
        NyConfig c = NyConfig.INSTANCE;
        MinecraftClient mc = MinecraftClient.getInstance();
        long now = System.nanoTime();
        float dt = Math.min(0.05f, (now - lastNanos) / 1e9f);
        lastNanos = now;
        if (!c.screenSnow) {
            frame.clear();
            return;
        }
        R2D.begin(ctx);
        screenW = ctx.getScaledWindowWidth();
        screenH = ctx.getScaledWindowHeight();
        time += dt;
        step(dt, c);

        // ---- drifts (melt when their element is gone)
        for (Iterator<Drift> it = drifts.values().iterator(); it.hasNext(); ) {
            Drift d = it.next();
            boolean seen = frame.contains(d);
            d.alpha += ((seen ? 1 : 0) - d.alpha) * (1 - (float) Math.exp(-dt * (seen ? 8 : 3)));
            if (!seen && (now - d.lastSeen) > 2_000_000_000L) {
                R2D.disposeImage("drift_" + d.key);
                it.remove();
                continue;
            }
            if (!seen) {
                // melting
                boolean any = false;
                for (int i = 0; i < d.h.length; i++) {
                    d.h[i] = Math.max(0, d.h[i] - dt * 1.5f);
                    any |= d.h[i] > 0;
                }
                d.version++;
                if (!any) continue;
            }
            drawDrift(d);
        }
        frame.clear();

        // ---- flakes
        for (Flake f : flakes) {
            float a = 0.85f;
            if (f.big) {
                int bucket = Math.min(2, (int) ((f.size - 2.2f) / 0.6f));
                float s = 5.5f + bucket * 1.6f;
                R2D.icon("flake" + bucket, f.x, f.y, s, R2D.withAlpha(0xFFFFFFFF, a), ScreenSnow::paintFlake);
            } else {
                R2D.circle(f.x, f.y, f.size / 2f, R2D.withAlpha(0xFFF4F8FF, a * (0.55f + f.size * 0.3f)));
            }
        }
    }

    private static void step(float dt, NyConfig c) {
        int target = Math.min(260, Math.round(c.screenSnowAmount * screenW * screenH / 900f));
        while (flakes.size() < target) flakes.add(spawn(true));
        while (flakes.size() > target) flakes.remove(flakes.size() - 1);
        for (Flake f : flakes) {
            float px = f.x, py = f.y;
            f.y += f.vy * dt;
            f.x += (float) Math.sin(time * f.swayFreq + f.phase) * f.swayAmp * dt + 2.5f * dt;
            if (f.x > screenW + 4) f.x -= screenW + 8;
            boolean landed = false;
            if (c.snowDrifts) {
                for (Drift d : frame) {
                    if (f.x < d.x || f.x >= d.x + d.w) continue;
                    float surf = d.top - heightAt(d, f.x);
                    if (py <= surf && f.y >= surf) {
                        deposit(d, f.x, f.size);
                        landed = true;
                        break;
                    }
                }
            }
            if (landed || f.y > screenH + 6) reset(f);
        }
    }

    private static Flake spawn(boolean anywhere) {
        Flake f = new Flake();
        reset(f);
        if (anywhere) f.y = RNG.nextFloat() * screenH;
        return f;
    }

    private static void reset(Flake f) {
        f.x = RNG.nextFloat() * (screenW + 8) - 4;
        f.y = -4 - RNG.nextFloat() * 30;
        f.big = RNG.nextFloat() < 0.14f;
        f.size = f.big ? 2.2f + RNG.nextFloat() * 1.7f : 0.7f + RNG.nextFloat() * 1.1f;
        f.vy = 10 + f.size * 4 + RNG.nextFloat() * 8;
        f.phase = RNG.nextFloat() * 6.28f;
        f.swayAmp = 4 + RNG.nextFloat() * 8;
        f.swayFreq = 0.6f + RNG.nextFloat() * 1.2f;
    }

    private static float heightAt(Drift d, float x) {
        float fi = (x - d.x) / COL;
        int i = Math.max(0, Math.min(d.h.length - 1, (int) fi));
        return d.h[i];
    }

    private static float limitAt(Drift d, int i) {
        int n = d.h.length;
        float edge = Math.min(i, n - 1 - i) + 0.6f;
        float max = Math.min(MAX_H, Math.max(1.6f, d.w * 0.06f));
        return Math.min(max, edge * 0.85f);
    }

    private static void deposit(Drift d, float x, float size) {
        int n = d.h.length;
        int c = (int) ((x - d.x) / COL);
        float amount = 1.6f + size * 0.9f;
        int spread = 4;
        float sum = 0;
        for (int k = -spread; k <= spread; k++) sum += (float) Math.exp(-k * k / 6.0);
        for (int k = -spread; k <= spread; k++) {
            int i = c + k;
            if (i < 0 || i >= n) continue;
            d.h[i] = Math.min(limitAt(d, i), d.h[i] + amount * (float) Math.exp(-k * k / 6.0) / sum);
        }
        // let the snow settle: no steep steps
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 1; i < n; i++) {
                float diff = d.h[i] - d.h[i - 1];
                if (Math.abs(diff) > 0.7f) {
                    float move = (Math.abs(diff) - 0.7f) / 2f * Math.signum(diff);
                    d.h[i] -= move;
                    d.h[i - 1] = Math.min(limitAt(d, i - 1), d.h[i - 1] + move);
                }
            }
        }
        d.version++;
    }

    private static void drawDrift(Drift d) {
        float a = R2D.alpha;
        R2D.alpha = a * d.alpha;
        long now = System.nanoTime();
        // re-bake the drift image at most ~8 times per second
        if (d.uploaded != d.version && now - d.lastUpload > 120_000_000L) {
            d.uploaded = d.version;
            d.lastUpload = now;
        }
        final float[] hs = d.h.clone();
        final float k = R2D.unit();
        float imgH = MAX_H + 1.2f;
        R2D.image("drift_" + d.key, String.valueOf(d.uploaded), d.x, d.top - MAX_H, d.w, imgH, (px, py, W, H) -> {
            float col = px / k / COL;
            int i0 = Math.max(0, Math.min(hs.length - 1, (int) Math.floor(col - 0.5f)));
            int i1 = Math.min(hs.length - 1, i0 + 1);
            float t = Math.max(0, Math.min(1, col - 0.5f - i0));
            float hh = hs[i0] + (hs[i1] - hs[i0]) * t;
            if (hh <= 0.05f) return 0;
            float surfacePx = (MAX_H - hh) * k;
            float cov = Math.max(0, Math.min(1, py + 1 - surfacePx));
            if (cov <= 0) return 0;
            float depth = (py - surfacePx) / Math.max(1, hh * k);
            int r = Math.round(255 - depth * 22), g = Math.round(255 - depth * 14), b = 255;
            if (py + 1 - surfacePx < 1.6f) {
                r = 255;
                g = 255;
            }
            int alpha = Math.round(cov * 245);
            return (alpha << 24) | (Math.max(0, r) << 16) | (Math.max(0, g) << 8) | b;
        });
        R2D.alpha = a;
    }

    private static void paintFlake(R2D.Canvas c, float s) {
        float m = 8 * s;
        for (int k = 0; k < 3; k++) {
            double a = k * Math.PI / 3;
            float dx = (float) Math.cos(a) * 6.8f * s, dy = (float) Math.sin(a) * 6.8f * s;
            c.line(m - dx, m - dy, m + dx, m + dy, 1.3f * s);
        }
        for (int k = 0; k < 6; k++) {
            double a = k * Math.PI / 3;
            float bx = m + (float) Math.cos(a) * 4.2f * s, by = m + (float) Math.sin(a) * 4.2f * s;
            for (int sgn = -1; sgn <= 1; sgn += 2) {
                double b = a + sgn * 0.75;
                c.line(bx, by, bx + (float) Math.cos(b) * 2.2f * s, by + (float) Math.sin(b) * 2.2f * s, 1.0f * s);
            }
        }
        c.disc(m, m, 1.4f * s);
    }
}
