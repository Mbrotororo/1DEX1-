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
import java.util.function.BooleanSupplier;
import java.util.function.IntConsumer;

/**
 * The New Year menu: columns by category with compact rows (no icons).
 * LMB on a row toggles the function, RMB unfolds its settings right under the row.
 */
public class NyMenuScreen extends Screen {
    private static final Identifier AVATAR = Identifier.of("dexnewyear", "textures/gui/avatar.png");
    private static final float COL_W = 132, COL_GAP = 8, HEAD_H = 24, ROW_H = 17, TITLE_H = 26;

    private interface Page {
        float draw(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my);
    }

    private record Module(String id, String name, BooleanSupplier on, Runnable toggle, Page page) {
    }

    private record Column(String name, List<Module> modules) {
    }

    private static final List<Column> COLUMNS = new ArrayList<>();
    /** Which row has its settings unfolded (module id, or null). */
    private static String openId;

    static {
        COLUMNS.add(new Column("Снег", List.of(
                new Module("snowfall", "Снегопад", () -> c().snowfall, () -> c().snowfall = !c().snowfall, NyMenuScreen::pageSnowfall),
                new Module("cover", "Сугробы", () -> c().snowCover, () -> c().snowCover = !c().snowCover, NyMenuScreen::pageCover),
                new Module("prints", "Следы на снегу", () -> c().footprints, () -> c().footprints = !c().footprints, null),
                new Module("psnow", "Снег на игроках", () -> c().playerSnow, () -> c().playerSnow = !c().playerSnow, null),
                new Module("play", "Снежки и снеговик", () -> c().snowPlay, () -> c().snowPlay = !c().snowPlay, null),
                new Module("rudolph", "Рудольф", () -> c().rudolph, () -> c().rudolph = !c().rudolph, null))));
        COLUMNS.add(new Column("Зима", List.of(
                new Module("hats", "Шапки", () -> c().hats, () -> c().hats = !c().hats, NyMenuScreen::pageHats),
                new Module("garlands", "Гирлянды", () -> c().garlands, () -> c().garlands = !c().garlands, NyMenuScreen::pageGarlands),
                new Module("decor", "Украшения на ёлках", () -> c().treeDecor, () -> c().treeDecor = !c().treeDecor, null),
                new Module("icicles", "Сосульки", () -> c().icicles, () -> c().icicles = !c().icicles, null),
                new Module("ice", "Лёд на воде", () -> c().iceOnWater, () -> c().iceOnWater = !c().iceOnWater, null),
                new Module("filter", "Зимний фильтр", () -> c().winterFilter, () -> c().winterFilter = !c().winterFilter, NyMenuScreen::pageFilter),
                new Module("breath", "Пар изо рта", () -> c().breath, () -> c().breath = !c().breath, null),
                new Module("stars", "Звёздное небо", () -> c().starrySky, () -> c().starrySky = !c().starrySky, NyMenuScreen::pageStars))));
        COLUMNS.add(new Column("Музыка", List.of(
                new Module("music", "Музыка", () -> c().music, () -> c().music = !c().music, NyMenuScreen::pageMusic),
                new Module("songs", "Песни", null, null, NyMenuScreen::pageSongs),
                new Module("fx_beat", "Снег под бит", () -> c().fxBeatSnow, () -> c().fxBeatSnow = !c().fxBeatSnow, null),
                new Module("fx_speed", "Ускорение снега", () -> c().fxSpeedSnow, () -> c().fxSpeedSnow = !c().fxSpeedSnow, null),
                new Module("fx_gar", "Гирлянды под бит", () -> c().fxGarlands, () -> c().fxGarlands = !c().fxGarlands, null))));
        COLUMNS.add(new Column("Визуал", List.of(
                new Module("menu", "Меню", null, null, NyMenuScreen::pageVisual),
                new Module("title", "Новогодний фон", () -> c().titleBackground, () -> c().titleBackground = !c().titleBackground, null))));
    }

    private static NyConfig c() {
        return NyConfig.INSTANCE;
    }

