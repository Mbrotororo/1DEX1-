package ru.onedex.bot.bot;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.Entity;
import net.minecraft.util.PlayerInput;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * Movement driven every client tick (on the game thread). The bot thread sets what it wants (go to this
 * point, sneak, jump, look there), this class turns it into the player's buttons; the head is turned every
 * frame like a hand on a mouse does it (smooth, slowing down near where it looks, in mouse steps).
 * A fight, a chase or running from a creeper takes over until it is over; then the look the bot thread
 * asked for comes back before the bot thread goes on.
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
    private static volatile Entity chase;          // running to a monster that shoots at us
    private static volatile Vec3d fleeTo;          // running away from a creeper
    private static volatile boolean restoring;     // turning back to the bot thread's look after a fight
    private static volatile boolean runForward, critJump;
    private static float aimDx, aimDy, aimDz;      // where on the monster we aim (not always the exact middle)
    private static int aimFor = -1;

    // where the head turns to (set every tick, turned to every frame); fast = in a fight
    private static volatile Float headYaw, headPitch;
    private static volatile boolean fast;
    // leaning over an edge to bridge: the sneak goes down on the game thread, every tick, before the body
    // could leave the block (a frame hitch runs several ticks back to back; the bot thread may miss them)
    private static volatile Vec3d edgeFace;
    private static volatile int edgeDx, edgeDz;

    /** Guards the walk toward this edge (the middle of the block's side face, facing dx/dz); null = off. */
    public static void edgeGuard(Vec3d face, int dx, int dz) { edgeDx = dx; edgeDz = dz; edgeFace = face; }

    /** Working (building, harvesting, digging): the head turns like a quick builder's, still smooth. */
    public static volatile boolean quick;
    private static long lastFrame;
    private static double restYaw, restPitch;
    private static int restoringTicks;

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
        chase = null;
        fleeTo = null;
        restoring = false;
        critJump = false;
        edgeFace = null;
        headYaw = null;
        headPitch = null;
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
        if (e == null) critJump = false;
        if (was != null && e == null && chase == null && fleeTo == null) backToWork();
    }

    /** Runs to this monster (it shoots at us), or stops running with null. */
    static void chase(Entity e) {
        Entity was = chase;
        chase = e;
        if (was != null && e == null && fight == null && fleeTo == null) backToWork();
    }

    /** Runs away to this point (a creeper close by), or stops running with null. */
    static void flee(Vec3d to) {
        Vec3d was = fleeTo;
        fleeTo = to;
        if (was != null && to == null && fight == null && chase == null) backToWork();
    }

    /** One jump now (a critical hit is struck on the way down). */
    static void critJump(boolean on) { critJump = on; }

    public static boolean fleeing() { return fleeTo != null; }
    public static Entity chasing() { return chase; }
    public static Entity fighting() { return fight; }

    /** Back to what the bot was doing: its walk sets the yaw itself, otherwise its last look comes back. */
    private static void backToWork() {
        restoring = true;
        if (walkTarget == null && hasLast) { wantYaw = lastYaw; wantPitch = lastPitch; }
    }

    /** The bot thread waits while this is true (a fight, a chase, running from a creeper, or turning back after it). */
    public static boolean busy() { return fight != null || chase != null || fleeTo != null || restoring; }

    /** Buttons for the keyboard mixin; null = the player's own keys. */
    public static PlayerInput override() {
        if (!active) return null;
        if (fleeTo != null || chase != null) {
            ClientPlayerEntity p = MinecraftClient.getInstance().player;
            boolean blocked = p != null && p.horizontalCollision;
            return new PlayerInput(runForward, false, false, false, runForward && blocked, false, runForward);
        }
        if (busy()) return new PlayerInput(false, false, false, false, critJump, sneak, false);
        return new PlayerInput(forward, back, false, false, jump, sneak, sprint);
    }

    private static float yawTo(ClientPlayerEntity p, Vec3d at) {
        return (float) (MathHelper.atan2(at.z - p.getZ(), at.x - p.getX()) * (180 / Math.PI)) - 90f;
    }

    /** Called every client tick: buttons, and where the head should turn to. */
    public static void tick(MinecraftClient mc) {
        if (!active) return;
        ClientPlayerEntity p = mc.player;
        if (p == null) return;
        Vec3d ef = edgeFace;
        if (ef != null) {
            // where the body is now along the walk, past the edge (> 0.3 it would fall): one more tick at
            // walking speed moves it about 0.22, so from 0.25 before the edge the sneak is on (also in a fight)
            double over = (p.getX() - ef.x) * edgeDx + (p.getZ() - ef.z) * edgeDz;
            if (over > -0.25) sneak = true;
        }
        // no head turning while a chest or menu is open: with a window open the mouse moves the cursor
        // (and the bot thread, which opened it, must not wait for a turn that cannot happen now)
        if (mc.currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?>) {
            restoring = false;
            headYaw = null; headPitch = null;
            return;
        }

        Vec3d run = fleeTo;
        Entity ch = chase;
        if (run != null || ch != null) {
            Vec3d to = run != null ? run : ch.getEntityPos();
            float yaw = yawTo(p, to);
            runForward = Math.abs(MathHelper.wrapDegrees(yaw - p.getYaw())) < 45f;
            fast = true;
            if (ch != null) {
                // look at the one we run to (aim on the way)
                Vec3d eye = p.getEyePos(), at = ch.getBoundingBox().getCenter();
                double dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
                headPitch = (float) -(MathHelper.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI));
            } else headPitch = 5f;
            headYaw = yaw;
            return;
        }

        Entity f = fight;
        if (f != null) {
            // aim at a point of the monster's body (not always the exact middle)
            Vec3d eye = p.getEyePos();
            var b = f.getBoundingBox();
            Vec3d at = b.getCenter().add(aimDx * b.getLengthX(), aimDy * b.getLengthY(), aimDz * b.getLengthZ());
            double dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
            headYaw = (float) (MathHelper.atan2(dz, dx) * (180 / Math.PI)) - 90f;
            headPitch = (float) -(MathHelper.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI));
            fast = true;
            return;
        }
        fast = false;

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
        Float wy = wantYaw, wp = wantPitch;
        headYaw = wy;
        headPitch = wp;
        boolean yawDone = true, pitchDone = true;
        if (wy != null) {
            yawDone = Math.abs(MathHelper.wrapDegrees(wy - p.getYaw())) < 0.5f;
            if (yawDone && walkTarget == null) wantYaw = null;
        }
        if (wp != null) {
            pitchDone = Math.abs(wp - p.getPitch()) < 0.5f;
            if (pitchDone && walkTarget == null) wantPitch = null;
        }
        if (restoring && ++restoringTicks > 40) restoring = false;   // never wait for a turn forever
        if (restoring && ((yawDone && pitchDone) || walkTarget != null && !turnedAway)) restoring = false;
        if (!restoring) restoringTicks = 0;
    }

    /**
     * Called every frame (from the mouse update): turns the head toward where it should look, the way a
     * hand on a mouse does it. Smooth (every frame, not once a tick), quick at first and slowing down near
     * the end, and always by whole mouse counts at the player's sensitivity.
     */
    public static void frame(MinecraftClient mc) {
        long now = System.nanoTime();
        double dt = lastFrame == 0 ? 0 : Math.min(0.1, (now - lastFrame) / 1e9);
        lastFrame = now;
        if (!active || dt <= 0) return;
        if (headYaw == null && headPitch == null) { restYaw = 0; restPitch = 0; }
        ClientPlayerEntity p = mc.player;
        if (p == null || mc.currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?>) return;
        Float ty = headYaw, tp = headPitch;
        if (ty == null && tp == null) return;

        double s = mc.options.getMouseSensitivity().getValue() * 0.6 + 0.2;
        double perCount = s * s * s * 8.0;           // what one mouse count gives to changeLookDirection
        double degPerCount = perCount * 0.15;        // and that many degrees
        double gain = quick && !fast ? 20.0 : fast ? 16.0 : 10.0;     // how quickly it closes in (per second): eases out
        double maxSpeed = fast || quick ? 950.0 : 420.0;              // degrees per second at most
        double minSpeed = quick ? 60.0 : 35.0;                        // the last bit is not crawled

        double stepYaw = 0, stepPitch = 0;
        if (ty != null) stepYaw = step(MathHelper.wrapDegrees(ty - p.getYaw()), gain, maxSpeed, minSpeed, dt, degPerCount);
        if (tp != null) stepPitch = step(tp - p.getPitch(), gain, maxSpeed * 0.7, minSpeed, dt, degPerCount);
        // what does not make a whole mouse count yet is kept for the next frame (a slow turn still arrives)
        restYaw += stepYaw / degPerCount;
        restPitch += stepPitch / degPerCount;
        long cx = (long) restYaw, cy = (long) restPitch;
        restYaw -= cx;
        restPitch -= cy;
        if (ty == null) restYaw = 0;
        if (tp == null) restPitch = 0;
        if (cx != 0 || cy != 0) p.changeLookDirection(cx * perCount, cy * perCount);
    }

    private static double step(double err, double gain, double maxSpeed, double minSpeed, double dt, double quantum) {
        double a = Math.abs(err);
        if (a < quantum * 0.5) return 0;
        // the same easing at any frame rate: this frame closes the part of the gap a smooth hand would
        double part = a * (1 - Math.exp(-gain * dt));
        double move = Math.max(minSpeed * dt, Math.min(maxSpeed * dt, part));
        return Math.signum(err) * Math.min(a, move);
    }
}
