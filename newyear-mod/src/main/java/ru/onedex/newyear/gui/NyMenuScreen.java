package ru.onedex.newyear.gui;

import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.input.KeyInput;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import ru.onedex.newyear.NewYearClient;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.R2D.Font;
import ru.onedex.newyear.render.Garland;
import ru.onedex.newyear.snow.ScreenSnow;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntConsumer;

/** The 1DEX1 New Year menu: 8 functions as tiles, settings slide in on the right. */
public class NyMenuScreen extends Screen {
    private static final Identifier AVATAR = Identifier.of("dexnewyear", "textures/gui/avatar.png");
    private static final String[] TITLES = {"Снегопад", "Снег на экране", "Шапки", "Гирлянды", "Зимний фильтр", "Пар изо рта", "Звёздное небо", "Визуал"};
    private static final String[] SIZES = {"Мелкие", "Разные", "Крупные"};
    private static final String[] SPEEDS = {"Медленно", "Быстро"};

    private static final float MAIN_W = 210, SET_W = 220, GAP = 8;
    private static final float TILE_W = 94, TILE_H = 40, TILE_GAP = 6;
    private static final float HEADER = 40, MAIN_H = 240;

    private static int openIdx = -1, shownIdx = -1;
    private static final float[] MEASURED = new float[8];

    private final long openedAt = System.nanoTime();
    private boolean closing, closedForReal;
    private long closingAt;
    private float openProgress;
    private long lastFrame = System.nanoTime();
    private float dt;
    private final Map<String, Float> anims = new HashMap<>();
    private final List<Hot> hots = new ArrayList<>();
    private Hot dragging;
    private float scroll, scrollTarget, maxScroll;

    /** GUI units per layout unit (menu shrinks a little on small screens). */
    private float fit = 1;
    private float pivotX, pivotY, curScale = 1, curOffY;
    private float clipTop = -1e9f, clipBottom = 1e9f;
    private float lastSetH;
    private boolean resetArmed;

    private interface Drag {
        void at(double x, double y);
    }

    private record Hot(float x, float y, float w, float h, IntConsumer click, Drag drag) {
        boolean contains(double mx, double my) {
            return mx >= x && mx < x + w && my >= y && my < y + h;
        }
    }

    public NyMenuScreen() {
        super(Text.literal("1DEX1 New Year"));
        GlassMask.ensure();
        if (MEASURED[0] == 0) for (int i = 0; i < 8; i++) MEASURED[i] = 120;
    }

