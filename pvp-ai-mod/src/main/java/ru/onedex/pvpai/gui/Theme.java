package ru.onedex.pvpai.gui;

import ru.onedex.pvpai.config.ModConfig;

/** Colors of the menu/HUD: background white / gray / black, normal or glass. */
public record Theme(int overlay, int panel, int highlight, int border, int text, int sub, int hover, int control,
                    int knob, boolean blur, boolean light) {

    public static final String[] BACKGROUNDS = {"Белый", "Серый", "Чёрный"};
    public static final String[] TYPES = {"Обычный", "Стекло"};

    public static Theme current() {
        ModConfig c = ModConfig.INSTANCE;
        return of(c.background, c.glass);
    }

    public static Theme of(int bg, boolean glass) {
        return switch (bg) {
            case 0 -> glass
                    ? new Theme(0x33000000, 0xA6F7F8FB, 0x00FFFFFF, 0xB3FFFFFF, 0xFF14161B, 0xB3363A44, 0x0F000000, 0x1F000000, 0xFFFFFFFF, true, true)
                    : new Theme(0x33000000, 0xFAF4F5F8, 0x00FFFFFF, 0x1F000000, 0xFF14161B, 0xA6363A44, 0x0D000000, 0x1A000000, 0xFFFFFFFF, false, true);
            case 1 -> glass
                    ? new Theme(0x4D000000, 0x803A3D45, 0x00FFFFFF, 0x4DFFFFFF, 0xFFFFFFFF, 0xB8E4E7EE, 0x14FFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, true, false)
                    : new Theme(0x4D000000, 0xF72C2F36, 0x08FFFFFF, 0x1AFFFFFF, 0xFFF4F5F7, 0xA6D0D4DC, 0x12FFFFFF, 0x26FFFFFF, 0xFFFFFFFF, false, false);
            default -> glass
                    ? new Theme(0x59000000, 0x8010131A, 0x00FFFFFF, 0x40FFFFFF, 0xFFFFFFFF, 0xB8E4E7EE, 0x14FFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, true, false)
                    : new Theme(0x59000000, 0xF70D0F14, 0x06FFFFFF, 0x14FFFFFF, 0xFFF4F5F7, 0x9AC4C8D0, 0x0FFFFFFF, 0x1FFFFFFF, 0xFFFFFFFF, false, false);
        };
    }

    /** Text color to use on top of the accent color. */
    public static int onAccent() {
        return ModConfig.INSTANCE.accentIsLight() ? 0xFF14161B : 0xFFFFFFFF;
    }
}
