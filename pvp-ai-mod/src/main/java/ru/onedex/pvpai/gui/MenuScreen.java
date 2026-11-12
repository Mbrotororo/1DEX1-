package ru.onedex.pvpai.gui;

import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.input.KeyInput;
import net.minecraft.text.Text;
import ru.onedex.pvpai.PvpAiClient;
import ru.onedex.pvpai.analysis.Brain;
import ru.onedex.pvpai.config.ModConfig;
import ru.onedex.pvpai.gui.R2D.Font;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntConsumer;

/** The 1DEX1 menu (F8): PvP AI and Визуал. */
public class MenuScreen extends Screen {
    private static final String[] MODES = {"Над ником", "HUD"};

    private static final float MAIN_W = 196;
    private static final float SET_W = 220;
    private static final float GAP = 8;
    private static final float ROW_H = 36;

    /** Which settings panel is open (-1 = none), remembered between openings. */
    private static int openIdx = -1;
    private static int shownIdx = -1;
    private static final float[] MEASURED = {200, 190};

    private final long openedAt = System.nanoTime();
    private boolean closing;
    private long closingAt;
    private boolean closedForReal;
    private float openProgress;

    private long lastFrame = System.nanoTime();
    private float dt;
    private final Map<String, Float> anims = new HashMap<>();
    private final List<Hot> hots = new ArrayList<>();
    private Hot dragging;
    private float scroll, scrollTarget, maxScroll;

    private float pivotX, pivotY, curScale = 1, curOffY;
    private float clipTop = -1e9f, clipBottom = 1e9f;
    private boolean resetArmed;
    private long resetArmedAt;
    private int frames;

    private interface Drag {
        void at(double x, double y);
    }

    private record Hot(float x, float y, float w, float h, IntConsumer click, Drag drag) {
        boolean contains(double mx, double my) {
            return mx >= x && mx < x + w && my >= y && my < y + h;
        }
    }

    public MenuScreen() {
        super(Text.literal("1DEX1"));
    }

