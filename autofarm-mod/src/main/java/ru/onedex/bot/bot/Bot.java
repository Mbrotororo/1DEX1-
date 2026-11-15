package ru.onedex.bot.bot;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.CreeperEntity;
import net.minecraft.entity.mob.EndermanEntity;
import net.minecraft.entity.mob.Monster;
import net.minecraft.entity.mob.PiglinEntity;
import net.minecraft.entity.mob.ZombifiedPiglinEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.farm.Plan;

import java.util.HashMap;
import java.util.Map;

/** The bot: one thread that runs the plan while the game shows what happens. */
public final class Bot {
    public static final Bot INSTANCE = new Bot();
    private Bot() {}

    private volatile boolean running;
    private volatile long ticks;
    private volatile Thread thread;

    // what the menu and the HUD show
    private volatile String stage = "Готов к запуску";
    private volatile String act = "";
    private volatile long startedAt;
    private volatile String lastError = "";

    public boolean running() { return running; }
    public long tickCount() { return ticks; }
    public String stage() { return stage; }
    public String act() { return act; }
    public long startedAt() { return startedAt; }
    public String lastError() { return lastError; }
    /** The thread that is allowed to run the plan now (an old one stops at its next check). */
    Thread thread() { return thread; }

    private volatile long teleports;
    /** Counts the server's position packets (game thread). */
    public void teleported() { teleports++; }
    public long teleports() { return teleports; }

    public void stage(String s) {
        if (!s.equals(stage)) BotClient.LOGGER.info("[bot] {}", s);
        stage = s;
    }
    public void act(String s) { act = s; }

