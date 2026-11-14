package ru.onedex.bot.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.config.BotConfig;
import ru.onedex.bot.farm.State;
import ru.onedex.bot.gui.R2D.Font;

/** While the bot works: a small card in the corner — what it does and how far it got. */
public final class Hud {
    private Hud() {}

    public static void render(DrawContext ctx, RenderTickCounter counter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (!Bot.INSTANCE.running() || !BotConfig.get().hud || mc.options.hudHidden || mc.currentScreen != null) return;
        R2D.begin(ctx);
        State st = State.get();
        BotConfig cfg = BotConfig.get();
        String stage = Bot.INSTANCE.stage();
        float t = System.nanoTime() / 1e9f;
        float x = 8, y = 8, w = Math.max(150, 46 + R2D.width(stage, Font.S9)), h = 34;
        R2D.roundRect(x, y, w, h, 9, 0xD90D1016);
        float pulse = 0.5f + 0.5f * (float) Math.sin(t * 4);
        R2D.circle(x + 12, y + 12, 3 + pulse * 2, 0x403BE07A);
        R2D.circle(x + 12, y + 12, 3, 0xFF3BE07A);
        R2D.textMid("1DEX1 BOT", Font.S8, x + 21, y + 12, 0xB3FFFFFF);
        R2D.textMid(R2D.fit(stage, Font.S9, w - 18), Font.S9, x + 9, y + 25, 0xFFFFFFFF);
        // progress of the current part
        float prog;
        switch (st.phase) {
            case "build" -> prog = st.site == null ? 0 : st.builtCount(st.farm) / (float) cfg.floors;
            case "farm", "both" -> prog = Math.min(1f, st.farmedMs / (cfg.farmMinutes * 60_000f));
            default -> prog = -1;
        }
        if (prog >= 0) {
            R2D.roundRect(x + 9, y + h - 4, w - 18, 2, 1, 0x26FFFFFF);
            R2D.roundRect(x + 9, y + h - 4, Math.max(2, (w - 18) * prog), 2, 1, 0xFF3BE07A);
        }
    }
}
