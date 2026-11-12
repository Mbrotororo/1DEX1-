package ru.onedex.pvpai.gui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ChatScreen;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.SkinTextures;
import ru.onedex.pvpai.analysis.Brain;
import ru.onedex.pvpai.analysis.FightSession;
import ru.onedex.pvpai.analysis.WinModel;
import ru.onedex.pvpai.config.ModConfig;
import ru.onedex.pvpai.gui.R2D.Font;

/**
 * HUD mode: a compact card with the current fight analysis.
 * While the chat is open it can be moved with the mouse, resized by dragging its edges/corners, reset with RMB.
 */
public final class HudOverlay {
    private HudOverlay() {}

    private static final float W = 126;

    private static float shown;
    private static long last = System.nanoTime();
    private static float shownH = -1;
    /** Displayed position in pixels (smoothly follows the configured one). */
    private static float dispX = Float.NaN, dispY = Float.NaN;
    /** Last drawn card rectangle in GUI units (for mouse handling). */
    private static float rectX, rectY, rectW, rectH;
    private static boolean visible;
    private static boolean dragging;
    private static double grabX, grabY;
    private static float editGlow;
    /** Smoothly displayed scale. */
    private static float dispScale = Float.NaN;
    /** Resize state: which edges are grabbed and the fixed opposite corner (GUI units). */
    private static boolean resizing;
    private static int edgeX, edgeY; // -1 = left/top, 1 = right/bottom, 0 = not grabbed
    private static double anchorX, anchorY;
    private static float hoverEdges;
    private static final float EDGE = 5;

    private static boolean editing(MinecraftClient mc) {
        return mc.currentScreen instanceof ChatScreen;
    }

    private static boolean enabled() {
        ModConfig c = ModConfig.INSTANCE;
        return c.pvpAiEnabled && c.displayMode == 1;
    }