    public synchronized void start() {
        if (running) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null) return;
        Thread old = thread;
        if (old != null) old.interrupt();   // a quick Stop-Start: the old thread must not go on next to the new one
        running = true;
        startedAt = System.currentTimeMillis();
        lastError = "";
        mc.options.pauseOnLostFocus = false;   // the game must keep going while you watch from another window
        Move.activate(true);
        Thread t = new Thread(this::loop, "1DEX1 Bot");
        t.setDaemon(true);
        thread = t;
        t.start();
    }

    public synchronized void stop() {
        running = false;
        Thread t = thread;
        if (t != null) t.interrupt();
        Move.activate(false);
        MinecraftClient mc = MinecraftClient.getInstance();
        mc.execute(() -> {
            if (mc.interactionManager != null) mc.interactionManager.cancelBlockBreaking();
            mc.options.useKey.setPressed(false);
        });
        stage = "Остановлен";
        act = "";
    }

    public void toggle() { if (running) stop(); else start(); }

    private boolean mine() { return running && Thread.currentThread() == thread; }

    private void loop() {
        while (mine()) {
            try {
                Plan.run();
            } catch (Ctl.Stopped s) {
                break;
            } catch (Ctl.Moved m) {
                BotClient.LOGGER.info("[bot] сдвинуло (бой или крипер) — шаг заново");
                Move.clear();
            } catch (Throwable t) {
                if (!mine()) break;
                lastError = t.getMessage() == null ? t.toString() : t.getMessage();
                BotClient.LOGGER.error("[bot] ошибка, начинаю шаг заново", t);
                Move.clear();
                try {
                    for (int i = 0; i < 60 && mine(); i++) Thread.sleep(50);
                } catch (InterruptedException e) { break; }
            }
        }
        if (Thread.currentThread() == thread) Move.activate(false);
    }

    // ------------------------------------------------------------------ fights
    private final Map<Integer, Long> ignoreUntil = new HashMap<>();
    private int fightId = -1;
    private long lastOnCrosshair;
    private long fleeSince;
    private Vec3d fleeTo;

    /** A monster that may be fought: not one that only gets angry when hit (and calls its friends). */
    static boolean enemy(Entity e) {
        if (!(e instanceof Monster) || !e.isAlive()) return false;
        if (e instanceof EndermanEntity en) return en.isAngry();
        return !(e instanceof ZombifiedPiglinEntity) && !(e instanceof PiglinEntity);
    }

    /** From our eye to the nearest point of the entity's box. */
    static double reachTo(ClientPlayerEntity p, Entity e) {
        Vec3d eye = p.getEyePos();
        var b = e.getBoundingBox();
        double x = Math.max(b.minX, Math.min(eye.x, b.maxX));
        double y = Math.max(b.minY, Math.min(eye.y, b.maxY));
        double z = Math.max(b.minZ, Math.min(eye.z, b.maxZ));
        return eye.distanceTo(new Vec3d(x, y, z));
    }

    /** Up on a farm floor (a gap under the block we stand on), or leaning over an edge: no running about there. */
    private static boolean onFloor(MinecraftClient mc, ClientPlayerEntity p) {
        BlockPos f = p.getBlockPos();
        if (mc.world.getBlockState(f.down()).getCollisionShape(mc.world, f.down()).isEmpty()) return true;   // over an edge
        return mc.world.getBlockState(f.down(2)).isAir();
    }

    private static boolean hissing(Entity e) { return e instanceof CreeperEntity c && c.isAlive() && c.getFuseSpeed() > 0; }

    /** A monster defend() will fight now: in reach, in sight, not left alone. */
    private boolean fightable(ClientPlayerEntity p, Entity e, double range) {
        return enemy(e) && !ignoreUntil.containsKey(e.getId()) && reachTo(p, e) < range - 0.2 && p.canSee(e);
    }

    /**
     * A chest or menu window should be shut now: a creeper hisses close by, a monster is in reach, or we are
     * being hit with a monster next to us (game thread). Only what defend() then really deals with.
     */
    public boolean danger() {
        MinecraftClient mc = MinecraftClient.getInstance();
        ClientPlayerEntity p = mc.player;
        if (p == null || mc.world == null) return false;
        double range = p.getEntityInteractionRange();
        for (Entity e : mc.world.getEntities()) {
            if (!enemy(e) || !p.canSee(e)) continue;
            if (hissing(e) && e.distanceTo(p) < 8.5) return true;
            if (fightable(p, e, range + 0.6)) return true;
            if (p.hurtTime > 0 && reachTo(p, e) < 4.5) return true;
        }
        return false;
    }

    /** Free ground straight ahead from `from` in direction (dx, dz) for 3 blocks: no drop, no wall, no lava. */
    private static boolean safeRun(MinecraftClient mc, BlockPos from, int dx, int dz) {
        BlockPos at = from;
        for (int i = 1; i <= 3; i++) {
            BlockPos n = from.add(dx * i, 0, dz * i);
            BlockPos ok = null;
            for (int dy : new int[]{0, 1, -1}) {
                BlockPos c = n.up(dy);
                if (Path.standable(mc.world, c)) { ok = c; break; }
            }
            if (ok == null || Math.abs(ok.getY() - at.getY()) > 1) return false;
            for (BlockPos q : new BlockPos[]{ok, ok.down()}) {
                String bn = Ctl.blockName(mc.world.getBlockState(q));
                if (bn.contains("lava") || bn.contains("fire") || bn.equals("cactus") || bn.equals("magma_block")) return false;
            }
            at = ok;
        }
        return true;
    }

    /** Where to run from a creeper: the direction most away from it that has safe ground; null if none. */
    private static Vec3d fleeTarget(MinecraftClient mc, ClientPlayerEntity p, Entity creeper) {
        Vec3d away = p.getEntityPos().subtract(creeper.getEntityPos()).multiply(1, 0, 1);
        if (away.lengthSquared() < 1e-4) away = new Vec3d(1, 0, 0);
        away = away.normalize();
        int[][] dirs = {{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};
        int[] best = null;
        double bestDot = 0.1;   // never towards it
        for (int[] d : dirs) {
            double dot = (d[0] * away.x + d[1] * away.z) / Math.hypot(d[0], d[1]);
            if (dot > bestDot && safeRun(mc, p.getBlockPos(), d[0], d[1])) { bestDot = dot; best = d; }
        }
        if (best == null) return null;
        return Vec3d.ofBottomCenter(p.getBlockPos()).add(best[0] * 10, 0, best[1] * 10);
    }

    /**
     * Fights monsters that come close the way a player does: turn to it, hit only when the crosshair is on it
     * and the swing is charged. A creeper is hit while calm; once it hisses we run (on safe ground) until it
     * is quiet again. The bot thread waits meanwhile (see Ctl.ticks).
     */
    private void defend(MinecraftClient mc) {
        ClientPlayerEntity p = mc.player;
        if (mc.currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?> || p.isUsingItem()) {
            Move.fight(null);
            Move.flee(null);
            return;
        }
        long now = ticks;
        ignoreUntil.values().removeIf(t -> t < now);
        double range = p.getEntityInteractionRange();
        // being hit: nothing next to us is left alone any more
        if (p.hurtTime > 0) ignoreUntil.clear();

        boolean floor = onFloor(mc, p);
        Entity hiss = null;
        for (Entity e : mc.world.getEntities()) {
            if (hissing(e) && e.distanceTo(p) < 8.5 && p.canSee(e)) { hiss = e; break; }
        }
        if (hiss != null && !floor) {
            // one more hit on the way if it is right in front of us, then away
            if (mc.crosshairTarget instanceof EntityHitResult hit && hit.getEntity() == hiss && p.getAttackCooldownProgress(0.5f) >= 0.92f) {
                mc.interactionManager.attackEntity(p, hiss);
                p.swingHand(Hand.MAIN_HAND);
            }
            if (!Move.fleeing()) {
                fleeSince = now;
                fleeTo = fleeTarget(mc, p, hiss);
                if (fleeTo != null) mc.interactionManager.cancelBlockBreaking();
            }
            if (fleeTo != null && now - fleeSince < 100) {
                Move.fight(null);
                Move.flee(fleeTo);
                return;
            }
            // no safe way to run: stand and hit it (the knockback keeps it off)
        }
        if (Move.fleeing() && (hiss == null || now - fleeSince >= 100)) { Move.flee(null); fleeTo = null; }

        Entity cur = Move.fighting();
        if (cur != null) {
            boolean alive = enemy(cur) && !cur.isRemoved() && p.canSee(cur);
            if (!alive || reachTo(p, cur) > range + 0.6) {
                cur = null;   // knocked back or gone: picked again when it comes back
            } else if (now - lastOnCrosshair > 40) {
                ignoreUntil.put(cur.getId(), now + 200);   // the crosshair never gets on it from here
                cur = null;
            }
            if (cur == null) fightId = -1;
        }
        if (cur == null) {
            double best = range - 0.2;
            for (Entity e : mc.world.getEntities()) {
                if (!enemy(e) || ignoreUntil.containsKey(e.getId())) continue;
                double d = reachTo(p, e);
                if (d < best && p.canSee(e)) { best = d; cur = e; }
            }
            if (cur != null) lastOnCrosshair = now;
        }
        if (cur == null) { fightId = -1; Move.fight(null); return; }
        if (cur.getId() != fightId) {
            fightId = cur.getId();
            holdSword(p);
        }
        Move.fight(cur);
        // hit only what the crosshair is on (vanilla reach and sight), with a charged swing
        if (mc.crosshairTarget instanceof EntityHitResult hit && hit.getEntity() == cur) {
            lastOnCrosshair = now;
            if (p.getAttackCooldownProgress(0.5f) >= 0.92f) {
                mc.interactionManager.attackEntity(p, cur);
                p.swingHand(Hand.MAIN_HAND);
            }
        }
    }

    /** The sword, if it is in the hotbar (no inventory clicks in a fight). */
    private static void holdSword(ClientPlayerEntity p) {
        var inv = p.getInventory();
        for (int i = 0; i < 9; i++) {
            ItemStack s = inv.getStack(i);
            if (!s.isEmpty() && Ctl.itemName(s).endsWith("_sword")) { inv.setSelectedSlot(i); return; }
        }
    }

    /** Every game tick. */
    public void clientTick(MinecraftClient mc) {
        ticks++;
        if (!running) return;
        if (mc.player == null || mc.world == null) { stop(); stage = "Нет игры"; return; }
        if (mc.player.isDead()) { Move.fight(null); Move.flee(null); mc.player.requestRespawn(); return; }
        defend(mc);
        Move.tick(mc);
    }
}