    private final long openedAt = System.nanoTime();
    private boolean closing, closedForReal;
    private long closingAt;
    private float openProgress;
    private long lastFrame = System.nanoTime();
    private float dt;
    private final Map<String, Float> anims = new HashMap<>();
    private final List<Hot> hots = new ArrayList<>();
    private Hot dragging;
    private final float[] scroll = new float[8], scrollTarget = new float[8], maxScroll = new float[8];
    private final float[] colX = new float[8], colTop = new float[8], colH = new float[8];
    private final Map<String, Float> pageH = new HashMap<>();

    private float fit = 1;
    private float pivotX, pivotY, curScale = 1, curOffY;
    private float clipTop = -1e9f, clipBottom = 1e9f;
    private boolean resetArmed;

    private interface Drag {
        void at(double x, double y);
    }

    private record Hot(float x, float y, float w, float h, IntConsumer click, Drag drag) {
        boolean contains(double mx, double my) {
            return mx >= x && mx < x + w && my >= y && my < y + h;
        }
    }

    private final Screen parent;

    public NyMenuScreen() {
        this(null);
    }

    public NyMenuScreen(Screen parent) {
        super(Text.literal("1DEX1 New Year"));
        this.parent = parent;
        GlassMask.ensure();
    }

    @Override
    public boolean shouldPause() {
        return false;
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
            if (client.currentScreen == this) client.setScreen(parent);
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
        double mx = ux(mouseX);
        for (int i = 0; i < COLUMNS.size(); i++) {
            if (mx >= colX[i] && mx < colX[i] + COL_W) {
                scrollTarget[i] = Math.max(0, Math.min(maxScroll[i], scrollTarget[i] - (float) verticalAmount * 20));
            }
        }
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

    private float sx(float u) {
        return pivotX + (u * fit - pivotX) * curScale;
    }

    private float sy(float u) {
        return pivotY + (u * fit - pivotY) * curScale + curOffY;
    }

    // ------------------------------------------------------------------ render

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
        openProgress = computeOpen();
        Theme th = Theme.current();
        if (client != null && client.world == null) this.renderPanoramaBackground(context, deltaTicks);
        if (th.blur()) context.applyBlur();
        R2D.begin(context);
        R2D.rect(0, 0, width, height, R2D.withAlpha(th.overlay(), openProgress));
    }

    private double lastMx, lastMy;

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
        lastMx = mouseX;
        lastMy = mouseY;
        long now = System.nanoTime();
        dt = Math.min(0.1f, (now - lastFrame) / 1e9f);
        lastFrame = now;
        R2D.begin(context);
        int n = COLUMNS.size();
        float totalW = n * COL_W + (n - 1) * COL_GAP;
        fit = Math.min(1f, (width - 16f) / totalW);
        R2D.unit(R2D.guiScale() * fit);
        hots.clear();
        Theme th = Theme.current();
        float e = openProgress;
        float Wu = width / fit, Hu = height / fit;
        float left = (Wu - totalW) / 2f;
        float top = Math.max(TITLE_H + 6, Hu * 0.16f);

        pivotX = width / 2f;
        pivotY = (top + 60) * fit;
        curScale = 0.94f + 0.06f * e;
        curOffY = (1f - e) * 10f;
        R2D.alpha = e;

        context.getMatrices().pushMatrix();
        context.getMatrices().translate(pivotX, pivotY + curOffY);
        context.getMatrices().scale(curScale, curScale);
        context.getMatrices().translate(-pivotX, -pivotY);

        // small title above the columns
        float titleW = 14 + 6 + R2D.width("1DEX1", Font.S9) + 5 + R2D.width("New Year", Font.M8);
        float tx = Wu / 2f - titleW / 2f, ty = top - TITLE_H + 6;
        R2D.picture(AVATAR, tx, ty, 14, 4.5f);
        R2D.textMid("1DEX1", Font.S9, tx + 20, ty + 7, 0xFFFFFFFF);
        R2D.textMid("New Year", Font.M8, tx + 20 + R2D.width("1DEX1", Font.S9) + 5, ty + 7.2f, 0xC8FFFFFF);

        for (int i = 0; i < n; i++) {
            colX[i] = left + i * (COL_W + COL_GAP);
            colTop[i] = top;
            float delay = Math.min(1f, Math.max(0f, e * 1.25f - i * 0.12f));
            float a = R2D.alpha;
            R2D.alpha = a * delay;
            drawColumn(th, i, colX[i], top + (1 - delay) * 6, Hu - top - 10, mouseX, mouseY);
            R2D.alpha = a;
        }
        context.getMatrices().popMatrix();
        R2D.alpha = 1f;
        R2D.unit(R2D.guiScale());

