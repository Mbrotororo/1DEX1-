package ru.onedex.bot.gui;

import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.input.KeyInput;
import net.minecraft.text.Text;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.config.BotConfig;
import ru.onedex.bot.farm.State;
import ru.onedex.bot.gui.R2D.Font;

/** F7: one card — what the bot does now, how far it got, a big start / stop button. */
public class BotMenuScreen extends Screen {
    private static final float W = 236, H = 196;
    private final long openedAt = System.nanoTime();
    private float cx, cy;          // card top-left (units)
    private float bx, by, bw, bh;  // start/stop button
    private float rx, ry, rw, rh;  // reset link
    private long resetArmedAt;

    static final String[] ALL_STEPS = {"Стеш", "Ферма", "Стройка", "Склад", "Фарм", "Продажа", "Бамбук"};
    /** The plan's steps as shown: without the bamboo farm unless it is turned on. */
    static String[] steps() {
        return BotConfig.get().bambooFarm ? ALL_STEPS : java.util.Arrays.copyOf(ALL_STEPS, ALL_STEPS.length - 1);
    }

    public BotMenuScreen() { super(Text.literal("1DEX1 Bot")); }

    @Override public boolean shouldPause() { return false; }

    @Override
    public boolean keyPressed(KeyInput input) {
        if (input.isEscape() || BotClient.MENU_KEY.matchesKey(input)) { close(); return true; }
        return super.keyPressed(input);
    }

