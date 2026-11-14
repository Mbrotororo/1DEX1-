package ru.onedex.bot.bot;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.util.PlayerInput;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * Movement driven every client tick (on the game thread). The bot thread sets what it wants (go to this
 * point, sneak, jump, look there), this class turns it into the player's buttons and rotation.
 */
public final class Move {
    private Move() {}

    private static volatile boolean active;
    private static volatile boolean forward, back, jump, sneak, sprint;
    private static volatile Vec3d walkTarget;      // walk straight to this point (x, z), stop when within tol
    private static volatile double walkTol = 0.2;
    private static volatile Float wantYaw, wantPitch;

    public static void activate(boolean on) {
        active = on;
        if (!on) clear();
    }

    public static boolean isActive() { return active; }

    public static void clear() {
        forward = back = jump = sneak = sprint = false;
        walkTarget = null;
        wantYaw = null;
        wantPitch = null;
    }

    public static void set(boolean fwd, boolean jmp, boolean snk) { forward = fwd; jump = jmp; sneak = snk; }
    public static void jump(boolean on) { jump = on; }
    public static void sneak(boolean on) { sneak = on; }
    public static void sprint(boolean on) { sprint = on; }
    public static void forward(boolean on) { forward = on; }
    public static void back(boolean on) { back = on; }

    public static void walkTo(Vec3d target, double tol) { walkTol = tol; walkTarget = target; }
    public static void stopWalking() { walkTarget = null; forward = false; }
    public static boolean walking() { return walkTarget != null; }

    public static void look(float yaw, float pitch) { wantYaw = yaw; wantPitch = pitch; }

    /** Buttons for the keyboard mixin; null = the player's own keys. */
    public static PlayerInput override() {
        if (!active) return null;
        return new PlayerInput(forward, back, false, false, jump, sneak, sprint);
    }

    /** Called every client tick. */
    public static void tick(MinecraftClient mc) {
        if (!active) return;
        ClientPlayerEntity p = mc.player;
        if (p == null) return;
        Vec3d t = walkTarget;
        if (t != null) {
            double dx = t.x - p.getX(), dz = t.z - p.getZ();
            double d = Math.sqrt(dx * dx + dz * dz);
            if (d < walkTol) {
                walkTarget = null;
                forward = false;
            } else {
                wantYaw = (float) (MathHelper.atan2(dz, dx) * (180 / Math.PI)) - 90f;
                if (wantPitch == null) wantPitch = 10f;
                forward = true;
            }
        }
        if (wantYaw != null) {
            // turn smoothly (looks natural on video) but fast enough to work
            float cur = p.getYaw();
            float diff = MathHelper.wrapDegrees(wantYaw - cur);
            float step = Math.max(-35f, Math.min(35f, diff));
            p.setYaw(cur + step);
            p.setHeadYaw(p.getYaw());
            if (Math.abs(diff) < 0.5f && walkTarget == null) wantYaw = null;
        }
        if (wantPitch != null) {
            float cur = p.getPitch();
            float diff = wantPitch - cur;
            float step = Math.max(-25f, Math.min(25f, diff));
            p.setPitch(MathHelper.clamp(cur + step, -90f, 90f));
            if (Math.abs(diff) < 0.5f && walkTarget == null) wantPitch = null;
        }
    }
}