        GlassMask.begin();
        for (int i = 0; i < n; i++) {
            if (th.blur()) GlassMask.add(sx(colX[i]), sy(colTop[i]), COL_W * fit * curScale, colH[i] * fit * curScale, 12 * fit * curScale, e);
            if (e > 0.9f) ScreenSnow.surface("ny_col" + i, sx(colX[i] + 5), sy(colTop[i]), COL_W * fit * curScale - 10 * fit);
        }
        GlassMask.commit(width, height);
    }

    private void drawColumn(Theme th, int ci, float x, float y, float maxH, int mx, int my) {
        Column col = COLUMNS.get(ci);
        // content height (rows + unfolded settings)
        float content = 0;
        for (Module m : col.modules) {
            content += ROW_H + 2;
            float open = anim("open_" + m.id, m.id.equals(openId) ? 1 : 0, 14);
            content += pageH.getOrDefault(m.id, 60f) * open;
        }
        float h = Math.min(maxH, HEAD_H + content + 6);
        colH[ci] = h;
        R2D.roundRect(x, y, COL_W, h, 12, th.panel());
        R2D.roundOutline(x, y, COL_W, h, 12, 0.5f, th.border());
        R2D.textMid(col.name, Font.S9, x + 11, y + 12, th.text());
        R2D.rect(x + 9, y + HEAD_H - 2, COL_W - 18, 1f / R2D.unit(), th.border());
        if (c().menuGarland) drawGarland(x, y, COL_W, ci);

        float viewTop = y + HEAD_H, viewH = h - HEAD_H - 4;
        maxScroll[ci] = Math.max(0, content + 2 - viewH);
        scrollTarget[ci] = Math.min(scrollTarget[ci], maxScroll[ci]);
        scroll[ci] = anim("scroll" + ci, scrollTarget[ci], 16);
        R2D.ctx().enableScissor((int) Math.floor(x * fit), (int) Math.floor(viewTop * fit), (int) Math.ceil((x + COL_W) * fit), (int) Math.ceil((viewTop + viewH) * fit));
        float oldTop = clipTop, oldBottom = clipBottom;
        clipTop = viewTop;
        clipBottom = viewTop + viewH;
        float ry = viewTop + 2 - scroll[ci];
        for (Module m : col.modules) {
            ry = drawRow(th, m, x + 5, ry, COL_W - 10, mx, my);
        }
        clipTop = oldTop;
        clipBottom = oldBottom;
        R2D.ctx().disableScissor();
        if (maxScroll[ci] > 0) {
            float trackH = viewH - 8;
            float barH = Math.max(12, trackH * viewH / (content + 2));
            float barY = viewTop + 4 + (trackH - barH) * (scroll[ci] / maxScroll[ci]);
            R2D.roundRect(x + COL_W - 4, barY, 2, barH, 1, R2D.withAlpha(th.sub(), 0.45f));
        }
    }

    private float drawRow(Theme th, Module m, float x, float y, float w, int mx, int my) {
        boolean toggleable = m.on != null;
        boolean on = toggleable && m.on.getAsBoolean();
        float onT = anim("on_" + m.id, on ? 1 : 0, 16);
        float hv = anim("hv_" + m.id, hovered(x, y, w, ROW_H, mx, my) ? 1 : 0, 18);
        float open = anim("open_" + m.id, m.id.equals(openId) ? 1 : 0, 14);
        int accent = c().accentColor();
        if (onT > 0.01f) R2D.roundRect(x, y, w, ROW_H, 7, R2D.withAlpha(th.hover(), onT * 1.6f));
        if (hv > 0.01f) R2D.roundRect(x, y, w, ROW_H, 7, R2D.withAlpha(th.hover(), hv));
        int textCol = toggleable ? R2D.lerpColor(th.sub(), th.text(), Math.max(onT, hv * 0.6f)) : th.text();
        R2D.textMid(R2D.fit(m.name, Font.M8, w - 34), Font.M8, x + 6, y + ROW_H / 2f, textCol);
        if (toggleable) {
            // always visible: grey with a shadow when off, accent color when on
            float tw = 20, tht = 11;
            float tx = x + w - tw - 5, tcy = y + ROW_H / 2f;
            R2D.roundRect(tx, tcy - tht / 2f + 0.8f, tw, tht, tht / 2f, R2D.withAlpha(0xFF000000, 0.28f * (1 - onT)));
            R2D.roundRect(tx, tcy - tht / 2f, tw, tht, tht / 2f, R2D.lerpColor(th.control(), accent, onT));
            float kx = tx + 5.5f + onT * 9;
            R2D.circle(kx, tcy + 0.9f, 4.3f, R2D.withAlpha(0xFF000000, 0.22f + 0.12f * (1 - onT)));
            R2D.circle(kx, tcy, 3.9f, R2D.lerpColor(0xFFB9BEC7, th.knob(), onT));
        } else if (!toggleable) {
            R2D.textMidRight(open > 0.5f ? "–" : "+", Font.M8, x + w - 7, y + ROW_H / 2f, th.sub());
        }
        hot(x, y, w, ROW_H, b -> {
            if (b == 0 && toggleable) {
                m.toggle.run();
                NyConfig.save();
            } else if (m.page != null && (b == 1 || (b == 0 && !toggleable))) {
                openId = m.id.equals(openId) ? null : m.id;
            }
        }, null);
        y += ROW_H + 2;
        if (open > 0.005f && m.page != null) {
            float ph = pageH.getOrDefault(m.id, 60f);
            float shown = ph * open;
            float a = R2D.alpha;
            R2D.alpha = a * Math.min(1f, open * 1.3f);
            float oldBottom = clipBottom;
            clipBottom = Math.min(clipBottom, y + shown);
            R2D.ctx().enableScissor((int) Math.floor(x * fit), (int) Math.floor(y * fit), (int) Math.ceil((x + w) * fit), (int) Math.ceil(Math.min(y + shown, clipBottom) * fit));
            float used = m.page.draw(this, th, x + 6, y, w - 12, mx, my);
            R2D.ctx().disableScissor();
            clipBottom = oldBottom;
            R2D.alpha = a;
            pageH.put(m.id, used);
            y += shown;
        }
        return y;
    }

    /** Blinking garland hanging along the top edge of a column. */
    private void drawGarland(float x, float y, float w, int seed) {
        int bulbs = 7;
        float left = x + 14, right = x + w - 14;
        float step = (right - left) / (bulbs - 1);
        long beat = ru.onedex.newyear.music.MusicFx.garlandStep();
        long t = beat >= 0 ? beat : System.currentTimeMillis() / (c().garlandSpeed == 1 ? 180 : 420);
        for (int i = 0; i < bulbs - 1; i++) {
            float x0 = left + i * step;
            for (int k = 1; k < 8; k++) {
                float f = k / 8f;
                R2D.circle(x0 + step * f, y + 1 + (float) Math.sin(Math.PI * f) * 2.4f, 0.5f, 0xFF1F5C32);
            }
        }
        for (int i = 0; i < bulbs; i++) {
            float bx = left + i * step, by = y + 4f;
            int col = Garland.COLORS[(i + seed * 2) % Garland.COLORS.length];
            boolean lit = ((t + i + seed) % 3) != 0;
            if (lit) R2D.circle(bx, by, 3.8f, R2D.withAlpha(col, 0.28f));
            R2D.circle(bx, by - 2f, 0.8f, 0xFF3A3F45);
            R2D.circle(bx, by, 1.7f, lit ? col : Garland.dim(col));
        }
    }

    // ------------------------------------------------------------------ settings pages

    private static float pageSnowfall(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        int s = c.snowStrength;
        String lvl = s <= 3 ? "лёгкий" : s <= 6 ? "средний" : s <= 8 ? "сильный" : "метель";
        y = m.slider(th, "s_str", "Сила", s + " · " + lvl, x, y, w, (s - 1) / 9f, v -> c.snowStrength = (int) Math.round(1 + v * 9), mx, my);
        y = m.segmented(th, "s_size", "Снежинки", new String[]{"Мелкие", "Разные", "Крупные"}, c.flakeSize, i -> c.flakeSize = i, x, y, w);
        y = m.toggleRow(th, "s_wind", "Ветер", c.wind, () -> c.wind = !c.wind, x, y, w);
        return y - y0 + 4;
    }

    private static float pageCover(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        y = m.segmented(th, "c_size", "Размер", new String[]{"Малые", "Средние", "Огромные"}, c.driftSize, i -> c.driftSize = i, x, y, w);
        y = m.toggleRow(th, "c_roof", "Крыши и деревья", c.snowOnRoofs, () -> c.snowOnRoofs = !c.snowOnRoofs, x, y, w);
        y = m.toggleRow(th, "c_step", "Звук шагов", c.snowSteps, () -> c.snowSteps = !c.snowSteps, x, y, w);
        y = m.slider(th, "c_vol", "Громкость", Math.round(c.stepVolume * 100) + "%", x, y, w, c.stepVolume, v -> c.stepVolume = (float) v, mx, my);
        return y - y0 + 4;
    }

    private static float pageHats(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        y = m.toggleRow(th, "h_me", "На мне", c.hatOnMe, () -> c.hatOnMe = !c.hatOnMe, x, y, w);
        y = m.toggleRow(th, "h_oth", "На других", c.hatOnOthers, () -> c.hatOnOthers = !c.hatOnOthers, x, y, w);
        return y - y0 + 4;
    }

    private static float pageGarlands(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        y = m.segmented(th, "g_spd", "Мигание", new String[]{"Медленно", "Быстро"}, c.garlandSpeed, i -> c.garlandSpeed = i, x, y, w);
        return y - y0 + 4;
    }

    private static float pageFilter(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        y = m.toggleRow(th, "w_grass", "Снежная трава", c.snowyGrass, () -> c.snowyGrass = !c.snowyGrass, x, y, w);
        y = m.toggleRow(th, "w_frost", "Иней по краям", c.frostEdges, () -> c.frostEdges = !c.frostEdges, x, y, w);
        y = m.slider(th, "w_tint", "Холод", Math.round(c.coldTint * 100) + "%", x, y, w, c.coldTint, v -> c.coldTint = (float) v, mx, my);
        return y - y0 + 4;
    }

    private static float pageStars(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        y = m.slider(th, "st_b", "Яркость", Math.round(c.starBoost * 100) + "%", x, y, w, c.starBoost, v -> c.starBoost = (float) v, mx, my);
        return y - y0 + 4;
    }

    private static float pageVisual(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        y = m.segmented(th, "v_bg", "Фон", Theme.BACKGROUNDS, c.background, i -> c.background = i, x, y, w);
        y = m.segmented(th, "v_type", "Тип", Theme.TYPES, c.glass ? 1 : 0, i -> c.glass = i == 1, x, y, w);
        y = m.toggleRow(th, "v_gar", "Гирлянда", c.menuGarland, () -> c.menuGarland = !c.menuGarland, x, y, w);
        y = m.colorPicker(th, x, y, w);
        return y - y0 + 4;
    }

    private float notes(Theme th, float x, float y, String... lines) {
        float y0 = y;
        for (String l : lines) y = note(th, l, x, y);
        return y - y0 + 4;
    }

    private static float pageMusic(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        NyConfig c = c();
        float y0 = y;
        ru.onedex.newyear.music.MusicPlayer.Track t = ru.onedex.newyear.music.MusicPlayer.currentTrack();
        if (t == null && !ru.onedex.newyear.music.MusicPlayer.tracks().isEmpty()) t = ru.onedex.newyear.music.MusicPlayer.tracks().get(Math.min(c.lastSong, ru.onedex.newyear.music.MusicPlayer.tracks().size() - 1));
        if (t == null) {
            return 4;
        }
        R2D.textMid(R2D.fit(t.title(), Font.S8, w), Font.S8, x, y + 6, th.text());
        R2D.textMid(R2D.fit(t.artist(), Font.M6, w), Font.M6, x, y + 15, th.sub());
        // progress
        float py = y + 24;
        float prog = ru.onedex.newyear.music.MusicPlayer.progress();
        R2D.roundRect(x, py, w, 3, 1.5f, th.control());
        R2D.roundRect(x, py, Math.max(3, w * prog), 3, 1.5f, c.accentColor());
        int pos = ru.onedex.newyear.music.MusicPlayer.positionSeconds(), len = ru.onedex.newyear.music.MusicPlayer.lengthSeconds();
        R2D.textMid(ru.onedex.newyear.music.MusicPlayer.isPlaying() || ru.onedex.newyear.music.MusicPlayer.isPaused() ? time(pos) : "0:00", Font.M6, x, py + 9, th.sub());
        if (len > 0) R2D.textMidRight(time(len), Font.M6, x + w, py + 9, th.sub());
        // live equalizer bars
        float e = ru.onedex.newyear.music.MusicPlayer.energy(), pl = ru.onedex.newyear.music.MusicPlayer.pulse();
        for (int i = 0; i < 5; i++) {
            float bh = 1.5f + (e * (0.6f + 0.4f * (float) Math.sin(i * 1.7 + System.nanoTime() / 1.6e8)) + pl * 0.3f) * 7f;
            R2D.roundRect(x + w / 2f - 9 + i * 4, py + 12 - bh, 2.5f, bh, 1f, R2D.withAlpha(c.accentColor(), 0.85f));
        }
        y = py + 17;
        // controls
        float bw = (w - 6) / 3f;
        boolean playing = ru.onedex.newyear.music.MusicPlayer.isPlaying();
        m.button(th, "mu_prev", "Назад", x, y, bw, () -> {
            c.music = true;
            ru.onedex.newyear.music.MusicPlayer.previous();
        });
        m.button(th, "mu_play", playing ? "Пауза" : "Играть", x + bw + 3, y, bw, () -> {
            c.music = true;
            ru.onedex.newyear.music.MusicPlayer.togglePause();
            NyConfig.save();
        });
        m.button(th, "mu_next", "Далее", x + (bw + 3) * 2, y, bw, () -> {
            c.music = true;
            ru.onedex.newyear.music.MusicPlayer.next();
        });
        y += 20;
        y = m.slider(th, "mu_vol", "Громкость", Math.round(c.musicVolume * 100) + "%", x, y, w, c.musicVolume, v -> c.musicVolume = (float) v, mx, my);
        y = m.segmented(th, "mu_order", "Порядок", new String[]{"Подряд", "Повтор", "Случайно"}, c.musicOrder, i -> c.musicOrder = i, x, y, w);
        return y - y0 + 4;
    }

    private static float pageSongs(NyMenuScreen m, Theme th, float x, float y, float w, int mx, int my) {
        float y0 = y;
        List<ru.onedex.newyear.music.MusicPlayer.Track> list = ru.onedex.newyear.music.MusicPlayer.tracks();
        int cur = ru.onedex.newyear.music.MusicPlayer.currentIndex();
        boolean playing = ru.onedex.newyear.music.MusicPlayer.isPlaying();
        int accent = c().accentColor();
        for (int i = 0; i < list.size(); i++) {
            ru.onedex.newyear.music.MusicPlayer.Track t = list.get(i);
            boolean now = i == cur && (playing || ru.onedex.newyear.music.MusicPlayer.isPaused());
            float rh = 19;
            boolean hov = m.hovered(x - 3, y, w + 6, rh, mx, my);
            float hv = m.anim("song_hv" + i, hov ? 1 : 0, 18);
            if (now) R2D.roundRect(x - 3, y, w + 6, rh, 5, R2D.withAlpha(accent, 0.22f));
            if (hv > 0.01f) R2D.roundRect(x - 3, y, w + 6, rh, 5, R2D.withAlpha(th.hover(), hv));
            float tx = x + 2;
            if (now) {
                float e = playing ? ru.onedex.newyear.music.MusicPlayer.energy() : 0;
                for (int b = 0; b < 3; b++) {
                    float bh = 2 + e * 6 * (0.5f + 0.5f * (float) Math.abs(Math.sin(b * 2.1 + System.nanoTime() / 1.4e8)));
                    R2D.rect(tx + b * 2.2f, y + 13 - bh, 1.5f, bh, accent);
                }
                tx += 9;
            }
            R2D.textMid(R2D.fit(t.title(), Font.M7, w - (tx - x) - 2), Font.M7, tx, y + 6, now ? th.text() : R2D.lerpColor(th.sub(), th.text(), 0.6f));
            R2D.textMid(R2D.fit(t.artist().isEmpty() ? "свой трек" : t.artist(), Font.M6, w - (tx - x) - 2), Font.M6, tx, y + 14, th.sub());
            final int idx = i;
            m.hot(x - 3, y, w + 6, rh, b -> {
                if (b == 0) {
                    c().music = true;
                    ru.onedex.newyear.music.MusicPlayer.play(idx);
                    NyConfig.save();
                }
            }, null);
            y += rh + 1;
        }
        y += 3;
        float bw = (w - 3) / 2f;
        m.button(th, "mu_open", "Папка", x, y + 2, bw, () -> {
            try {
                java.nio.file.Files.createDirectories(ru.onedex.newyear.music.MusicPlayer.folder());
                net.minecraft.util.Util.getOperatingSystem().open(ru.onedex.newyear.music.MusicPlayer.folder());
            } catch (Exception ignored) {
            }
        });
        m.button(th, "mu_reload", "Обновить", x + bw + 3, y + 2, bw, ru.onedex.newyear.music.MusicPlayer::reload);
        y += 22;
        return y - y0 + 2;
    }

    private static String time(int s) {
        return (s / 60) + ":" + String.format("%02d", s % 60);
    }

    private void button(Theme th, String id, String label, float x, float y, float w, Runnable action) {
        float h = 15;
        boolean hov = hovered(x, y, w, h, (int) lastMx, (int) lastMy);
        float hv = anim(id, hov ? 1 : 0, 18);
        R2D.roundRect(x, y, w, h, 5, R2D.lerpColor(th.control(), R2D.withAlpha(th.text(), 0.25f), hv * 0.6f));
        R2D.textMidCentered(R2D.fit(label, Font.M6, w - 4), Font.M6, x + w / 2f, y + h / 2f, th.text());
        hot(x, y, w, h, b -> {
            if (b == 0) action.run();
        }, null);
    }

    // ------------------------------------------------------------------ widgets

    private interface Setter {
        void set(double v);
    }

    private float note(Theme th, String text, float x, float y) {
        R2D.textMid(text, Font.M6, x, y + 5, R2D.withAlpha(th.sub(), 0.9f));
        return y + 10;
    }

    private float slider(Theme th, String id, String label, String value, float x, float y, float w, float v, Setter setter, int mx, int my) {
        R2D.textMid(label, Font.M7, x, y + 5, th.text());
        R2D.textMidRight(value, Font.M6, x + w, y + 5, th.sub());
        float ty = y + 15;
        float tv = anim(id, Math.max(0, Math.min(1, v)), 18);
        R2D.roundRect(x, ty - 1.5f, w, 3, 1.5f, th.control());
        R2D.roundRect(x, ty - 1.5f, Math.max(3, w * tv), 3, 1.5f, c().accentColor());
        boolean hov = hovered(x - 4, ty - 6, w + 8, 12, mx, my);
        float hk = anim(id + "_h", hov ? 1 : 0, 18);
        R2D.circle(x + w * tv, ty, 4.6f + hk * 0.6f, 0x33000000);
        R2D.circle(x + w * tv, ty, 4f + hk * 0.6f, th.knob());
        hot(x - 4, ty - 6, w + 8, 12, null, (px, py) -> setter.set(Math.max(0, Math.min(1, (px - x) / w))));
        return y + 24;
    }

    private float segmented(Theme th, String id, String label, String[] opts, int sel, IntConsumer setter, float x, float y, float w) {
        R2D.textMid(label, Font.M7, x, y + 5, th.text());
        float sy = y + 11, sh = 15;
        R2D.roundRect(x, sy, w, sh, 6, th.control());
        float[] segX = new float[opts.length + 1];
        float textSum = 0;
        for (String o : opts) textSum += R2D.width(o, Font.M6);
        float pad = (w - textSum) / opts.length;
        segX[0] = x;
        for (int i = 0; i < opts.length; i++) segX[i + 1] = segX[i] + R2D.width(opts[i], Font.M6) + pad;
        float pos = anim(id, sel, 16);
        int lo = Math.max(0, Math.min(opts.length - 1, (int) Math.floor(pos)));
        int hi = Math.min(opts.length - 1, lo + 1);
        float f = pos - lo;
        float hx = segX[lo] + (segX[hi] - segX[lo]) * f;
        float hw = (segX[lo + 1] - segX[lo]) + ((segX[hi + 1] - segX[hi]) - (segX[lo + 1] - segX[lo])) * f;
        R2D.roundRect(hx + 1.5f, sy + 1.5f, hw - 3, sh - 3, 4.5f, c().accentColor());
        for (int i = 0; i < opts.length; i++) {
            float sw = segX[i + 1] - segX[i];
            float closeness = Math.max(0, 1 - Math.abs(pos - i));
            R2D.textMidCentered(opts[i], Font.M6, segX[i] + sw / 2f, sy + sh / 2f, R2D.lerpColor(th.sub(), Theme.onAccent(), closeness));
            final int idx = i;
            hot(segX[i], sy, sw, sh, b -> {
                if (b == 0) {
                    setter.accept(idx);
                    NyConfig.save();
                }
            }, null);
        }
        return y + 11 + sh + 6;
    }

    private float toggleRow(Theme th, String id, String label, boolean value, Runnable flip, float x, float y, float w) {
        float cy = y + 8;
        R2D.textMid(label, Font.M7, x, cy, th.text());
        float t = anim(id, value ? 1 : 0, 16);
        float tw = 20, tht = 11, tx = x + w - tw;
        R2D.roundRect(tx, cy - tht / 2f, tw, tht, tht / 2f, R2D.lerpColor(th.control(), c().accentColor(), t));
        R2D.circle(tx + 5.5f + t * 9, cy, 3.9f, th.knob());
        hot(x, y, w, 16, b -> {
            if (b == 0) {
                flip.run();
                NyConfig.save();
            }
        }, null);
        return y + 18;
    }

    /** Photoshop-style color picker: saturation/brightness square + hue strip. */
    private float colorPicker(Theme th, float x, float y, float w) {
        NyConfig c = c();
        int accent = c.accentColor();
        R2D.textMid("Цвет", Font.M7, x, y + 5, th.text());
        R2D.textMidRight(String.format("#%06X", accent & 0xFFFFFF), Font.M6, x + w - 13, y + 5, th.sub());
        R2D.roundRect(x + w - 9, y + 1, 9, 9, 3, accent);
        float sy = y + 13, sh = 46;
        final float hue = c.accentHue;
        int radiusPx = Math.round(5 * R2D.unit());
        R2D.image("sv", "h" + Math.round(hue * 1000), x, sy, w, sh, (px, py, W, H) -> {
            float s = px / (float) (W - 1);
            float v = 1f - py / (float) (H - 1);
            int rgb = net.minecraft.util.math.MathHelper.hsvToRgb(Math.min(hue, 0.9999f), s, v);
            int a = Math.round(R2D.roundedCoverage(px, py, W, H, radiusPx) * 255);
            return (a << 24) | (rgb & 0xFFFFFF);
        });
        float kx = x + c.accentSat * w, ky = sy + (1 - c.accentVal) * sh;
        R2D.ring(kx, ky, 4f, 1.4f, 0xFFFFFFFF);
        R2D.ring(kx, ky, 5f, 0.7f, 0x66000000);
        hot(x, sy, w, sh, null, (px, py) -> {
            c.accentSat = (float) Math.max(0, Math.min(1, (px - x) / w));
            c.accentVal = (float) Math.max(0, Math.min(1, 1 - (py - sy) / sh));
        });
        float hy = sy + sh + 6, hh = 7;
        int hr = Math.round(3.5f * R2D.unit());
        R2D.image("hue", "static", x, hy, w, hh, (px, py, W, H) -> {
            int rgb = net.minecraft.util.math.MathHelper.hsvToRgb(Math.min(px / (float) (W - 1), 0.9999f), 1f, 1f);
            int a = Math.round(R2D.roundedCoverage(px, py, W, H, hr) * 255);
            return (a << 24) | (rgb & 0xFFFFFF);
        });
        float hx = x + hue * w;
        R2D.roundRect(hx - 2, hy - 1.5f, 4, hh + 3, 2, 0xFFFFFFFF);
        hot(x - 3, hy - 3, w + 6, hh + 6, null, (px, py) -> c.accentHue = (float) Math.max(0, Math.min(1, (px - x) / w)));
        return hy + hh + 8;
    }
}