    private static ModConfig cfg() {
        return ModConfig.INSTANCE;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    /** Blur amount 0..10 while this screen is open (fed to the blur shader as MenuBlurRadius, used to fade it in). */
    public int blurRadius() {
        if (!Theme.current().blur()) return 0;
        return Math.max(0, Math.min(10, Math.round(10 * openProgress)));
    }

    // ------------------------------------------------------------------ open / close

    @Override
    public void close() {
        ModConfig.save();
        if (!closing) {
            closing = true;
            closingAt = System.nanoTime();
        }
    }

    private void reallyClose() {
        if (closedForReal) return;
        closedForReal = true;
        if (client != null) client.send(() -> {
            if (client.currentScreen == this) client.setScreen(null);
        });
    }

    private float computeOpen() {
        long now = System.nanoTime();
        if (closing) {
            float t = (now - closingAt) / 1e6f / 170f;
            if (t >= 1f) {
                reallyClose();
                return 0f;
            }
            float start = Math.min(1f, (closingAt - openedAt) / 1e6f / 260f);
            return Ease.inCubic(1f - t) * Ease.outCubic(start);
        }
        return Ease.outCubic(Math.min(1f, (now - openedAt) / 1e6f / 260f));
    }

    // ------------------------------------------------------------------ input

    @Override
    public boolean keyPressed(KeyInput input) {
        if (input.isEscape() || PvpAiClient.MENU_KEY.matchesKey(input)) {
            close();
            return true;
        }
        return super.keyPressed(input);
    }

    private double localX(double mx) {
        return pivotX + (mx - pivotX) / curScale;
    }

    private double localY(double my) {
        return pivotY + (my - pivotY) / curScale - curOffY;
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubled) {
        if (closing) return true;
        double mx = localX(click.x()), my = localY(click.y());
        for (int i = hots.size() - 1; i >= 0; i--) {
            Hot h = hots.get(i);
            if (h.contains(mx, my)) {
                if (h.drag != null && click.button() == 0) {
                    dragging = h;
                    h.drag.at(mx, my);
                } else if (h.click != null) {
                    h.click.accept(click.button());
                }
                return true;
            }
        }
        return super.mouseClicked(click, doubled);
    }

    @Override
    public boolean mouseDragged(Click click, double offsetX, double offsetY) {
        if (dragging != null) {
            dragging.drag.at(localX(click.x()), localY(click.y()));
            return true;
        }
        return super.mouseDragged(click, offsetX, offsetY);
    }

    @Override
    public boolean mouseReleased(Click click) {
        if (dragging != null) {
            dragging = null;
            ModConfig.save();
            return true;
        }
        return super.mouseReleased(click);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        scrollTarget = Math.max(0, Math.min(maxScroll, scrollTarget - (float) verticalAmount * 24));
        return true;
    }

    private void hot(float x, float y, float w, float h, IntConsumer click, Drag drag) {
        float cy = y + h / 2f;
        if (cy < clipTop || cy > clipBottom) return;
        hots.add(new Hot(x, y, w, h, click, drag));
    }

    private boolean hovered(float x, float y, float w, float h, double mx, double my) {
        if (closing) return false;
        double lx = localX(mx), ly = localY(my);
        float cy = y + h / 2f;
        if (cy < clipTop || cy > clipBottom) return false;
        return lx >= x && lx < x + w && ly >= y && ly < y + h;
    }

    private float anim(String key, float target, float speed) {
        float v = anims.getOrDefault(key, target);
        v += (target - v) * (1f - (float) Math.exp(-dt * speed));
        if (Math.abs(target - v) < 0.001f) v = target;
        anims.put(key, v);
        return v;
    }

    private float animFrom(String key, float initial, float target, float speed) {
        if (!anims.containsKey(key)) anims.put(key, initial);
        return anim(key, target, speed);
    }

    // ------------------------------------------------------------------ render

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
        openProgress = computeOpen();
        Theme th = Theme.current();
        if (th.blur() && blurRadius() >= 1) context.applyBlur();
        R2D.begin(context);
        R2D.rect(0, 0, width, height, R2D.withAlpha(th.overlay(), openProgress));
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
        long now = System.nanoTime();
        dt = Math.min(0.1f, (now - lastFrame) / 1e9f);
        lastFrame = now;
        R2D.begin(context);
        R2D.elements = 0;
        hots.clear();
        Theme th = Theme.current();
        float e = openProgress;

        float sa = anim("settings", openIdx >= 0 ? 1 : 0, 14);
        float rightW = Math.min(SET_W, width - 20 - MAIN_W - GAP);
        float groupW = MAIN_W + GAP + rightW;
        float mainClosedX = (width - MAIN_W) / 2f;
        float mainOpenX = (width - groupW) / 2f;
        float mainX = mainClosedX + (mainOpenX - mainClosedX) * sa;
        float mainH = 44 + 6 + ROW_H + 4 + ROW_H + 26;
        float top = Math.max(10, (height - 250) / 2f);
        float maxH = height - top - 10;

        pivotX = width / 2f;
        pivotY = top + 60;
        curScale = 0.94f + 0.06f * e;
        curOffY = (1f - e) * 10f;
        R2D.alpha = e;

        context.getMatrices().pushMatrix();
        context.getMatrices().translate(pivotX, pivotY + curOffY);
        context.getMatrices().scale(curScale, curScale);
        context.getMatrices().translate(-pivotX, -pivotY);

        drawMain(th, mainX, top, mainH, mouseX, mouseY);
        if (sa > 0.01f && shownIdx >= 0) {
            float a = R2D.alpha;
            R2D.alpha = a * sa;
            float sx = mainX + MAIN_W + GAP + (1 - sa) * 14;
            drawSettingsPanel(th, shownIdx, sx, top, rightW, maxH, mouseX, mouseY, sa > 0.6f);
            R2D.alpha = a;
        }

        context.getMatrices().popMatrix();
        R2D.alpha = 1f;

        if (PvpAiClient.DEV && ++frames % 120 == 0) {
            PvpAiClient.LOGGER.info("[dev] menu draw elements per frame: {}", R2D.elements);
        }
    }

    private void panelBg(Theme th, float x, float y, float w, float h, float r) {
        R2D.roundRect(x, y, w, h, r, th.panel());
        R2D.roundOutline(x, y, w, h, r, 0.5f, th.border());
    }

