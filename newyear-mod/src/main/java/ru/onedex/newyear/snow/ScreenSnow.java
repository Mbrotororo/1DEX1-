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
 * Snow over the screen (HUD and every menu).
 * <ul>
 *   <li>Flakes pile up as drifts on the top edges of interface elements (chat, hotbar, buttons, windows)
 *       and melt when the element disappears.</li>
 *   <li>Click a drift to grab a snowball; drag it over snow to roll it bigger; drop it on another ball to stack.</li>
 *   <li>Three balls stacked = a little snowman that walks around and crumbles into a snow pile after 20 s.</li>
 *   <li>A quick mouse swipe through the snow scatters it.</li>
 * </ul>
 */
public final class ScreenSnow {
    private ScreenSnow() {}

    private static final Random RNG = new Random();
    private static final float COL = 1f;        // drift resolution: one column per GUI unit
    private static final float FLAKE_MAX = 4.5f; // max drift height from falling flakes
    private static final float PILE_MAX = 16f;   // max height of piles (crumbled snowman)
    private static final float GRAVITY = 260f;

    // ------------------------------------------------------------------ data

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
        int version, uploaded = -1;
        long lastUpload;
        boolean ground;

        Drift(String key) {
            this.key = key;
        }

        float maxHeight() {
            float m = 0;
            for (float v : h) m = Math.max(m, v);
            return m;
        }
    }

    private static final class Ball {
        float x, y, r, vx, vy;
        boolean held;
        Ball restOn;          // resting on another ball
        Drift restDrift;      // resting on a drift / the ground
        float spin;
    }

    private static final class Snowman {
        float x, r0, r1, r2, dir, age, speed;
        Drift on;
        float y; // bottom
        boolean falling;
        float vy;
    }

    private static final class Puff {
        float x, y, vx, vy, life, max, size;
    }

    private static final List<Flake> flakes = new ArrayList<>();
    private static final Map<String, Drift> drifts = new HashMap<>();
    private static final List<Drift> frame = new ArrayList<>();
    private static final List<Ball> balls = new ArrayList<>();
    private static final List<Snowman> snowmen = new ArrayList<>();
    private static final List<Puff> puffs = new ArrayList<>();
    private static Ball held;
    private static double lastMx = Double.NaN, lastMy;
    private static float mouseVx, mouseVy;
    private static long lastNanos = System.nanoTime();
    private static float screenW = 1, screenH = 1;
    private static float time;
    /** True while a screen with a free mouse cursor is open (interaction allowed). */
    private static boolean interactive;

    // ------------------------------------------------------------------ surfaces

    /** Registers an interface element whose top edge can collect snow this frame. */
    public static void surface(String key, float x, float top, float w) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.screenSnow || !c.snowDrifts || w < 12) return;
        Drift d = drift(key, x, top, w);
        if (!frame.contains(d)) frame.add(d);
    }

    private static Drift drift(String key, float x, float top, float w) {
        Drift d = drifts.get(key);
        int cols = Math.max(2, (int) Math.ceil(w / COL));
        if (d == null || d.h.length != cols) {
            Drift nd = new Drift(key);
            nd.h = new float[cols];
            if (d != null) {
                // keep the snow when the element was resized a little
                for (int i = 0; i < cols; i++) nd.h[i] = d.h[Math.min(d.h.length - 1, i * d.h.length / cols)];
            }
            d = nd;
            drifts.put(key, d);
        }
        d.x = x;
        d.top = top;
        d.w = w;
        d.lastSeen = System.nanoTime();
        return d;
    }

    // ------------------------------------------------------------------ frame

    /**
     * Updates and draws everything. Call once per frame after all surfaces are registered.
     *
     * @param mouseFree whether a screen is open and the cursor can interact with the snow
     */
    public static void render(DrawContext ctx, boolean mouseFree) {
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
        interactive = mouseFree && c.snowPlay;

        // permanent ground at the bottom edge of the screen (snowman piles end up here)
        Drift ground = drift("ground", 0, screenH, screenW);
        ground.ground = true;
        if (!frame.contains(ground)) frame.add(ground);

        double mx = mc.mouse.getScaledX(mc.getWindow()), my = mc.mouse.getScaledY(mc.getWindow());
        if (!Double.isNaN(lastMx) && dt > 0) {
            float vx = (float) ((mx - lastMx) / dt), vy = (float) ((my - lastMy) / dt);
            mouseVx += (vx - mouseVx) * 0.5f;
            mouseVy += (vy - mouseVy) * 0.5f;
        }
        lastMx = mx;
        lastMy = my;
        if (interactive && held == null) scatter((float) mx, (float) my, dt);

        stepFlakes(dt, c);
        stepBalls(dt, (float) mx, (float) my);
        stepSnowmen(dt);
        stepPuffs(dt);

        // ---- drifts (melt when their element is gone; ground piles melt slowly)
        for (Iterator<Drift> it = drifts.values().iterator(); it.hasNext(); ) {
            Drift d = it.next();
            boolean seen = frame.contains(d);
            d.alpha += ((seen ? 1 : 0) - d.alpha) * (1 - (float) Math.exp(-dt * (seen ? 8 : 3)));
            if (!seen && (now - d.lastSeen) > 2_000_000_000L) {
                R2D.disposeImage("drift_" + d.key);
                it.remove();
                continue;
            }
            if (!seen || d.ground) {
                float melt = d.ground ? dt * 0.08f : dt * 1.5f;
                boolean changed = false;
                for (int i = 0; i < d.h.length; i++) {
                    if (d.h[i] > 0) {
                        d.h[i] = Math.max(0, d.h[i] - melt);
                        changed = true;
                    }
                }
                if (changed) d.version++;
            }
            if (d.maxHeight() > 0.05f) drawDrift(d);
        }
        frame.clear();

        for (Snowman s : snowmen) drawSnowman(s);
        for (Ball b : balls) drawBall(b);
        for (Puff p : puffs) {
            float a = Math.max(0, 1 - p.life / p.max);
            R2D.circle(p.x, p.y, p.size, R2D.withAlpha(0xFFF7FAFF, 0.9f * a));
        }
        for (Flake f : flakes) {
            if (f.big) {
                int bucket = Math.min(2, (int) ((f.size - 2.2f) / 0.6f));
                R2D.icon("flake" + bucket, f.x, f.y, 5.5f + bucket * 1.6f, R2D.withAlpha(0xFFFFFFFF, 0.85f), ScreenSnow::paintFlake);
            } else {
                R2D.circle(f.x, f.y, f.size / 2f, R2D.withAlpha(0xFFF4F8FF, 0.85f * (0.55f + f.size * 0.3f)));
            }
        }
    }

    // ------------------------------------------------------------------ flakes

    private static void stepFlakes(float dt, NyConfig c) {
        int target = Math.min(260, Math.round(c.screenSnowAmount * screenW * screenH / 900f));
        while (flakes.size() < target) flakes.add(spawn(true));
        while (flakes.size() > target) flakes.remove(flakes.size() - 1);
        for (Flake f : flakes) {
            float py = f.y;
            f.y += f.vy * dt;
            f.x += (float) Math.sin(time * f.swayFreq + f.phase) * f.swayAmp * dt + 2.5f * dt;
            if (f.x > screenW + 4) f.x -= screenW + 8;
            boolean landed = false;
            if (c.snowDrifts) {
                for (Drift d : frame) {
                    if (d.ground || f.x < d.x || f.x >= d.x + d.w) continue;
                    float surf = d.top - heightAt(d, f.x);
                    if (py <= surf && f.y >= surf) {
                        deposit(d, f.x, 1.6f + f.size * 0.9f, 4, FLAKE_MAX);
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

    // ------------------------------------------------------------------ drift helpers

    private static int col(Drift d, float x) {
        return Math.max(0, Math.min(d.h.length - 1, (int) ((x - d.x) / COL)));
    }

    private static float heightAt(Drift d, float x) {
        return d.h[col(d, x)];
    }

    /** Surface y (top of the snow) under x for drift d. */
    private static float surfaceY(Drift d, float x) {
        return d.top - heightAt(d, x);
    }

    private static float limitAt(Drift d, int i, float cap) {
        int n = d.h.length;
        float edge = Math.min(i, n - 1 - i) + 0.6f;
        float max = d.ground || cap > FLAKE_MAX ? cap : Math.min(cap, Math.max(1.6f, d.w * 0.06f));
        return Math.min(max, edge * (cap > FLAKE_MAX ? 1.1f : 0.85f));
    }

    private static void deposit(Drift d, float x, float amount, int spread, float cap) {
        int n = d.h.length;
        int c = (int) ((x - d.x) / COL);
        float sum = 0;
        float s2 = spread * spread / 1.5f;
        for (int k = -spread; k <= spread; k++) sum += (float) Math.exp(-k * k / s2);
        for (int k = -spread; k <= spread; k++) {
            int i = c + k;
            if (i < 0 || i >= n) continue;
            float lim = Math.max(d.h[i], limitAt(d, i, cap));
            d.h[i] = Math.min(lim, d.h[i] + amount * (float) Math.exp(-k * k / s2) / sum);
        }
        settle(d);
        d.version++;
    }

    /** Let the snow settle: no steep steps. */
    private static void settle(Drift d) {
        int n = d.h.length;
        for (int pass = 0; pass < 3; pass++) {
            for (int i = 1; i < n; i++) {
                float diff = d.h[i] - d.h[i - 1];
                if (Math.abs(diff) > 1.1f) {
                    float move = (Math.abs(diff) - 1.1f) / 2f * Math.signum(diff);
                    d.h[i] -= move;
                    d.h[i - 1] += move;
                }
            }
        }
    }

    /** Removes up to {@code amount} of snow around x; returns how much was taken. */
    private static float take(Drift d, float x, float radius, float amount) {
        int c = col(d, x);
        int r = Math.max(1, Math.round(radius / COL));
        float got = 0;
        for (int k = -r; k <= r && got < amount; k++) {
            int i = c + k;
            if (i < 0 || i >= d.h.length) continue;
            float w = 1f - Math.abs(k) / (r + 1f);
            float t = Math.min(d.h[i], Math.min(amount - got, d.h[i] * 0.85f * w + 0.05f));
            d.h[i] -= t;
            got += t;
        }
        if (got > 0) d.version++;
        return got;
    }

    /** The drift whose snow is under the point, if any. */
    private static Drift driftAt(float x, float y, float slack) {
        Drift best = null;
        for (Drift d : drifts.values()) {
            if (d.alpha < 0.5f || x < d.x || x >= d.x + d.w) continue;
            float h = heightAt(d, x);
            if (h < 0.4f) continue;
            if (y >= d.top - h - slack && y <= d.top + 1) {
                if (best == null || d.top < best.top) best = d;
            }
        }
        return best;
    }

    /** Highest surface under (x, y): a drift / the ground below the point. */
    private static Drift surfaceBelow(float x, float y) {
        Drift best = null;
        float bestY = Float.MAX_VALUE;
        for (Drift d : drifts.values()) {
            if (!(frame.contains(d) || d.ground) || x < d.x || x >= d.x + d.w) continue;
            float s = surfaceY(d, x);
            if (s >= y - 0.5f && s < bestY) {
                bestY = s;
                best = d;
            }
        }
        return best;
    }

    // ------------------------------------------------------------------ mouse interaction

    /** @return true if the click was used by the snow */
    public static boolean onClick(double mx, double my, int button) {
        if (!interactive || button != 0) return false;
        float x = (float) mx, y = (float) my;
        for (int i = balls.size() - 1; i >= 0; i--) {
            Ball b = balls.get(i);
            if (dist2(b.x, b.y, x, y) <= (b.r + 2) * (b.r + 2)) {
                grab(b);
                return true;
            }
        }
        for (Snowman s : snowmen) {
            float top = s.y - (s.r0 + s.r1) * 2 - s.r2 * 2;
            if (Math.abs(x - s.x) < s.r0 + 1 && y > top && y < s.y + 1) {
                crumble(s);
                snowmen.remove(s);
                return true;
            }
        }
        Drift d = driftAt(x, y, 3);
        if (d == null) return false;
        float got = take(d, x, 6, 22);
        if (got < 0.8f) return false;
        Ball b = new Ball();
        b.r = Math.max(2.4f, Math.min(5f, (float) Math.sqrt(got) * 1.1f));
        b.x = x;
        b.y = y;
        balls.add(b);
        grab(b);
        return true;
    }

    private static void grab(Ball b) {
        held = b;
        b.held = true;
        b.restOn = null;
        b.restDrift = null;
        // balls that were standing on this one start falling
        for (Ball o : balls) if (o.restOn == b) o.restOn = null;
    }

    public static boolean onDrag() {
        return held != null;
    }

    public static boolean onRelease() {
        if (held == null) return false;
        held.held = false;
        held.vx = Math.max(-400, Math.min(400, mouseVx * 0.9f));
        held.vy = Math.max(-400, Math.min(400, mouseVy * 0.9f));
        held = null;
        return true;
    }

    /** Fast mouse swipes through drifts throw the snow around. */
    private static void scatter(float mx, float my, float dt) {
        float speed = (float) Math.sqrt(mouseVx * mouseVx + mouseVy * mouseVy);
        if (speed < 160) return;
        for (Drift d : drifts.values()) {
            if (d.alpha < 0.5f || mx < d.x - 3 || mx >= d.x + d.w + 3) continue;
            float h = heightAt(d, Math.max(d.x, Math.min(d.x + d.w - 1, mx)));
            if (h < 0.12f || my < d.top - h - 6 || my > d.top + 3f) continue;
            float got = take(d, mx, 5f, Math.min(9f, speed * dt * 0.09f + 1f));
            if (got <= 0.02f) continue;
            int n = Math.min(22, 4 + Math.round(got * 4f));
            for (int i = 0; i < n; i++) {
                Puff p = new Puff();
                p.x = mx + (RNG.nextFloat() - 0.5f) * 5;
                p.y = d.top - h * RNG.nextFloat();
                p.vx = mouseVx * (0.25f + RNG.nextFloat() * 0.35f) + (RNG.nextFloat() - 0.5f) * 40;
                p.vy = mouseVy * 0.25f - 40 - RNG.nextFloat() * 80;
                p.size = 0.6f + RNG.nextFloat() * 1.0f;
                p.max = 0.9f + RNG.nextFloat() * 0.8f;
                puffs.add(p);
            }
        }
        // a hard swipe knocks a snowman over
        for (Iterator<Snowman> it = snowmen.iterator(); it.hasNext(); ) {
            Snowman s = it.next();
            float top = s.y - (s.r0 + s.r1 + s.r2) * 2;
            if (speed > 420 && Math.abs(mx - s.x) < s.r0 && my > top && my < s.y) {
                crumble(s);
                it.remove();
            }
        }
    }

    // ------------------------------------------------------------------ balls

    private static void stepBalls(float dt, float mx, float my) {
        for (Iterator<Ball> it = balls.iterator(); it.hasNext(); ) {
            Ball b = it.next();
            if (b.held) {
                float px = b.x;
                b.x += (mx - b.x) * (1 - (float) Math.exp(-dt * 30));
                b.y += (my - b.y) * (1 - (float) Math.exp(-dt * 30));
                b.spin += (b.x - px) / Math.max(1, b.r);
                // rolling over snow makes the ball bigger
                Drift d = surfaceBelow(b.x, b.y);
                if (d != null && b.r < 9f && Math.abs(b.x - px) > 0.05f) {
                    float s = surfaceY(d, b.x);
                    if (b.y + b.r >= s - 0.6f && heightAt(d, b.x) > 0.3f) {
                        float got = take(d, b.x, b.r * 0.6f, Math.abs(b.x - px) * 0.35f);
                        b.r = Math.min(9f, (float) Math.sqrt(b.r * b.r + got * 1.6f));
                    }
                }
                continue;
            }
            if (b.restOn != null) {
                if (!balls.contains(b.restOn)) b.restOn = null;
                else {
                    b.x += (b.restOn.x - b.x) * (1 - (float) Math.exp(-dt * 10));
                    b.y = b.restOn.y - b.restOn.r - b.r * 0.82f;
                    continue;
                }
            }
            if (b.restDrift != null) {
                if (!frame.contains(b.restDrift) && !b.restDrift.ground) b.restDrift = null;
                else {
                    b.y = surfaceY(b.restDrift, b.x) - b.r * 0.85f;
                    continue;
                }
            }
            // free flight
            float py = b.y;
            b.vy += GRAVITY * dt;
            b.vx *= (float) Math.exp(-dt * 0.8f);
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.spin += b.vx * dt / Math.max(1, b.r);
            if (b.x < b.r) {
                b.x = b.r;
                b.vx = -b.vx * 0.4f;
            }
            if (b.x > screenW - b.r) {
                b.x = screenW - b.r;
                b.vx = -b.vx * 0.4f;
            }
            // land on another ball
            Ball under = null;
            for (Ball o : balls) {
                if (o == b || o.held || o.restOn == b) continue;
                if (Math.abs(o.x - b.x) < (o.r + b.r) * 0.75f && py + b.r <= o.y - o.r + 2 && b.y + b.r >= o.y - o.r) {
                    under = o;
                    break;
                }
            }
            if (under != null) {
                if (Math.abs(b.vy) > 330) {
                    smash(b);
                    it.remove();
                    continue;
                }
                b.restOn = under;
                b.vx = b.vy = 0;
                continue;
            }
            // land on snow / an element / the ground
            Drift d = surfaceBelow(b.x, py + b.r * 0.85f);
            if (d != null) {
                float s = surfaceY(d, b.x);
                if (b.y + b.r * 0.85f >= s) {
                    if (Math.abs(b.vy) > 380 || Math.abs(b.vx) > 380) {
                        smash(b);
                        it.remove();
                        continue;
                    }
                    b.restDrift = d;
                    b.vx = b.vy = 0;
                    b.y = s - b.r * 0.85f;
                }
            }
            if (b.y > screenH + 40) it.remove();
        }
        // three balls stacked -> snowman
        for (Ball top : new ArrayList<>(balls)) {
            Ball mid = top.restOn;
            if (mid == null || top.held) continue;
            Ball bottom = mid.restOn == null ? null : mid;
            Ball base = mid.restOn;
            if (bottom == null || base == null || base.restDrift == null) continue;
            float[] r = {base.r, mid.r, top.r};
            java.util.Arrays.sort(r);
            Snowman s = new Snowman();
            s.r0 = Math.max(4.4f, r[2] * 1.1f);
            s.r1 = Math.max(3.3f, r[1]);
            s.r2 = Math.max(2.5f, r[0] * 0.85f);
            s.x = base.x;
            s.on = base.restDrift;
            s.y = surfaceY(s.on, s.x) + s.r0 * 0.15f;
            s.dir = RNG.nextBoolean() ? 1 : -1;
            s.speed = 9 + RNG.nextFloat() * 6;
            snowmen.add(s);
            balls.remove(top);
            balls.remove(mid);
            balls.remove(base);
            for (int i = 0; i < 16; i++) puff(s.x, s.y - s.r0 * 2, 50);
            break;
        }
    }

    private static void smash(Ball b) {
        int n = Math.round(b.r * 4);
        for (int i = 0; i < n; i++) puff(b.x, b.y, 90);
        Drift d = surfaceBelow(b.x, b.y);
        if (d != null) deposit(d, b.x, b.r * b.r * 0.35f, Math.round(b.r * 1.5f), d.ground ? PILE_MAX : FLAKE_MAX);
    }

    private static void puff(float x, float y, float power) {
        Puff p = new Puff();
        p.x = x + (RNG.nextFloat() - 0.5f) * 4;
        p.y = y + (RNG.nextFloat() - 0.5f) * 4;
        double a = RNG.nextDouble() * Math.PI * 2;
        float sp = power * (0.3f + RNG.nextFloat() * 0.7f);
        p.vx = (float) Math.cos(a) * sp;
        p.vy = (float) Math.sin(a) * sp - power * 0.4f;
        p.size = 0.5f + RNG.nextFloat() * 1.0f;
        p.max = 0.6f + RNG.nextFloat() * 0.8f;
        puffs.add(p);
    }

    private static void stepPuffs(float dt) {
        for (Iterator<Puff> it = puffs.iterator(); it.hasNext(); ) {
            Puff p = it.next();
            p.life += dt;
            p.vy += GRAVITY * 0.6f * dt;
            p.vx *= (float) Math.exp(-dt * 2);
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.life >= p.max || p.y > screenH + 5) it.remove();
        }
        if (puffs.size() > 600) puffs.subList(0, puffs.size() - 600).clear();
    }

    // ------------------------------------------------------------------ snowmen

    private static void stepSnowmen(float dt) {
        for (Iterator<Snowman> it = snowmen.iterator(); it.hasNext(); ) {
            Snowman s = it.next();
            s.age += dt;
            if (s.on != null && !frame.contains(s.on) && !s.on.ground) {
                s.on = null;
                s.falling = true;
            }
            if (s.falling) {
                s.vy += GRAVITY * dt;
                float py = s.y;
                s.y += s.vy * dt;
                Drift d = surfaceBelow(s.x, py);
                if (d != null && s.y >= surfaceY(d, s.x)) {
                    s.on = d;
                    s.falling = false;
                    s.vy = 0;
                }
                if (s.y > screenH + 60) {
                    it.remove();
                    continue;
                }
            } else if (s.on != null) {
                // walk along the surface, turn around at its edges
                float nx = s.x + s.dir * s.speed * dt;
                float minX = s.on.x + s.r0, maxX = s.on.x + s.on.w - s.r0;
                if (nx < minX || nx > maxX || RNG.nextFloat() < dt * 0.15f) s.dir = -s.dir;
                else s.x = nx;
                float target = surfaceY(s.on, s.x) + s.r0 * 0.15f;
                s.y += (target - s.y) * (1 - (float) Math.exp(-dt * 12));
            }
            if (s.age >= 20f) {
                crumble(s);
                it.remove();
            }
        }
    }

    /** The snowman falls apart into a pile of snow. */
    private static void crumble(Snowman s) {
        float total = (s.r0 * s.r0 + s.r1 * s.r1 + s.r2 * s.r2);
        for (int i = 0; i < 40; i++) puff(s.x, s.y - s.r0 * 1.5f - RNG.nextFloat() * (s.r1 + s.r2) * 2, 70);
        Drift d = s.on != null ? s.on : surfaceBelow(s.x, s.y - 1);
        if (d == null) return;
        deposit(d, s.x, total * 1.8f, Math.max(6, Math.round(s.r0 * 2.0f)), d.ground ? PILE_MAX : Math.max(FLAKE_MAX, s.r0 * 2.6f));
    }

    // ------------------------------------------------------------------ drawing

    private static void drawBall(Ball b) {
        R2D.circle(b.x, b.y + b.r * 0.08f, b.r, 0x30000000);
        R2D.circle(b.x, b.y, b.r, 0xFFDCE6F4);
        R2D.circle(b.x - b.r * 0.12f, b.y - b.r * 0.14f, b.r * 0.84f, 0xFFF4F8FF);
        R2D.circle(b.x - b.r * 0.35f, b.y - b.r * 0.38f, b.r * 0.22f, 0xFFFFFFFF);
        // a few sparkles that roll with the ball
        for (int i = 0; i < 3; i++) {
            double a = b.spin + i * 2.1;
            R2D.circle(b.x + (float) Math.cos(a) * b.r * 0.55f, b.y + (float) Math.sin(a) * b.r * 0.55f, Math.max(0.35f, b.r * 0.07f), 0x55A8BCD6);
        }
    }

    private static void drawSnowman(Snowman s) {
        float bob = s.falling ? 0 : (float) Math.abs(Math.sin(s.age * 7)) * 0.9f;
        float fade = s.age > 18.5f ? Math.max(0, (20f - s.age) / 1.5f) : 1f;
        float a = R2D.alpha;
        R2D.alpha = a * Math.min(1f, s.age * 4f) * (0.4f + 0.6f * fade);
        float y0 = s.y - bob;
        float c0 = y0 - s.r0;
        float c1 = c0 - s.r0 * 0.85f - s.r1 * 0.85f;
        float c2 = c1 - s.r1 * 0.85f - s.r2 * 0.85f;
        // arms (sticks) swinging while walking
        float swing = (float) Math.sin(s.age * 7) * 0.6f;
        R2D.line(s.x - s.r1 * 0.8f, c1, s.x - s.r1 * 2.0f, c1 - s.r1 * (0.6f + swing * 0.4f), 0.7f, 0xFF6B4423);
        R2D.line(s.x + s.r1 * 0.8f, c1, s.x + s.r1 * 2.0f, c1 - s.r1 * (0.6f - swing * 0.4f), 0.7f, 0xFF6B4423);
        snowBall(s.x, c0, s.r0);
        snowBall(s.x, c1, s.r1);
        snowBall(s.x, c2, s.r2);
        // buttons
        R2D.circle(s.x + s.dir * s.r1 * 0.15f, c1 - s.r1 * 0.3f, Math.max(0.45f, s.r1 * 0.11f), 0xFF2B2B33);
        R2D.circle(s.x + s.dir * s.r1 * 0.15f, c1 + s.r1 * 0.2f, Math.max(0.45f, s.r1 * 0.11f), 0xFF2B2B33);
        // scarf
        R2D.roundRect(s.x - s.r2 * 0.95f, c2 + s.r2 * 0.7f, s.r2 * 1.9f, Math.max(0.9f, s.r2 * 0.35f), s.r2 * 0.17f, 0xFFD7263D);
        R2D.roundRect(s.x - s.dir * s.r2 * 0.6f - s.r2 * 0.18f, c2 + s.r2 * 0.75f, s.r2 * 0.36f, s.r2 * 0.95f, s.r2 * 0.17f, 0xFFB81D31);
        // eyes and carrot nose (looking where it walks)
        float ex = s.dir * s.r2 * 0.28f;
        R2D.circle(s.x + ex - s.r2 * 0.25f, c2 - s.r2 * 0.18f, Math.max(0.4f, s.r2 * 0.12f), 0xFF1E1E24);
        R2D.circle(s.x + ex + s.r2 * 0.25f, c2 - s.r2 * 0.18f, Math.max(0.4f, s.r2 * 0.12f), 0xFF1E1E24);
        R2D.line(s.x + ex, c2 + s.r2 * 0.1f, s.x + ex + s.dir * s.r2 * 0.9f, c2 + s.r2 * 0.18f, Math.max(0.6f, s.r2 * 0.22f), 0xFFF28C28);
        // hat
        R2D.roundRect(s.x - s.r2 * 0.9f, c2 - s.r2 * 0.95f, s.r2 * 1.8f, Math.max(0.6f, s.r2 * 0.22f), 0.3f, 0xFF24242C);
        R2D.roundRect(s.x - s.r2 * 0.55f, c2 - s.r2 * 1.75f, s.r2 * 1.1f, s.r2 * 0.85f, 0.3f, 0xFF24242C);
        R2D.rect(s.x - s.r2 * 0.55f, c2 - s.r2 * 1.12f, s.r2 * 1.1f, Math.max(0.4f, s.r2 * 0.14f), 0xFFD7263D);
        R2D.alpha = a;
    }

    private static void snowBall(float x, float y, float r) {
        R2D.circle(x, y, r, 0xFFD8E3F2);
        R2D.circle(x - r * 0.1f, y - r * 0.12f, r * 0.86f, 0xFFF6F9FF);
    }

    private static void drawDrift(Drift d) {
        float a = R2D.alpha;
        R2D.alpha = a * d.alpha;
        long now = System.nanoTime();
        if (d.uploaded != d.version && now - d.lastUpload > 90_000_000L) {
            d.uploaded = d.version;
            d.lastUpload = now;
        }
        final float[] hs = d.h.clone();
        final float k = R2D.unit();
        final float maxH = Math.max(FLAKE_MAX, (float) Math.ceil(d.maxHeight() / 4f) * 4f);
        float imgH = maxH + 1.2f;
        R2D.image("drift_" + d.key, d.uploaded + "_" + maxH, d.x, d.top - maxH, d.w, imgH, (px, py, W, H) -> {
            float col = px / k / COL;
            int i0 = Math.max(0, Math.min(hs.length - 1, (int) Math.floor(col - 0.5f)));
            int i1 = Math.min(hs.length - 1, i0 + 1);
            float t = Math.max(0, Math.min(1, col - 0.5f - i0));
            float hh = hs[i0] + (hs[i1] - hs[i0]) * t;
            if (hh <= 0.05f) return 0;
            float surfacePx = (maxH - hh) * k;
            float cov = Math.max(0, Math.min(1, py + 1 - surfacePx));
            if (cov <= 0) return 0;
            float depth = (py - surfacePx) / Math.max(1, hh * k);
            int r = Math.round(255 - depth * 26), g = Math.round(255 - depth * 16), b = 255;
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

    private static float dist2(float ax, float ay, float bx, float by) {
        return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
    }
}
