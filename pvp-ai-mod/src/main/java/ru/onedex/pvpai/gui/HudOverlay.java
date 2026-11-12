package ru.onedex.pvpai.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import ru.onedex.pvpai.analysis.Brain;
import ru.onedex.pvpai.analysis.FightSession;
import ru.onedex.pvpai.analysis.WinModel;
import ru.onedex.pvpai.config.ModConfig;
import ru.onedex.pvpai.gui.R2D.Font;

/** HUD mode: a compact glass card with the current fight analysis. */
public final class HudOverlay {
    private HudOverlay() {}

    private static float shown;
    private static long last = System.nanoTime();

    public static void render(DrawContext ctx, RenderTickCounter counter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        ModConfig c = ModConfig.INSTANCE;
        long now = System.nanoTime();
        float dt = Math.min(0.1f, (now - last) / 1e9f);
        last = now;
        FightSession s = (c.pvpAiEnabled && c.displayMode == 1 && mc.player != null && !mc.options.hudHidden) ? Brain.INSTANCE.focus() : null;
        float target = s != null ? 1 : 0;
        shown += (target - shown) * (1 - (float) Math.exp(-dt * 10));
        if (Math.abs(shown - target) < 0.002f) shown = target;
        if (shown <= 0.01f || s == null && shown < 0.02f) return;
        if (s == null) return;

        R2D.begin(ctx);
        R2D.alpha = shown;
        int sw = ctx.getScaledWindowWidth(), sh = ctx.getScaledWindowHeight();
        float w = 158;
        float x = sw - w - 10 + (1 - shown) * 20;
        float y = sh * 0.30f;
        WinModel.Result r = s.done ? s.result : s.live;
        boolean analyzing = !s.done;
        float h = analyzing ? 74 : 140;

        R2D.roundRect(x, y, w, h, 12, 0xB30C0E13);
        R2D.roundRect(x + 1, y + 1, w - 2, 16, 11, 0x0FFFFFFF);
        R2D.roundOutline(x, y, w, h, 12, 0.5f, 0x2EFFFFFF);

        int accent = c.accentColor();
        float px = x + 12;
        float cy = y + 14;
        R2D.circle(px + 2.5f, cy, 2.5f, accent);
        R2D.textMid("PvP AI", Font.M7, px + 9, cy, 0xB3E8ECF4);
        R2D.textMidRight(analyzing ? "анализ" : (s.partial ? "короткий бой" : "готово"), Font.M7, x + w - 12, cy, analyzing ? 0xB3E8ECF4 : Brain.GREEN);
        R2D.textMid(trim(s.enemyName, w - 24), Font.S9, px, y + 30, 0xFFFFFFFF);

        if (analyzing) {
            float prog = (float) Math.min(1, s.activeSeconds / c.analysisSeconds);
            float by = y + 46;
            R2D.roundRect(px, by, w - 24, 5, 2.5f, 0x26FFFFFF);
            R2D.roundRect(px, by, Math.max(5, (w - 24) * prog), 5, 2.5f, accent);
            int left = (int) Math.ceil(Math.max(0, c.analysisSeconds - s.activeSeconds));
            R2D.textMid("Собираю данные · осталось " + Brain.time(left), Font.M7, px, by + 15, 0xB3E8ECF4);
        } else if (r != null) {
            int col = Brain.color(r.p);
            String pct = Brain.pct(r.p);
            float py = y + 54;
            R2D.textMid(pct, Font.B20, px, py, col);
            float pw = R2D.width(pct, Font.B20);
            R2D.circle(px + pw + 8, py, 4f, col);
            R2D.textMid("шанс победы", Font.M7, px + pw + 16, py - 4, 0xB3E8ECF4);
            R2D.textMid("точность " + Math.round(r.confidence * 100) + "%", Font.M7, px + pw + 16, py + 6, 0x80E8ECF4);
            float ry = y + 76;
            R2D.rect(px, ry - 4, w - 24, 1f / R2D.scale(), 0x1FFFFFFF);
            ry = statRow("", "вы", "он", px, ry + 4, w - 24, 0x80E8ECF4);
            ry = statRow("Урон/с", String.format("%.1f", r.dpsMe), String.format("%.1f", r.dpsEnemy), px, ry, w - 24, 0xFFE8ECF4);
            ry = statRow("Попадания", r.hitsMe + "", r.hitsEnemy + "", px, ry, w - 24, 0xFFE8ECF4);
            ry = statRow("Криты", Brain.pctOrDash(r.critMe), Brain.pctOrDash(r.critEnemy), px, ry, w - 24, 0xFFE8ECF4);
            ry = statRow("Аим", Brain.degOrDash(r.aimMe), Brain.degOrDash(r.aimEnemy), px, ry, w - 24, 0xFFE8ECF4);
            statRow("Запас лечения", String.valueOf(Math.round(r.reserveMe.hp())), "~" + Math.round(r.reserveEnemyHp), px, ry, w - 24, 0xFFE8ECF4);
        }
        R2D.alpha = 1f;
    }

    private static float statRow(String label, String me, String en, float x, float y, float w, int color) {
        R2D.textMid(label, Font.M7, x, y, 0xB3E8ECF4);
        R2D.textMidRight(en, Font.M7, x + w, y, color);
        R2D.textMidRight(me, Font.M7, x + w - 40, y, color);
        return y + 10;
    }

    private static String trim(String s, float max) {
        if (R2D.width(s, Font.S9) <= max) return s;
        while (s.length() > 1 && R2D.width(s + "…", Font.S9) > max) s = s.substring(0, s.length() - 1);
        return s + "…";
    }
}