    private void drawMain(Theme th, float x, float y, float h, int mouseX, int mouseY) {
        panelBg(th, x, y, MAIN_W, h, 14);
        int accent = cfg().accentColor();
        float hx = x + 14;
        float hcy = y + 22;
        R2D.roundRect(hx, hcy - 11, 22, 22, 7, accent);
        R2D.textMidCentered("1D", Font.S9, hx + 11, hcy, Theme.onAccent());
        R2D.textMid("1DEX1", Font.S11, hx + 31, hcy - 5, th.text());
        R2D.textMid("PvP AI client", Font.M7, hx + 31, hcy + 7, th.sub());
        R2D.textMidRight("v1.1", Font.M7, x + MAIN_W - 14, hcy - 5, R2D.withAlpha(th.sub(), 0.7f));
        R2D.rect(x + 12, y + 44, MAIN_W - 24, 1f / R2D.guiScale(), th.border());

        float ry = y + 44 + 6;
        drawModuleRow(th, 0, x, ry, mouseX, mouseY);
        drawModuleRow(th, 1, x, ry + ROW_H + 4, mouseX, mouseY);
        R2D.textMidCentered("ЛКМ — вкл  ·  ПКМ — настройки", Font.M7, x + MAIN_W / 2f, y + h - 13, R2D.withAlpha(th.sub(), 0.75f));
    }

    private void openSettings(int idx) {
        if (openIdx == idx) {
            openIdx = -1;
        } else {
            openIdx = idx;
            shownIdx = idx;
            scroll = scrollTarget = 0;
            anims.put("content", 0f);
            anims.remove("setH");
        }
    }

    private void drawModuleRow(Theme th, int idx, float px, float y, int mouseX, int mouseY) {
        float x = px + 6;
        float w = MAIN_W - 12;
        boolean hov = hovered(x, y, w, ROW_H, mouseX, mouseY);
        float hv = anim("hover" + idx, hov ? 1 : 0, 18);
        float sel = anim("sel" + idx, openIdx == idx ? 1 : 0, 14);
        int accent = cfg().accentColor();
        if (sel > 0.01f) R2D.roundRect(x, y, w, ROW_H, 10, R2D.withAlpha(accent, 0.16f * sel));
        if (hv > 0.01f) R2D.roundRect(x, y, w, ROW_H, 10, R2D.withAlpha(th.hover(), hv));

        boolean active = idx != 0 || cfg().pvpAiEnabled;
        float icx = x + 18, icy = y + ROW_H / 2f;
        R2D.roundRect(icx - 11, icy - 11, 22, 22, 7, R2D.withAlpha(accent, active ? 0.22f : 0.10f));
        int ic = active ? accent : R2D.withAlpha(th.sub(), 0.8f);
        if (idx == 0) R2D.icon("crosshair", icx, icy, 16, ic, Icons::crosshair);
        else R2D.icon("sliders", icx, icy, 16, ic, Icons::sliders);

        String title = idx == 0 ? "PvP AI" : "Визуал";
        String sub = idx == 0 ? (cfg().pvpAiEnabled ? "Анализирует бой" : "Шанс победы в бою") : "Внешний вид меню";
        R2D.textMid(title, Font.S9, x + 35, icy - 5, th.text());
        R2D.textMid(sub, Font.M7, x + 35, icy + 6, th.sub());

        float rightX = x + w - 8;
        int bucket = Math.round(sel * 9);
        R2D.icon("chev" + bucket, rightX - 2, icy, 10, th.sub(), (c, s) -> Icons.chevron(c, s, bucket * 10));
        if (idx == 0) {
            float t = anim("tgl_main", cfg().pvpAiEnabled ? 1 : 0, 16);
            toggle(th, rightX - 12 - 28, icy, t);
        }

        hot(x, y, w, ROW_H, b -> {
            if (idx == 0 && b == 0) {
                cfg().pvpAiEnabled = !cfg().pvpAiEnabled;
                ModConfig.save();
            } else if (b == 0 || b == 1) {
                openSettings(idx);
            }
        }, null);
        hot(rightX - 8, y, 12, ROW_H, b -> openSettings(idx), null);
    }

