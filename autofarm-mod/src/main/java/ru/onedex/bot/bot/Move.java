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
    private static volatile Vec3d fleeTo;          // running away from a creeper (set by Bot)
    private static volatile boolean restoring;     // turning back to the bot thread's look after a fight
    private static volatile boolean fleeForward;
    private static float aimDx, aimDy, aimDz;      // where on the monster we aim (not always the exact middle)
    private static int aimFor = -1;

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
        fleeTo = null;
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
        if (e != null && e.getId() != aimFor) {
            aimFor = e.getId();
            java.util.concurrent.ThreadLocalRandom r = java.util.concurrent.ThreadLocalRandom.current();
            aimDx = (float) r.nextDouble(-0.15, 0.15);
            aimDy = (float) r.nextDouble(-0.2, 0.25);
            aimDz = (float) r.nextDouble(-0.15, 0.15);
        }
        if (was != null && e == null) backToWork();
    }

    /** Runs away to this point (a creeper close by), or stops running with null. */
    static void flee(Vec3d to) {
        Vec3d was = fleeTo;
        fleeTo = to;
        if (was != null && to == null) backToWork();
    }

    public static boolean fleeing() { return fleeTo != null; }

    /** Back to what the bot was doing: its walk sets the yaw itself, otherwise its last look comes back. */
    private static void backToWork() {
        restoring = true;
        if (walkTarget == null && hasLast) { wantYaw = lastYaw; wantPitch = lastPitch; }
    }

    public static Entity fighting() { return fight; }

    /** The bot thread waits while this is true (a fight, running from a creeper, or turning back after it). */
    public static boolean busy() { return fight != null || fleeTo != null || restoring; }

    /** Buttons for the keyboard mixin; null = the player's own keys. */
    public static PlayerInput override() {
        if (!active) return null;
        if (fleeTo != null) {
            ClientPlayerEntity p = MinecraftClient.getInstance().player;
            boolean blocked = p != null && p.horizontalCollision;
            return new PlayerInput(fleeForward, false, false, false, fleeForward && blocked, false, fleeForward);
        }
        if (busy()) return new PlayerInput(false, false, false, false, false, sneak, false);
        return new PlayerInput(forward, back, false, false, jump, sneak, sprint);
    }

    /**
     * Turns the head like a mouse does: at most `maxYaw`/`maxPitch` this tick, in whole steps of what one
     * mouse count turns at the player's sensitivity (a hand on a mouse never turns by any other amount).
     */
    private static void rotate(MinecraftClient mc, ClientPlayerEntity p, Float yaw, Float pitch, float maxYaw, float maxPitch) {
        double sens = mc.options.getMouseSensitivity().getValue();
        double f = sens * 0.6 + 0.2;
        float step = (float) (f * f * f * 8.0 * 0.15);
        if (yaw != null) {
            float d = MathHelper.wrapDegrees(yaw - p.getYaw());
            d = Math.max(-maxYaw, Math.min(maxYaw, d));
            d = Math.round(d / step) * step;
            p.setYaw(p.getYaw() + d);
            p.setHeadYaw(p.getYaw());
        }
        if (pitch != null) {
            float d = pitch - p.getPitch();
            d = Math.max(-maxPitch, Math.min(maxPitch, d));
            d = Math.round(d / step) * step;
            p.setPitch(MathHelper.clamp(p.getPitch() + d, -90f, 90f));
        }
    }

    private static float yawTo(ClientPlayerEntity p, Vec3d at) {
        return (float) (MathHelper.atan2(at.z - p.getZ(), at.x - p.getX()) * (180 / Math.PI)) - 90f;
    }

    /** Called every client tick. */
    public static void tick(MinecraftClient mc) {
        if (!active) return;
        ClientPlayerEntity p = mc.player;
        if (p == null) return;

        // no head turning while a chest or menu is open: with a window open the mouse moves the cursor
        // (and the bot thread, which opened it, must not wait for a turn that cannot happen now)
        if (mc.currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?>) { restoring = false; return; }

        Vec3d run = fleeTo;
        if (run != null) {
            float yaw = yawTo(p, run);
            fleeForward = Math.abs(MathHelper.wrapDegrees(yaw - p.getYaw())) < 50f;
            rotate(mc, p, yaw, 5f, 45f, 20f);
            return;
        }

        Entity f = fight;
        if (f != null) {
            // aim at a point of the monster's body (not always the exact middle)
            Vec3d eye = p.getEyePos();
            var b = f.getBoundingBox();
            Vec3d at = b.getCenter().add(aimDx * b.getLengthX(), aimDy * b.getLengthY(), aimDz * b.getLengthZ());
            double dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
            float yaw = (float) (MathHelper.atan2(dz, dx) * (180 / Math.PI)) - 90f;
            float pitch = (float) -(MathHelper.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI));
            rotate(mc, p, yaw, pitch, 40f, 30f);
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
        // turn smoothly (looks natural on video) but fast enough to work
        Float wy = wantYaw, wp = wantPitch;
        rotate(mc, p, wy, wp, 35f, 25f);
        if (wy != null) {
            yawDone = Math.abs(MathHelper.wrapDegrees(wy - p.getYaw())) < 0.5f;
            if (yawDone && walkTarget == null) wantYaw = null;
        }
        if (wp != null) {
            pitchDone = Math.abs(wp - p.getPitch()) < 0.5f;
            if (pitchDone && walkTarget == null) wantPitch = null;
        }
        if (restoring && ((yawDone && pitchDone) || walkTarget != null && !turnedAway)) restoring = false;
    }
}