    private float open() { return Ease.outCubic(Math.min(1f, (System.nanoTime() - openedAt) / 1e6f / 240f)); }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        R2D.begin(context);
        R2D.rect(0, 0, width, height, R2D.withAlpha(0x8C05070C, open()));
    }

    static int stepOf(String phase) {
        return switch (phase) {
            case "stash" -> 0;
            case "clear" -> 1;
            case "build" -> 2;
            case "storage" -> 3;
            case "farm", "both" -> 4;
            case "sell" -> 5;
            case "bamboo" -> 6;
            default -> 0;
        };
    }

    static String clock(long ms) {
        long m = ms / 60000;
        return m / 60 + ":" + String.format("%02d", m % 60);
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        R2D.begin(context);
        float e = open();
        R2D.alpha = e;
        cx = width / 2f - W / 2f;
        cy = height / 2f - H / 2f + (1 - e) * 8;
        boolean on = Bot.INSTANCE.running();
        State st = State.get();
        BotConfig cfg = BotConfig.get();
        float t = (System.nanoTime() / 1e9f);

        // card
        R2D.roundRect(cx - 1, cy - 1, W + 2, H + 2, 15, 0x30FFFFFF);
        R2D.roundRect(cx, cy, W, H, 14, 0xF00D1016);
        R2D.gradientV(cx + 14, cy, W - 28, 1, 0x40FFFFFF, 0x00FFFFFF);

        // title + live dot
        R2D.textMid("1DEX1", Font.B13, cx + 16, cy + 20, 0xFFFFFFFF);
        R2D.textMid("BOT", Font.S11, cx + 20 + R2D.width("1DEX1", Font.B13), cy + 20.5f, 0x99FFFFFF);
        int dot = on ? 0xFF3BE07A : 0xFF6B7280;
        float pulse = on ? 0.5f + 0.5f * (float) Math.sin(t * 4) : 0;
        R2D.circle(cx + W - 22, cy + 20, 3.2f + pulse * 2.2f, R2D.withAlpha(dot, 0.25f));
        R2D.circle(cx + W - 22, cy + 20, 3.2f, dot);

        // what it does now
        String stage = on ? Bot.INSTANCE.stage() : (st.site == null ? "Готов к запуску" : "На паузе");
        R2D.textMid(R2D.fit(stage, Font.S11, W - 32), Font.S11, cx + 16, cy + 46, 0xFFFFFFFF);

        // steps
        int cur = stepOf(st.phase);
        String[] STEPS = steps();
        float sx = cx + 16, sw = (W - 32) / STEPS.length;
        for (int i = 0; i < STEPS.length; i++) {
            float mx = sx + sw * i + sw / 2;
            boolean done = i < cur, now = i == cur;
            int col = now ? 0xFF3BE07A : (done ? 0xCCFFFFFF : 0x40FFFFFF);
            if (i > 0) R2D.rect(sx + sw * (i - 1) + sw / 2 + 4, cy + 64.5f, sw - 8, 1, done || now ? 0x80FFFFFF : 0x26FFFFFF);
            R2D.circle(mx, cy + 65, now ? 3.6f : 2.6f, col);
            if (now && on) R2D.circle(mx, cy + 65, 3.6f + pulse * 2.5f, R2D.withAlpha(col, 0.22f));
            R2D.textMidCentered(STEPS[i], Font.M6, mx, cy + 76, now ? 0xFFFFFFFF : 0x80FFFFFF);
        }

        // three numbers
        int f = st.farm;
        int built = st.site == null ? 0 : st.builtCount(f);
        String[][] tiles = {
                {f == 0 ? "Ягоды" : "Бамбук", built + " / " + cfg.floors},
                {"Фарм", clock(st.farmedMs) + " / " + clock(cfg.farmMinutes * 60_000L)},
                {"Продано", String.format("%,d", st.sold).replace(',', ' ')},
        };
        float tw = (W - 32 - 12) / 3f;
        for (int i = 0; i < 3; i++) {
            float x = cx + 16 + i * (tw + 6), y = cy + 90;
            R2D.roundRect(x, y, tw, 38, 9, 0x14FFFFFF);
            R2D.textMid(tiles[i][0], Font.M7, x + 9, y + 12, 0x8CFFFFFF);
            R2D.textMid(R2D.fit(tiles[i][1], Font.S9, tw - 14), Font.S9, x + 9, y + 26, 0xFFFFFFFF);
        }

        // start / stop
        bx = cx + 16; by = cy + 140; bw = W - 32; bh = 30;
        boolean hover = mouseX >= bx && mouseX <= bx + bw && mouseY >= by && mouseY <= by + bh;
        int c1 = on ? 0xFFE5484D : 0xFF22C55E;
        R2D.roundRect(bx, by, bw, bh, 10, hover ? R2D.lerpColor(c1, 0xFFFFFFFF, 0.08f) : c1);
        R2D.textMidCentered(on ? "СТОП" : "СТАРТ", Font.B13, bx + bw / 2, by + bh / 2 + 0.5f, 0xFFFFFFFF);

        // reset (needs a second click)
        boolean armed = System.currentTimeMillis() - resetArmedAt < 3000;
        String rs = armed ? "Нажми ещё раз — начать всё заново" : "Сбросить прогресс";
        rw = R2D.width(rs, Font.M6); rh = 9;
        rx = cx + W / 2 - rw / 2; ry = cy + H - 15;
        boolean rHover = mouseX >= rx && mouseX <= rx + rw && mouseY >= ry - 4 && mouseY <= ry + rh;
        R2D.textMid(rs, Font.M6, rx, ry, armed ? 0xFFFF8A80 : (rHover ? 0xB3FFFFFF : 0x59FFFFFF));
        R2D.alpha = 1f;
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubled) {
        double mx = click.x(), my = click.y();
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
            if (Bot.INSTANCE.running()) Bot.INSTANCE.stop();
            else { Bot.INSTANCE.start(); close(); }
            return true;
        }
        if (mx >= rx && mx <= rx + rw && my >= ry - 4 && my <= ry + rh) {
            if (System.currentTimeMillis() - resetArmedAt < 3000) {
                Bot.INSTANCE.stop();
                State.reset();
                resetArmedAt = 0;
            } else resetArmedAt = System.currentTimeMillis();
            return true;
        }
        return super.mouseClicked(click, doubled);
    }
}