    private void drawSettingsPanel(Theme th, int idx, float x, float y, float w, float maxH, int mouseX, int mouseY, boolean interactive) {
        float headerH = 34;
        float contentH = MEASURED[idx];
        float h = Math.min(maxH, headerH + contentH);
        float animH = animFrom("setH", h, h, 16);
        panelBg(th, x, y, w, animH, 14);
        String name = idx == 0 ? "PvP AI" : "Визуал";
        R2D.textMid(name, Font.S9, x + 14, y + 13, th.text());
        R2D.textMid("настройки", Font.M7, x + 14 + R2D.width(name, Font.S9) + 6, y + 13.5f, th.sub());
        R2D.rect(x + 12, y + 26, w - 24, 1f / R2D.guiScale(), th.border());

        float viewTop = y + headerH - 4;
        float viewH = animH - headerH + 4;
        maxScroll = Math.max(0, contentH - viewH + 6);
        if (maxScroll <= 6) maxScroll = 0;
        scrollTarget = Math.min(scrollTarget, maxScroll);
        scroll = anim("scroll", scrollTarget, 18);

        DrawContext ctx = R2D.ctx();
        ctx.enableScissor((int) Math.floor(x), (int) Math.floor(viewTop), (int) Math.ceil(x + w), (int) Math.ceil(viewTop + viewH - 2));
        float oldTop = clipTop, oldBottom = clipBottom;
        clipTop = interactive ? viewTop : 1e9f;
        clipBottom = interactive ? viewTop + viewH - 2 : -1e9f;
        float a = R2D.alpha;
        R2D.alpha = a * anim("content", 1, 12);
        float cy = viewTop - scroll;
        float used = idx == 0 ? drawAiSettings(th, x + 14, cy, w - 28, mouseX, mouseY) : drawVisualSettings(th, x + 14, cy, w - 28, mouseX, mouseY);
        R2D.alpha = a;
        clipTop = oldTop;
        clipBottom = oldBottom;
        ctx.disableScissor();
        MEASURED[idx] = used;

        if (maxScroll > 0) {
            float trackH = viewH - 12;
            float barH = Math.max(14, trackH * viewH / (contentH + 6));
            float barY = viewTop + 4 + (trackH - barH) * (scroll / maxScroll);
            R2D.roundRect(x + w - 5, barY, 2.5f, barH, 1.25f, R2D.withAlpha(th.sub(), 0.45f));
        }
    }

    // ------------------------------------------------------------------ settings pages

    private float drawAiSettings(Theme th, float x, float y, float w, int mx, int my) {
        float y0 = y;
        y += 4;
        int secs = cfg().analysisSeconds;
        String quality = secs <= 45 ? "слабый" : secs <= 90 ? "средний" : secs <= 180 ? "хороший" : "самый точный";
        y = slider(th, "ai_time", "Время анализа", Brain.time(secs) + " · " + quality, x, y, w, (secs - 30) / 270f, v -> {
            int s = (int) Math.round(30 + v * 270);
            cfg().analysisSeconds = Math.max(30, Math.min(300, Math.round(s / 15f) * 15));
        }, mx, my);
        y = segmented(th, "ai_mode", "Режим отображения", MODES, cfg().displayMode, i -> cfg().displayMode = i, x, y, w);

        boolean hud = cfg().displayMode == 1;
        float a = R2D.alpha;
        if (!hud) R2D.alpha = a * 0.45f;
        y = slider(th, "ai_hud", "Размер HUD", Math.round(cfg().hudScale * 100) + "%", x, y, w, (cfg().hudScale - 0.5f),
                v -> cfg().hudScale = Math.round((0.5f + (float) v) * 20f) / 20f, mx, my);
        R2D.alpha = a;
        if (hud) {
            R2D.textMid("Открой чат (T), чтобы двигать HUD мышкой", Font.M6, x, y - 3, R2D.withAlpha(th.sub(), 0.85f));
            y += 9;
        }

        y = toggleRow(th, "ai_all", "Прогноз для всех игроков", cfg().forecastAll, () -> cfg().forecastAll = !cfg().forecastAll, x, y, w);

        R2D.textMid("В анализе: " + Brain.INSTANCE.trackedPlayers() + "  ·  в памяти: " + Brain.INSTANCE.knownProfiles(), Font.M7, x, y + 6, th.sub());
        y += 16;

        if (resetArmed && System.nanoTime() - resetArmedAt > 3_000_000_000L) resetArmed = false;
        y = button(th, "ai_reset", resetArmed ? "Нажми ещё раз для сброса" : "Сбросить память", x, y, w, resetArmed ? Brain.RED : 0, () -> {
            if (resetArmed) {
                Brain.INSTANCE.resetAll();
                resetArmed = false;
            } else {
                resetArmed = true;
                resetArmedAt = System.nanoTime();
            }
        }, mx, my);
        return y - y0 + 8;
    }