    public static void render(DrawContext ctx, RenderTickCounter counter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        ModConfig c = ModConfig.INSTANCE;
        long now = System.nanoTime();
        float dt = Math.min(0.1f, (now - last) / 1e9f);
        last = now;
        visible = false;
        if (mc.player == null || mc.options.hudHidden || mc.currentScreen instanceof MenuScreen || !enabled()) {
            shown = 0;
            return;
        }
        boolean edit = editing(mc);
        FightSession s = Brain.INSTANCE.focus();
        boolean preview = s == null && edit;
        float target = (s != null || preview) ? 1 : 0;
        shown += (target - shown) * (1 - (float) Math.exp(-dt * 12));
        if (Math.abs(shown - target) < 0.002f) shown = target;
        if (shown <= 0.01f || (s == null && !preview)) return;

        R2D.begin(ctx);
        int gs = R2D.guiScale();
        if (Float.isNaN(dispScale)) dispScale = c.hudScale;
        dispScale += (c.hudScale - dispScale) * (1 - (float) Math.exp(-dt * (resizing ? 30 : 16)));
        if (Math.abs(dispScale - c.hudScale) < 0.001f) dispScale = c.hudScale;
        float k = gs * dispScale;
        R2D.unit(k);

        WinModel.Result r = s == null ? null : (s.done ? s.result : s.live);
        boolean analyzing = s != null && !s.done;
        float h = analyzing ? 44 : 60;
        if (shownH < 0) shownH = h;
        shownH += (h - shownH) * (1 - (float) Math.exp(-dt * 14));

        // ---- position (pixels), smoothly following the saved fraction
        int screenW = ctx.getScaledWindowWidth() * gs, screenH = ctx.getScaledWindowHeight() * gs;
        float wPx = W * k, hPx = shownH * k;
        float tx = c.hudX * Math.max(0, screenW - wPx);
        float ty = c.hudY * Math.max(0, screenH - hPx);
        if (Float.isNaN(dispX)) {
            dispX = tx;
            dispY = ty;
        }
        float follow = 1 - (float) Math.exp(-dt * (dragging || resizing ? 30 : 16));
        dispX += (tx - dispX) * follow;
        dispY += (ty - dispY) * follow;
        float x = Math.round(dispX) / k, y = Math.round(dispY) / k;
        rectX = dispX / gs;
        rectY = dispY / gs;
        rectW = wPx / gs;
        rectH = hPx / gs;
        visible = true;

        Theme th = Theme.current();
        int accent = c.accentColor();
        R2D.alpha = shown;
        int bg = th.panel();
        if (((bg >>> 24) & 255) < 0xD0) bg = (0xD0 << 24) | (bg & 0xFFFFFF);
        R2D.roundRect(x, y, W, shownH, 9, bg);
        editGlow += ((edit ? 1 : 0) - editGlow) * (1 - (float) Math.exp(-dt * 10));
        R2D.roundOutline(x, y, W, shownH, 9, 0.5f, R2D.lerpColor(th.border(), accent, editGlow));

        // ---- header: head, name, status, percent
        String name = preview ? "Игрок" : s.enemyName;
        drawHead(ctx, mc, s, x + 8, y + 9, 18);
        float right = x + W - 8;
        String status;
        if (preview) status = "пример";
        else if (analyzing) status = "анализ…";
        else status = s.partial ? "шанс победы · короткий бой" : "шанс победы";

        float pctW = 0;
        if (analyzing) {
            int left = (int) Math.ceil(Math.max(0, c.analysisSeconds - s.activeSeconds));
            String t = Brain.time(left);
            R2D.textMidRight(t, Font.S9, right, y + 18, th.text());
            pctW = R2D.width(t, Font.S9) + 4;
        } else {
            double p = preview ? 0.64 : (r != null ? r.p : 0.5);
            int col = Brain.color(p);
            String pct = Brain.pct(p);
            R2D.circle(right - 3, y + 18, 3f, col);
            R2D.textMidRight(pct, Font.B13, right - 9, y + 18, col);
            pctW = R2D.width(pct, Font.B13) + 13;
        }
        float textX = x + 31;
        float textMax = right - pctW - textX;
        R2D.textMid(R2D.fit(name, Font.S8, textMax), Font.S8, textX, y + 13, th.text());
        R2D.textMid(R2D.fit(status, Font.M6, textMax), Font.M6, textX, y + 23.5f, th.sub());

        if (analyzing) {
            float prog = (float) Math.min(1, s.activeSeconds / c.analysisSeconds);
            float by = y + 34;
            R2D.roundRect(x + 8, by, W - 16, 3, 1.5f, th.control());
            R2D.roundRect(x + 8, by, Math.max(3, (W - 16) * prog), 3, 1.5f, accent);
        } else if (shownH > 50) {
            R2D.rect(x + 8, y + 34, W - 16, 1f / k, th.border());
            String[] labels = {"Урон/с", "Хиты", "Аим"};
            String[] values;
            if (preview || r == null) {
                values = new String[]{"2.4/1.7", "18/12", "4°/9°"};
            } else {
                values = new String[]{
                        String.format("%.1f/%.1f", r.dpsMe, r.dpsEnemy),
                        r.hitsMe + "/" + r.hitsEnemy,
                        deg(r.aimMe) + "/" + deg(r.aimEnemy)};
            }
            float colW = (W - 16) / 3f;
            for (int i = 0; i < 3; i++) {
                float cx = x + 8 + colW * i + colW / 2f;
                R2D.textMidCentered(labels[i], Font.M6, cx, y + 41, th.sub());
                R2D.textMidCentered(R2D.fit(values[i], Font.M6, colW - 2), Font.M6, cx, y + 51, th.text());
            }
        }

        if (edit) {
            // resize handles on the corners and edge midpoints
            double mx = mc.mouse.getScaledX(mc.getWindow()), my = mc.mouse.getScaledY(mc.getWindow());
            boolean nearEdge = resizing || (!dragging && edgeAt(mx, my) != 0);
            hoverEdges += ((nearEdge ? 1 : 0) - hoverEdges) * (1 - (float) Math.exp(-dt * 14));
            float hr = 2.2f + hoverEdges * 0.8f;
            int hc = R2D.lerpColor(R2D.withAlpha(accent, 0.75f), accent, hoverEdges);
            float[][] pts = {{x, y}, {x + W, y}, {x, y + shownH}, {x + W, y + shownH},
                    {x + W / 2f, y}, {x + W / 2f, y + shownH}, {x, y + shownH / 2f}, {x + W, y + shownH / 2f}};
            for (float[] pt : pts) {
                R2D.circle(pt[0], pt[1], hr + 0.8f, 0xFFFFFFFF);
                R2D.circle(pt[0], pt[1], hr, hc);
            }
            String tip = resizing ? "размер " + Math.round(c.hudScale * 100) + "%"
                    : "тяни — двигать · тяни за край — размер " + Math.round(c.hudScale * 100) + "% · ПКМ — сброс";
            Font tf = resizing ? Font.S9 : Font.M6;
            float tw = R2D.width(tip, tf);
            float th2 = resizing ? 14 : 10;
            float tipX = Math.max(7, Math.min(x + W / 2f - tw / 2f, screenW / k - tw - 7));
            float tipY = y + shownH + 6 + th2 / 2f;
            if ((tipY + th2) * k > screenH) tipY = y - 6 - th2 / 2f;
            R2D.roundRect(tipX - 6, tipY - th2 / 2f, tw + 12, th2, th2 / 2f, 0xC0000000);
            R2D.textMid(tip, tf, tipX, tipY, 0xFFFFFFFF);
        }
        R2D.alpha = 1f;
        R2D.unit(gs);
    }

    private static String deg(double v) {
        return v < 0 ? "—" : Math.round(v) + "°";
    }

