package ru.onedex.bot.bot;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.EndermanEntity;
import net.minecraft.entity.mob.Monster;
import net.minecraft.entity.mob.PiglinEntity;
import net.minecraft.entity.mob.ZombifiedPiglinEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.slot.SlotActionType;
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
    private int fightId = -1;
    private long fightSince;

    /** A monster that may be fought: not one that only gets angry when hit (and then calls its friends). */
    private static boolean enemy(Entity e) {
        if (!(e instanceof Monster) || !e.isAlive()) return false;
        if (e instanceof EndermanEntity en) return en.isAngry();
        return !(e instanceof ZombifiedPiglinEntity) && !(e instanceof PiglinEntity);
    }

    /** From our eye to the nearest point of the entity's box. */
    private static double reachTo(ClientPlayerEntity p, Entity e) {
        Vec3d eye = p.getEyePos();
        var b = e.getBoundingBox();
        double x = Math.max(b.minX, Math.min(eye.x, b.maxX));
        double y = Math.max(b.minY, Math.min(eye.y, b.maxY));
        double z = Math.max(b.minZ, Math.min(eye.z, b.maxZ));
        return eye.distanceTo(new Vec3d(x, y, z));
    }

    /**
     * Fights monsters that come close the way a player does: turn to it, hit only when the crosshair is on it
     * and the swing is charged. The bot thread waits meanwhile (see Ctl.ticks).
     */
    private void defend(MinecraftClient mc) {
        ClientPlayerEntity p = mc.player;
        if (mc.currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?> || p.isUsingItem()) { Move.fight(null); return; }
        long now = ticks;
        ignoreUntil.values().removeIf(t -> t < now);

        Entity cur = Move.fighting();
        if (cur != null && (!enemy(cur) || cur.isRemoved() || reachTo(p, cur) > 4.5 || !p.canSee(cur))) cur = null;
        if (cur != null && cur.getId() == fightId && now - fightSince > 200) {
            ignoreUntil.put(cur.getId(), now + 600);   // could not get it in 10 s: leave it for half a minute
            cur = null;
        }
        if (cur == null) {
            double best = 3.6;
            for (Entity e : mc.world.getEntities()) {
                if (!enemy(e) || ignoreUntil.containsKey(e.getId())) continue;
                double d = reachTo(p, e);
                if (d < best && p.canSee(e)) { best = d; cur = e; }
            }
        }
        if (cur == null) { fightId = -1; Move.fight(null); return; }
        if (cur.getId() != fightId) {
            fightId = cur.getId();
            fightSince = now;
            holdSword(mc, p);
        }
        Move.fight(cur);
        // hit only what the crosshair is on (vanilla reach and sight), with a charged swing
        if (mc.crosshairTarget instanceof EntityHitResult hit && hit.getEntity() == cur && p.getAttackCooldownProgress(0.5f) >= 0.92f) {
            mc.interactionManager.attackEntity(p, cur);
            p.swingHand(Hand.MAIN_HAND);
        }
    }

    private static void holdSword(MinecraftClient mc, ClientPlayerEntity p) {
        var inv = p.getInventory();
        int best = -1;
        for (int i = 0; i < 36; i++) {
            ItemStack s = inv.getStack(i);
            if (!s.isEmpty() && Ctl.itemName(s).endsWith("_sword")) { best = i; if (i < 9) break; }
        }
        if (best < 0) return;
        if (best < 9) inv.setSelectedSlot(best);
        else mc.interactionManager.clickSlot(p.playerScreenHandler.syncId, best, inv.getSelectedSlot(), SlotActionType.SWAP, p);
    }

    /** Every game tick. */
    public void clientTick(MinecraftClient mc) {
        ticks++;
        if (!running) return;
        if (mc.player == null || mc.world == null) { stop(); stage = "Нет игры"; return; }
        if (mc.player.isDead()) { Move.fight(null); mc.player.requestRespawn(); return; }
        defend(mc);
        Move.tick(mc);
    }
}