    private float drawVisualSettings(Theme th, float x, float y, float w, int mx, int my) {
        float y0 = y;
        y += 4;
        y = segmented(th, "v_bg", "Фон", Theme.BACKGROUNDS, cfg().background, i -> cfg().background = i, x, y, w);
        y = segmented(th, "v_type", "Тип", Theme.TYPES, cfg().glass ? 1 : 0, i -> cfg().glass = i == 1, x, y, w);
        y = colorPicker(th, x, y, w);
        return y - y0 + 8;
    }

    // ------------------------------------------------------------------ widgets

    private interface Setter {
        void set(double v);
    }

    private float slider(Theme th, String id, String label, String value, float x, float y, float w, float v, Setter setter, int mx, int my) {
        R2D.textMid(label, Font.M8, x, y + 6, th.text());
        R2D.textMidRight(value, Font.M7, x + w, y + 6, th.sub());
        float ty = y + 18;
        float tv = anim(id, Math.max(0, Math.min(1, v)), 18);
        int accent = cfg().accentColor();
        R2D.roundRect(x, ty - 2, w, 4, 2, th.control());
        R2D.roundRect(x, ty - 2, Math.max(4, w * tv), 4, 2, accent);
        boolean hov = hovered(x - 4, ty - 7, w + 8, 14, mx, my);
        float hk = anim(id + "_h", hov ? 1 : 0, 18);
        R2D.circle(x + w * tv, ty, 6f + hk * 0.8f, 0x33000000);
        R2D.circle(x + w * tv, ty, 5f + hk * 0.8f, th.knob());
        hot(x - 4, ty - 7, w + 8, 14, null, (px, py) -> setter.set(Math.max(0, Math.min(1, (px - x) / w))));
        return y + 30;
    }

    private float segmented(Theme th, String id, String label, String[] opts, int sel, IntConsumer setter, float x, float y, float w) {
        R2D.textMid(label, Font.M8, x, y + 6, th.text());
        float sy = y + 13;
        float sh = 18;
        R2D.roundRect(x, sy, w, sh, 7, th.control());
        float[] segX = new float[opts.length + 1];
        float textSum = 0;
        for (String o : opts) textSum += R2D.width(o, Font.M7);
        float pad = (w - textSum) / opts.length;
        segX[0] = x;
        for (int i = 0; i < opts.length; i++) segX[i + 1] = segX[i] + R2D.width(opts[i], Font.M7) + pad;
        float pos = anim(id, sel, 16);
        int lo = Math.max(0, Math.min(opts.length - 1, (int) Math.floor(pos)));
        int hi = Math.min(opts.length - 1, lo + 1);
        float f = pos - lo;
        float hx = segX[lo] + (segX[hi] - segX[lo]) * f;
        float hw = (segX[lo + 1] - segX[lo]) + ((segX[hi + 1] - segX[hi]) - (segX[lo + 1] - segX[lo])) * f;
        R2D.roundRect(hx + 2, sy + 2, hw - 4, sh - 4, 5.5f, cfg().accentColor());
        for (int i = 0; i < opts.length; i++) {
            float sw = segX[i + 1] - segX[i];
            float closeness = Math.max(0, 1 - Math.abs(pos - i));
            int col = R2D.lerpColor(th.sub(), Theme.onAccent(), closeness);
            R2D.textMidCentered(opts[i], Font.M7, segX[i] + sw / 2f, sy + sh / 2f, col);
            final int idx = i;
            hot(segX[i], sy, sw, sh, b -> {
                if (b == 0) {
                    setter.accept(idx);
                    ModConfig.save();
                }
            }, null);
        }
        return y + 13 + sh + 9;
    }

    private float toggleRow(Theme th, String id, String label, boolean value, Runnable flip, float x, float y, float w) {
        float cy = y + 9;
        R2D.textMid(label, Font.M8, x, cy, th.text());
        toggle(th, x + w - 28, cy, anim(id, value ? 1 : 0, 16));
        hot(x, y, w, 18, b -> {
            if (b == 0) {
                flip.run();
                ModConfig.save();
            }
        }, null);
        return y + 22;
    }