    private static void drawHead(DrawContext ctx, MinecraftClient mc, FightSession s, float x, float y, float size) {
        SkinTextures skin = null;
        if (s == null) {
            skin = mc.player.getSkin();
        } else {
            Entity e = mc.world.getEntityById(s.enemyId);
            if (e instanceof AbstractClientPlayerEntity p && p.getUuid().equals(s.enemyUuid)) skin = p.getSkin();
            else if (mc.getNetworkHandler() != null) {
                PlayerListEntry pe = mc.getNetworkHandler().getPlayerListEntry(s.enemyUuid);
                if (pe != null) skin = pe.getSkinTextures();
            }
        }
        R2D.roundRect(x - 1, y - 1, size + 2, size + 2, 4, 0x33000000);
        if (skin != null) R2D.head(skin, x, y, size);
    }

    // ------------------------------------------------------------------ chat editing

    private static boolean over(double mx, double my) {
        return visible && mx >= rectX && mx < rectX + rectW && my >= rectY && my < rectY + rectH;
    }

    /** Which edges are under the mouse: bit 1/2 = left/right, bit 4/8 = top/bottom, 0 = none. */
    private static int edgeAt(double mx, double my) {
        if (!visible) return 0;
        if (mx < rectX - EDGE || mx > rectX + rectW + EDGE || my < rectY - EDGE || my > rectY + rectH + EDGE) return 0;
        int e = 0;
        if (Math.abs(mx - rectX) <= EDGE) e |= 1;
        else if (Math.abs(mx - (rectX + rectW)) <= EDGE) e |= 2;
        if (Math.abs(my - rectY) <= EDGE) e |= 4;
        else if (Math.abs(my - (rectY + rectH)) <= EDGE) e |= 8;
        return e;
    }

    /** @return true if the HUD consumed the click */
    public static boolean onClick(Click click) {
        if (!enabled() || !visible) return false;
        int edges = edgeAt(click.x(), click.y());
        if (click.button() == 0 && edges != 0) {
            resizing = true;
            edgeX = (edges & 1) != 0 ? -1 : (edges & 2) != 0 ? 1 : 0;
            edgeY = (edges & 4) != 0 ? -1 : (edges & 8) != 0 ? 1 : 0;
            // the opposite side stays where it is
            anchorX = edgeX < 0 ? rectX + rectW : rectX;
            anchorY = edgeY < 0 ? rectY + rectH : rectY;
            return true;
        }
        if (!over(click.x(), click.y())) return false;
        if (click.button() == 0) {
            dragging = true;
            grabX = click.x() - rectX;
            grabY = click.y() - rectY;
            return true;
        }
        if (click.button() == 1) {
            ModConfig c = ModConfig.INSTANCE;
            c.hudX = 0.97f;
            c.hudY = 0.32f;
            c.hudScale = 1.0f;
            ModConfig.save();
            return true;
        }
        return false;
    }

    public static boolean onDrag(Click click) {
        if (!dragging && !resizing) return false;
        MinecraftClient mc = MinecraftClient.getInstance();
        ModConfig c = ModConfig.INSTANCE;
        float screenW = mc.getWindow().getScaledWidth(), screenH = mc.getWindow().getScaledHeight();
        if (resizing) {
            // card size at 100% in GUI units
            float baseW = W, baseH = Math.max(1, shownH);
            double sx = edgeX != 0 ? Math.abs(click.x() - anchorX) / baseW : 0;
            double sy = edgeY != 0 ? Math.abs(click.y() - anchorY) / baseH : 0;
            float scale = (float) Math.max(sx, sy);
            scale = Math.max(0.5f, Math.min(1.5f, Math.round(scale * 100f) / 100f));
            c.hudScale = scale;
            float w = baseW * scale, h = baseH * scale;
            double left = edgeX < 0 ? anchorX - w : (edgeX > 0 ? anchorX : rectX + rectW / 2.0 - w / 2.0);
            double top = edgeY < 0 ? anchorY - h : (edgeY > 0 ? anchorY : rectY + rectH / 2.0 - h / 2.0);
            if (edgeX == 0) left = rectX;
            if (edgeY == 0) top = rectY;
            c.hudX = (float) Math.max(0, Math.min(1, left / Math.max(1, screenW - w)));
            c.hudY = (float) Math.max(0, Math.min(1, top / Math.max(1, screenH - h)));
            return true;
        }
        double nx = click.x() - grabX, ny = click.y() - grabY;
        float freeW = Math.max(1, screenW - rectW), freeH = Math.max(1, screenH - rectH);
        c.hudX = (float) Math.max(0, Math.min(1, nx / freeW));
        c.hudY = (float) Math.max(0, Math.min(1, ny / freeH));
        return true;
    }

    public static boolean onRelease(Click click) {
        if (!dragging && !resizing) return false;
        dragging = false;
        resizing = false;
        ModConfig.save();
        return true;
    }
}
