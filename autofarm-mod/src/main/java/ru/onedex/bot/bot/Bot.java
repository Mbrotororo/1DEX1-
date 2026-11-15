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
    private final Map<Integer, Long> seenSince = new HashMap<>();
    private int fightId = -1;
    private long lastOnCrosshair;
    private long fleeSince;

    /** A monster that may be fought: not one that only gets angry when hit (and calls its friends). */
    static boolean enemy(Entity e) {
        if (!(e instanceof Monster) || !e.isAlive() || e instanceof CreeperEntity) return false;
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

    /** Up on a farm floor (a gap under the block we stand on): no running about up there. */
    private static boolean onFloor(MinecraftClient mc, ClientPlayerEntity p) {
        return mc.world.getBlockState(p.getBlockPos().down(2)).isAir() && !mc.world.getBlockState(p.getBlockPos().down()).isAir();
    }

    /** Something hurts us or comes for us: a chest window should be closed now (game thread). */
    public boolean danger() {
        MinecraftClient mc = MinecraftClient.getInstance();
        ClientPlayerEntity p = mc.player;
        if (p == null || mc.world == null) return false;
        if (p.hurtTime > 0) return true;
        for (Entity e : mc.world.getEntities()) {
            if ((enemy(e) || (e instanceof CreeperEntity && e.isAlive())) && reachTo(p, e) < 4.5 && p.canSee(e)) return true;
        }
        return false;
    }

    /**
     * Fights monsters that come close the way a player does: turn to it, hit only when the crosshair is on it
     * and the swing is charged; walks away from creepers. The bot thread waits meanwhile (see Ctl.ticks).
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
        seenSince.entrySet().removeIf(en -> mc.world.getEntityById(en.getKey()) == null);
        double range = p.getEntityInteractionRange();

        // a creeper close by: on the ground we walk away from it; up on a floor there is nowhere to go
        boolean floor = onFloor(mc, p);
        Entity creeper = null;
        double cd = 7.0;
        for (Entity e : mc.world.getEntities()) {
            if (!(e instanceof CreeperEntity) || !e.isAlive()) continue;
            double d = e.distanceTo(p);
            if (d < cd && p.canSee(e)) { cd = d; creeper = e; }
        }
        if (creeper != null && !floor) {
            if (!Move.fleeing()) fleeSince = now;
            if (now - fleeSince < 160) {
                Move.fight(null);
                Vec3d away = p.getEntityPos().subtract(creeper.getEntityPos()).multiply(1, 0, 1);
                if (away.lengthSquared() < 1e-4) away = new Vec3d(1, 0, 0);
                Move.flee(p.getEntityPos().add(away.normalize().multiply(10)));
                return;
            }
        }
        if (Move.fleeing() && (creeper == null || now - fleeSince >= 160)) Move.flee(null);

        Entity cur = Move.fighting();
        if (cur != null) {
            boolean keep = (enemy(cur) || cur instanceof CreeperEntity) && !cur.isRemoved() && reachTo(p, cur) <= range + 0.6 && p.canSee(cur);
            long since = seenSince.getOrDefault(cur.getId(), now);
            // hit it within a moment, or leave it (it is out of reach; we do not chase)
            if (keep && now - lastOnCrosshair > 30 && now - since > 30) keep = false;
            if (keep && now - since > 300) keep = false;   // ten seconds without getting it
            if (!keep) { ignoreUntil.put(cur.getId(), now + 300); cur = null; }
        }
        if (cur == null) {
            double best = range - 0.2;
            for (Entity e : mc.world.getEntities()) {
                boolean can = enemy(e) || (floor && e instanceof CreeperEntity && e.isAlive());
                if (!can || ignoreUntil.containsKey(e.getId())) continue;
                double d = reachTo(p, e);
                if (d < best && p.canSee(e)) { best = d; cur = e; }
            }
            if (cur != null) {
                seenSince.putIfAbsent(cur.getId(), now);
                lastOnCrosshair = now;
            }
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