    private float button(Theme th, String id, String label, float x, float y, float w, int tint, Runnable action, int mx, int my) {
        float h = 18;
        boolean hov = hovered(x, y, w, h, mx, my);
        float hv = anim(id, hov ? 1 : 0, 18);
        int bg = tint != 0 ? R2D.withAlpha(tint, 0.30f + 0.15f * hv) : R2D.lerpColor(th.control(), R2D.withAlpha(th.text(), 0.22f), hv * 0.5f);
        R2D.roundRect(x, y, w, h, 7, bg);
        R2D.textMidCentered(label, Font.M7, x + w / 2f, y + h / 2f, th.text());
        hot(x, y, w, h, b -> {
            if (b == 0) action.run();
        }, null);
        return y + h + 4;
    }

    /** Photoshop-style color picker: saturation/brightness square + hue strip. */
    private float colorPicker(Theme th, float x, float y, float w) {
        ModConfig c = cfg();
        int accent = c.accentColor();
        R2D.textMid("Цвет", Font.M8, x, y + 6, th.text());
        String hex = String.format("#%06X", accent & 0xFFFFFF);
        R2D.textMidRight(hex, Font.M7, x + w - 16, y + 6, th.sub());
        R2D.roundRect(x + w - 11, y + 1, 11, 11, 3.5f, accent);
        R2D.roundOutline(x + w - 11, y + 1, 11, 11, 3.5f, 0.5f, th.border());

        float sy = y + 16, sh = 58;
        final float hue = c.accentHue;
        int radiusPx = Math.round(6 * R2D.unit());
        R2D.image("sv", "h" + Math.round(hue * 1000), x, sy, w, sh, (px, py, W, H) -> {
            float s = px / (float) (W - 1);
            float v = 1f - py / (float) (H - 1);
            int rgb = net.minecraft.util.math.MathHelper.hsvToRgb(Math.min(hue, 0.9999f), s, v);
            int a = Math.round(R2D.roundedCoverage(px, py, W, H, radiusPx) * 255);
            return (a << 24) | (rgb & 0xFFFFFF);
        });
        float kx = x + c.accentSat * w, ky = sy + (1 - c.accentVal) * sh;
        R2D.ring(kx, ky, 5f, 1.6f, 0xFFFFFFFF);
        R2D.ring(kx, ky, 6f, 0.8f, 0x66000000);
        hot(x, sy, w, sh, null, (px, py) -> {
            c.accentSat = (float) Math.max(0, Math.min(1, (px - x) / w));
            c.accentVal = (float) Math.max(0, Math.min(1, 1 - (py - sy) / sh));
        });

        float hy = sy + sh + 8, hh = 8;
        int hr = Math.round(4 * R2D.unit());
        R2D.image("hue", "static", x, hy, w, hh, (px, py, W, H) -> {
            int rgb = net.minecraft.util.math.MathHelper.hsvToRgb(Math.min(px / (float) (W - 1), 0.9999f), 1f, 1f);
            int a = Math.round(R2D.roundedCoverage(px, py, W, H, hr) * 255);
            return (a << 24) | (rgb & 0xFFFFFF);
        });
        float hx = x + hue * w;
        R2D.roundRect(hx - 2.5f, hy - 2, 5, hh + 4, 2.5f, 0xFFFFFFFF);
        R2D.roundOutline(hx - 2.5f, hy - 2, 5, hh + 4, 2.5f, 0.5f, 0x66000000);
        hot(x - 3, hy - 3, w + 6, hh + 6, null, (px, py) -> c.accentHue = (float) Math.max(0, Math.min(1, (px - x) / w)));
        return hy + hh + 10;
    }

    private void toggle(Theme th, float x, float cy, float t) {
        float w = 28, h = 16;
        R2D.roundRect(x, cy - h / 2f, w, h, h / 2f, R2D.lerpColor(th.control(), cfg().accentColor(), t));
        R2D.circle(x + 8 + t * 12, cy, 6.2f, 0x2E000000);
        R2D.circle(x + 8 + t * 12, cy, 5.6f, th.knob());
    }
}