    private static NyConfig cfg() {
        return NyConfig.INSTANCE;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    // ------------------------------------------------------------------ module state

    private static boolean isOn(int i) {
        NyConfig c = cfg();
        return switch (i) {
            case 0 -> c.snowfall;
            case 1 -> c.screenSnow;
            case 2 -> c.hats;
            case 3 -> c.garlands;
            case 4 -> c.winterFilter;
            case 5 -> c.breath;
            case 6 -> c.starrySky;
            default -> true;
        };
    }

    private static void toggleModule(int i) {
        NyConfig c = cfg();
        switch (i) {
            case 0 -> c.snowfall = !c.snowfall;
            case 1 -> c.screenSnow = !c.screenSnow;
            case 2 -> c.hats = !c.hats;
            case 3 -> c.garlands = !c.garlands;
            case 4 -> c.winterFilter = !c.winterFilter;
            case 5 -> c.breath = !c.breath;
            case 6 -> c.starrySky = !c.starrySky;
            default -> {
            }
        }
        NyConfig.save();
    }

    // ------------------------------------------------------------------ open / close

    @Override
    public void close() {
        NyConfig.save();
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

    // ------------------------------------------------------------------ input (GUI -> layout units)

    @Override
    public boolean keyPressed(KeyInput input) {
        if (input.isEscape() || NewYearClient.MENU_KEY.matchesKey(input)) {
            close();
            return true;
        }
        return super.keyPressed(input);
    }

    private double ux(double mx) {
        return (pivotX + (mx - pivotX) / curScale) / fit;
    }

    private double uy(double my) {
        return (pivotY + (my - pivotY) / curScale - curOffY) / fit;
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubled) {
        if (closing) return true;
        if (NewYearClient.MENU_KEY.matchesMouse(click)) {
            close();
            return true;
        }
        double mx = ux(click.x()), my = uy(click.y());
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
            dragging.drag.at(ux(click.x()), uy(click.y()));
            return true;
        }
        return super.mouseDragged(click, offsetX, offsetY);
    }

    @Override
    public boolean mouseReleased(Click click) {
        if (dragging != null) {
            dragging = null;
            NyConfig.save();
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
        double lx = ux(mx), ly = uy(my);
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

    /** Layout units -> on-screen GUI coordinates (with the open animation). */
    private float sx(float u) {
        return pivotX + (u * fit - pivotX) * curScale;
    }

    private float sy(float u) {
        return pivotY + (u * fit - pivotY) * curScale + curOffY;
    }

    private void scissor(float x, float y, float w, float h) {
        R2D.ctx().enableScissor((int) Math.floor(x * fit), (int) Math.floor(y * fit), (int) Math.ceil((x + w) * fit), (int) Math.ceil((y + h) * fit));
    }

    // ------------------------------------------------------------------ render

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
        openProgress = computeOpen();
        Theme th = Theme.current();
        if (th.blur()) context.applyBlur();
        R2D.begin(context);
        R2D.rect(0, 0, width, height, R2D.withAlpha(th.overlay(), openProgress));
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
        long now = System.nanoTime();
        dt = Math.min(0.1f, (now - lastFrame) / 1e9f);
        lastFrame = now;
        R2D.begin(context);
        fit = Math.min(1f, Math.min((height - 20f) / MAIN_H, (width - 16f) / (MAIN_W + GAP + SET_W)));
        R2D.unit(R2D.guiScale() * fit);
        hots.clear();
        Theme th = Theme.current();
        float e = openProgress;
        float Wu = width / fit, Hu = height / fit;

        float sa = anim("settings", openIdx >= 0 ? 1 : 0, 14);
        float rightW = Math.min(SET_W, Wu - 20 - MAIN_W - GAP);
        float mainClosedX = (Wu - MAIN_W) / 2f;
        float mainOpenX = (Wu - (MAIN_W + GAP + rightW)) / 2f;
        float mainX = mainClosedX + (mainOpenX - mainClosedX) * sa;
        float top = Math.max(10, (Hu - MAIN_H) / 2f);
        float maxH = Hu - top - 10;

        pivotX = width / 2f;
        pivotY = (top + 60) * fit;
        curScale = 0.94f + 0.06f * e;
        curOffY = (1f - e) * 10f;
        R2D.alpha = e;

        context.getMatrices().pushMatrix();
        context.getMatrices().translate(pivotX, pivotY + curOffY);
        context.getMatrices().scale(curScale, curScale);
        context.getMatrices().translate(-pivotX, -pivotY);

        drawMain(th, mainX, top, mouseX, mouseY);
        float setX = mainX + MAIN_W + GAP + (1 - sa) * 14;
        if (sa > 0.01f && shownIdx >= 0) {
            float a = R2D.alpha;
            R2D.alpha = a * sa;
            drawSettingsPanel(th, shownIdx, setX, top, rightW, maxH, mouseX, mouseY, sa > 0.6f);
            R2D.alpha = a;
        }
        context.getMatrices().popMatrix();
        R2D.alpha = 1f;
        R2D.unit(R2D.guiScale());

        // glass under the panels + snow drifts on top of them (screen GUI coordinates)
        GlassMask.begin();
        if (th.blur()) {
            glass(mainX, top, MAIN_W, MAIN_H, e);
            if (sa > 0.01f && shownIdx >= 0) glass(setX, top, rightW, lastSetH, e * sa);
        }
        GlassMask.commit(width, height);
        if (e > 0.9f) {
            ScreenSnow.surface("ny_main", sx(mainX + 6), sy(top), MAIN_W * fit * curScale - 12 * fit);
            if (sa > 0.9f && shownIdx >= 0) ScreenSnow.surface("ny_set", sx(setX + 6), sy(top), rightW * fit * curScale - 12 * fit);
        }
    }

    private void glass(float x, float y, float w, float h, float a) {
        GlassMask.add(sx(x), sy(y), w * fit * curScale, h * fit * curScale, 14 * fit * curScale, a);
    }

    private void panelBg(Theme th, float x, float y, float w, float h, float r) {
        R2D.roundRect(x, y, w, h, r, th.panel());
        R2D.roundOutline(x, y, w, h, r, 0.5f, th.border());
    }

    private void drawMain(Theme th, float x, float y, int mouseX, int mouseY) {
        panelBg(th, x, y, MAIN_W, MAIN_H, 14);
        int accent = cfg().accentColor();
        float hx = x + 14, hcy = y + 21;
        R2D.picture(AVATAR, hx, hcy - 11, 22, 7);
        R2D.roundOutline(hx, hcy - 11, 22, 22, 7, 0.5f, R2D.withAlpha(accent, 0.6f));
        R2D.textMid("1DEX1", Font.S11, hx + 31, hcy - 5, th.text());
        R2D.textMid("New Year", Font.M7, hx + 31, hcy + 7, th.sub());
        R2D.textMidRight("v1.0", Font.M7, x + MAIN_W - 14, hcy - 5, R2D.withAlpha(th.sub(), 0.7f));
        R2D.rect(x + 12, y + HEADER, MAIN_W - 24, 1f / R2D.unit(), th.border());

        for (int i = 0; i < 8; i++) {
            float tx = x + 8 + (i % 2) * (TILE_W + TILE_GAP);
            float ty = y + HEADER + 6 + (i / 2) * (TILE_H + TILE_GAP);
            drawTile(th, i, tx, ty, mouseX, mouseY);
        }
        R2D.textMidCentered("ЛКМ — вкл  ·  ПКМ — настройки", Font.M7, x + MAIN_W / 2f, y + MAIN_H - 9, R2D.withAlpha(th.sub(), 0.75f));
        if (cfg().menuGarland) drawGarland(x, y, MAIN_W);
    }

    private void drawTile(Theme th, int i, float x, float y, int mouseX, int mouseY) {
        int accent = cfg().accentColor();
        boolean module = i < 7;
        float on = anim("on" + i, module && isOn(i) ? 1 : 0, 14);
        float hv = anim("hv" + i, hovered(x, y, TILE_W, TILE_H, mouseX, mouseY) ? 1 : 0, 18);
        float sel = anim("sel" + i, openIdx == i ? 1 : 0, 14);
        R2D.roundRect(x, y, TILE_W, TILE_H, 10, R2D.lerpColor(th.control(), R2D.withAlpha(accent, 0.92f), on));
        if (hv > 0.01f) R2D.roundRect(x, y, TILE_W, TILE_H, 10, R2D.withAlpha(th.hover(), hv * 1.5f));
        if (sel > 0.01f) R2D.roundOutline(x, y, TILE_W, TILE_H, 10, 1f, R2D.withAlpha(on > 0.5f ? 0xFFFFFFFF : accent, sel));
        int fg = R2D.lerpColor(th.text(), Theme.onAccent(), on);
        int sub = R2D.lerpColor(th.sub(), R2D.withAlpha(Theme.onAccent(), 0.8f), on);
        R2D.icon("m" + i, x + 15, y + 13, 14, fg, NyIcons.forModule(i));
        R2D.icon("dots", x + TILE_W - 11, y + 11, 10, sub, NyIcons::dots);
        R2D.textMid(TITLES[i], Font.S8, x + 9, y + 29, fg);
        hot(x, y, TILE_W, TILE_H, b -> {
            if (module && b == 0) toggleModule(i);
            else if (b == 0 || b == 1) openSettings(i);
        }, null);
        hot(x + TILE_W - 20, y, 20, 20, b -> openSettings(i), null);
    }

    /** Blinking garland hanging along the top edge of a panel. */
    private void drawGarland(float x, float y, float w) {
        int bulbs = 11;
        float left = x + 16, right = x + w - 16;
        float step = (right - left) / (bulbs - 1);
        long t = System.currentTimeMillis() / (cfg().garlandSpeed == 1 ? 180 : 420);
        for (int i = 0; i < bulbs - 1; i++) {
            float x0 = left + i * step;
            for (int k = 1; k < 8; k++) {
                float f = k / 8f;
                float sag = (float) Math.sin(Math.PI * f) * 2.6f;
                R2D.circle(x0 + step * f, y + 1 + sag, 0.55f, 0xFF1F5C32);
            }
        }
        for (int i = 0; i < bulbs; i++) {
            float bx = left + i * step, by = y + 4.2f;
            int col = Garland.COLORS[i % Garland.COLORS.length];
            boolean lit = ((t + i) % 3) != 0;
            if (lit) R2D.circle(bx, by, 4.2f, R2D.withAlpha(col, 0.28f));
            R2D.circle(bx, by - 2.2f, 0.9f, 0xFF3A3F45);
            R2D.circle(bx, by, 1.9f, lit ? col : Garland.dim(col));
        }
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

    private void drawSettingsPanel(Theme th, int idx, float x, float y, float w, float maxH, int mouseX, int mouseY, boolean interactive) {
        float headerH = 34;
        float contentH = MEASURED[idx];
        float h = Math.min(maxH, headerH + contentH);
        float animH = animFrom("setH", h, h, 16);
        lastSetH = animH;
        panelBg(th, x, y, w, animH, 14);
        R2D.textMid(TITLES[idx], Font.S9, x + 14, y + 13, th.text());
        R2D.textMid("настройки", Font.M7, x + 14 + R2D.width(TITLES[idx], Font.S9) + 6, y + 13.5f, th.sub());
        R2D.rect(x + 12, y + 26, w - 24, 1f / R2D.unit(), th.border());

        float viewTop = y + headerH - 4;
        float viewH = animH - headerH + 4;
        maxScroll = Math.max(0, contentH - viewH + 6);
        if (maxScroll <= 6) maxScroll = 0;
        scrollTarget = Math.min(scrollTarget, maxScroll);
        scroll = anim("scroll", scrollTarget, 18);

        scissor(x, viewTop, w, viewH - 2);
        float oldTop = clipTop, oldBottom = clipBottom;
        clipTop = interactive ? viewTop : 1e9f;
        clipBottom = interactive ? viewTop + viewH - 2 : -1e9f;
        float a = R2D.alpha;
        R2D.alpha = a * anim("content", 1, 12);
        float cy = viewTop - scroll;
        float used = settingsPage(th, idx, x + 14, cy, w - 28, mouseX, mouseY);
        R2D.alpha = a;
        clipTop = oldTop;
        clipBottom = oldBottom;
        R2D.ctx().disableScissor();
        MEASURED[idx] = used;

        if (maxScroll > 0) {
            float trackH = viewH - 12;
            float barH = Math.max(14, trackH * viewH / (contentH + 6));
            float barY = viewTop + 4 + (trackH - barH) * (scroll / maxScroll);
            R2D.roundRect(x + w - 5, barY, 2.5f, barH, 1.25f, R2D.withAlpha(th.sub(), 0.45f));
        }
    }

    // ------------------------------------------------------------------ settings pages

    private float settingsPage(Theme th, int idx, float x, float y, float w, int mx, int my) {
        NyConfig c = cfg();
        float y0 = y;
        y += 4;
        switch (idx) {
            case 0 -> {
                int s = c.snowStrength;
                String lvl = s <= 3 ? "лёгкий" : s <= 6 ? "средний" : s <= 8 ? "сильный" : "метель";
                y = slider(th, "s_str", "Сила снега", s + " · " + lvl, x, y, w, (s - 1) / 9f,
                        v -> c.snowStrength = (int) Math.round(1 + v * 9), mx, my);
                y = segmented(th, "s_size", "Снежинки", SIZES, c.flakeSize, i -> c.flakeSize = i, x, y, w);
                y = toggleRow(th, "s_wind", "Ветер", c.wind, () -> c.wind = !c.wind, x, y, w);
                y = note(th, "Снег идёт только на улице, под крышей его нет.", x, y);
            }
            case 1 -> {
                y = slider(th, "ss_amt", "Количество", Math.round(c.screenSnowAmount * 100) + "%", x, y, w, (c.screenSnowAmount - 0.1f) / 0.9f,
                        v -> c.screenSnowAmount = (float) (0.1 + v * 0.9), mx, my);
                y = toggleRow(th, "ss_drift", "Сугробы на интерфейсе", c.snowDrifts, () -> c.snowDrifts = !c.snowDrifts, x, y, w);
                y = toggleRow(th, "ss_game", "Снег поверх игры", c.screenSnowInGame, () -> c.screenSnowInGame = !c.screenSnowInGame, x, y, w);
                y = note(th, "Снег копится на чате, хотбаре, кнопках и меню.", x, y);
            }
            case 2 -> {
                y = toggleRow(th, "h_me", "На мне", c.hatOnMe, () -> c.hatOnMe = !c.hatOnMe, x, y, w);
                y = toggleRow(th, "h_oth", "На других игроках", c.hatOnOthers, () -> c.hatOnOthers = !c.hatOnOthers, x, y, w);
                y = note(th, "Свою шапку видно от третьего лица (F5).", x, y);
            }
            case 3 -> {
                y = segmented(th, "g_spd", "Мигание", SPEEDS, c.garlandSpeed, i -> c.garlandSpeed = i, x, y, w);
                y = note(th, "Гирлянда мигает под ником каждого игрока.", x, y);
            }
            case 4 -> {
                y = toggleRow(th, "w_grass", "Снежная трава и листва", c.snowyGrass, () -> c.snowyGrass = !c.snowyGrass, x, y, w);
                y = toggleRow(th, "w_frost", "Иней по краям экрана", c.frostEdges, () -> c.frostEdges = !c.frostEdges, x, y, w);
                y = slider(th, "w_tint", "Холодный оттенок", Math.round(c.coldTint * 100) + "%", x, y, w, c.coldTint,
                        v -> c.coldTint = (float) v, mx, my);
            }
            case 5 -> y = note(th, "Облачка пара у всех игроков рядом. Когда бегут — чаще.", x, y);
            case 6 -> y = slider(th, "st_b", "Яркость звёзд", Math.round(c.starBoost * 100) + "%", x, y, w, c.starBoost,
                    v -> c.starBoost = (float) v, mx, my);
            default -> {
                y = segmented(th, "v_bg", "Фон", Theme.BACKGROUNDS, c.background, i -> c.background = i, x, y, w);
                y = segmented(th, "v_type", "Тип", Theme.TYPES, c.glass ? 1 : 0, i -> c.glass = i == 1, x, y, w);
                y = toggleRow(th, "v_gar", "Гирлянда на меню", c.menuGarland, () -> c.menuGarland = !c.menuGarland, x, y, w);
                y = colorPicker(th, x, y, w);
            }
        }
        return y - y0 + 8;
    }

    // ------------------------------------------------------------------ widgets

    private interface Setter {
        void set(double v);
    }

    private float note(Theme th, String text, float x, float y) {
        R2D.textMid(text, Font.M6, x, y + 5, R2D.withAlpha(th.sub(), 0.9f));
        return y + 13;
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
        float sy = y + 13, sh = 18;
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
            R2D.textMidCentered(opts[i], Font.M7, segX[i] + sw / 2f, sy + sh / 2f, R2D.lerpColor(th.sub(), Theme.onAccent(), closeness));
            final int idx = i;
            hot(segX[i], sy, sw, sh, b -> {
                if (b == 0) {
                    setter.accept(idx);
                    NyConfig.save();
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
                NyConfig.save();
            }
        }, null);
        return y + 22;
    }

    private void toggle(Theme th, float x, float cy, float t) {
        float w = 28, h = 16;
        R2D.roundRect(x, cy - h / 2f, w, h, h / 2f, R2D.lerpColor(th.control(), cfg().accentColor(), t));
        R2D.circle(x + 8 + t * 12, cy, 6.2f, 0x2E000000);
        R2D.circle(x + 8 + t * 12, cy, 5.6f, th.knob());
    }

    /** Photoshop-style color picker: saturation/brightness square + hue strip. */
    private float colorPicker(Theme th, float x, float y, float w) {
        NyConfig c = cfg();
        int accent = c.accentColor();
        R2D.textMid("Цвет", Font.M8, x, y + 6, th.text());
        R2D.textMidRight(String.format("#%06X", accent & 0xFFFFFF), Font.M7, x + w - 16, y + 6, th.sub());
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
}
