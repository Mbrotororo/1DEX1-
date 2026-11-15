package ru.onedex.bot.bot;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.Entity;
import net.minecraft.util.PlayerInput;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * Movement driven every client tick (on the game thread). The bot thread sets what it wants (go to this
 * point, sneak, jump, look there), this class turns it into the player's buttons and rotation.
 * A fight (a monster next to us) takes over the rotation and stops walking until it is over; then the
 * look the bot thread asked for comes back before the bot thread goes on.
 */
public final class Move {
    private Move() {}

    private static volatile boolean active;
    private static volatile boolean forward, back, jump, sneak, sprint;
    private static volatile Vec3d walkTarget;      // walk straight to this point (x, z), stop when within tol
    private static volatile double walkTol = 0.2;
    private static volatile Float wantYaw, wantPitch;
    private static volatile float lastYaw, lastPitch;   // the last look the bot thread asked for
    private static volatile boolean hasLast;

    private static volatile Entity fight;          // set by Bot on the game thread
    private static volatile boolean restoring;     // turning back to the bot thread's look after a fight

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
        hasLast = false;
        fight = null;
        restoring = false;
    }

    public static void set(boolean fwd, boolean jmp, boolean snk) { forward = fwd; jump = jmp; sneak = snk; }
    public static void jump(boolean on) { jump = on; }
    public static void sneak(boolean on) { sneak = on; }
    public static boolean sneaking() { return sneak; }
    public static void sprint(boolean on) { sprint = on; }
    public static void forward(boolean on) { forward = on; }
    public static void back(boolean on) { back = on; }

    public static void walkTo(Vec3d target, double tol) { walkTol = tol; walkTarget = target; }
    public static void stopWalking() { walkTarget = null; forward = false; }
    public static boolean walking() { return walkTarget != null; }

    public static void look(float yaw, float pitch) {
        wantYaw = yaw; wantPitch = pitch;
        lastYaw = yaw; lastPitch = pitch; hasLast = true;
    }

    // ------------------------------------------------------------------ fights
    static void fight(Entity e) {
        Entity was = fight;
        fight = e;
        if (was != null && e == null) {
            // back to what the bot was doing: its walk sets the yaw itself, otherwise its last look
            restoring = true;
            if (walkTarget == null && hasLast) { wantYaw = lastYaw; wantPitch = lastPitch; }
        }
    }

    public static Entity fighting() { return fight; }

    /** The bot thread waits while this is true (a fight, or turning back after it). */
    public static boolean busy() { return fight != null || restoring; }

    /** Buttons for the keyboard mixin; null = the player's own keys. */
    public static PlayerInput override() {
        if (!active) return null;
        if (busy()) return new PlayerInput(false, false, false, false, false, sneak, false);
        return new PlayerInput(forward, back, false, false, jump, sneak, sprint);
    }

    private static float turn(float cur, float want, float max) {
        float diff = MathHelper.wrapDegrees(want - cur);
        return cur + Math.max(-max, Math.min(max, diff));
    }

    /** Called every client tick. */
    public static void tick(MinecraftClient mc) {
        if (!active) return;
        ClientPlayerEntity p = mc.player;
        if (p == null) return;

        Entity f = fight;
        if (f != null) {
            // aim at the middle of the monster's body
            Vec3d eye = p.getEyePos();
            Vec3d at = f.getBoundingBox().getCenter();
            double dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
            float yaw = (float) (MathHelper.atan2(dz, dx) * (180 / Math.PI)) - 90f;
            float pitch = (float) -(MathHelper.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI));
            p.setYaw(turn(p.getYaw(), yaw, 40f));
            p.setHeadYaw(p.getYaw());
            p.setPitch(MathHelper.clamp(p.getPitch() + Math.max(-30f, Math.min(30f, pitch - p.getPitch())), -90f, 90f));
            return;
        }

        Vec3d t = walkTarget;
        boolean turnedAway = false;
        if (t != null) {
            double dx = t.x - p.getX(), dz = t.z - p.getZ();
            double d = Math.sqrt(dx * dx + dz * dz);
            if (d < walkTol) {
                walkTarget = null;
                forward = false;
            } else {
                wantYaw = (float) (MathHelper.atan2(dz, dx) * (180 / Math.PI)) - 90f;
                if (wantPitch == null) wantPitch = 10f;
                // walk only roughly facing the target: turning on the spot first keeps us on our path
                turnedAway = Math.abs(MathHelper.wrapDegrees(wantYaw - p.getYaw())) > 50f;
                forward = !turnedAway || d < 0.35;
            }
        }
        boolean yawDone = true, pitchDone = true;
        if (wantYaw != null) {
            // turn smoothly (looks natural on video) but fast enough to work
            float diff = MathHelper.wrapDegrees(wantYaw - p.getYaw());
            p.setYaw(turn(p.getYaw(), wantYaw, 35f));
            p.setHeadYaw(p.getYaw());
            yawDone = Math.abs(diff) < 0.5f;
            if (yawDone && walkTarget == null) wantYaw = null;
        }
        if (wantPitch != null) {
            float cur = p.getPitch();
            float diff = wantPitch - cur;
            float step = Math.max(-25f, Math.min(25f, diff));
            p.setPitch(MathHelper.clamp(cur + step, -90f, 90f));
            pitchDone = Math.abs(diff) < 0.5f;
            if (pitchDone && walkTarget == null) wantPitch = null;
        }
        if (restoring && ((yawDone && pitchDone) || walkTarget != null && !turnedAway)) restoring = false;
    }
}
