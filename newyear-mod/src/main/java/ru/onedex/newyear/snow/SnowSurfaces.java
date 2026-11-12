package ru.onedex.newyear.snow;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.Element;
import net.minecraft.client.gui.hud.ChatHud;
import net.minecraft.client.gui.screen.ChatScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.client.gui.widget.ClickableWidget;
import ru.onedex.newyear.gui.NyMenuScreen;
import ru.onedex.newyear.mixin.ChatHudAccessor;
import ru.onedex.newyear.mixin.HandledScreenAccessor;

/** Finds interface elements whose top edges collect snow. */
public final class SnowSurfaces {
    private SnowSurfaces() {}

    /** In-game HUD (no menu open): the hotbar. */
    public static void hud(MinecraftClient mc, int w, int h) {
        if (mc.player != null && !mc.player.isSpectator()) ScreenSnow.surface("hotbar", w / 2f - 91, h - 22, 182);
    }

    public static void screen(MinecraftClient mc, Screen s) {
        int w = s.width, h = s.height;
        if (s instanceof ChatScreen) {
            if (mc.player != null && !mc.options.hudHidden && !mc.player.isSpectator()) ScreenSnow.surface("hotbar", w / 2f - 91, h - 22, 182);
            ScreenSnow.surface("chat_input", 2, h - 14, w - 4);
            chatBox(mc, h);
        }
        if (s instanceof HandledScreen<?> hs) {
            HandledScreenAccessor acc = (HandledScreenAccessor) hs;
            ScreenSnow.surface("inv_" + s.getClass().getSimpleName(), acc.dexnewyear$x() + 2, acc.dexnewyear$y(), acc.dexnewyear$backgroundWidth() - 4);
        }
        if (s instanceof NyMenuScreen) return;
        int n = 0;
        for (Element e : s.children()) {
            if (!(e instanceof ClickableWidget cw) || !cw.visible) continue;
            if (cw.getHeight() > 30 || cw.getWidth() < 20) continue;
            ScreenSnow.surface("w" + cw.getX() + "," + cw.getY() + "," + cw.getWidth(), cw.getX() + 1, cw.getY(), cw.getWidth() - 2);
            if (++n >= 40) break;
        }
    }

    private static void chatBox(MinecraftClient mc, int h) {
        ChatHud hud = mc.inGameHud.getChatHud();
        ChatHudAccessor acc = (ChatHudAccessor) hud;
        int lines = Math.min(acc.dexnewyear$visibleMessages().size() - acc.dexnewyear$scrolledLines(), hud.getVisibleLineCount());
        if (lines <= 0) return;
        double scale = mc.options.getChatScale().getValue();
        double spacing = mc.options.getChatLineSpacing().getValue();
        int lineH = (int) (9 * (spacing + 1));
        float top = (float) Math.floor((h - 40) - lines * lineH * scale);
        float width = (float) ((ChatHud.getWidth(mc.options.getChatWidth().getValue()) / scale + 12) * scale);
        ScreenSnow.surface("chat_box", 1, top, width);
    }
}
