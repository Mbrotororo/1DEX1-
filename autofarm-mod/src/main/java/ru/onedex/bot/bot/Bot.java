package ru.onedex.bot.bot;

import net.minecraft.client.MinecraftClient;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.farm.Plan;

/** The bot: one thread that runs the plan while the game shows what happens. */
public final class Bot {
    public static final Bot INSTANCE = new Bot();
    private Bot() {}

    private volatile boolean running;
    private volatile long ticks;
    private Thread thread;

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

    public void stage(String s) {
        if (!s.equals(stage)) BotClient.LOGGER.info("[bot] {}", s);
        stage = s;
    }
    public void act(String s) { act = s; }

    public synchronized void start() {
        if (running) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null) return;
        running = true;
        startedAt = System.currentTimeMillis();
        lastError = "";
        mc.options.pauseOnLostFocus = false;   // the game must keep going while you watch from another window
        Move.activate(true);
        thread = new Thread(this::loop, "1DEX1 Bot");
        thread.setDaemon(true);
        thread.start();
    }

    public synchronized void stop() {
        running = false;
        Move.activate(false);
        MinecraftClient mc = MinecraftClient.getInstance();
        mc.execute(() -> {
            if (mc.interactionManager != null) mc.interactionManager.cancelBlockBreaking();
        });
        stage = "Остановлен";
        act = "";
    }

    public void toggle() { if (running) stop(); else start(); }

    private void loop() {
        while (running) {
            try {
                Plan.run();
            } catch (Ctl.Stopped s) {
                break;
            } catch (Throwable t) {
                lastError = t.getMessage() == null ? t.toString() : t.getMessage();
                BotClient.LOGGER.error("[bot] ошибка, начинаю шаг заново", t);
                Move.clear();
                try { Thread.sleep(3000); } catch (InterruptedException e) { break; }
            }
        }
        Move.activate(false);
    }

    /** Every game tick. */
    public void clientTick(MinecraftClient mc) {
        ticks++;
        if (!running) return;
        if (mc.player == null || mc.world == null) { stop(); stage = "Нет игры"; return; }
        if (mc.player.isDead()) mc.player.requestRespawn();
        Move.tick(mc);
    }
}
