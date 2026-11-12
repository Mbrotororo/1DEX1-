package ru.onedex.pvpai.gui;

import ru.onedex.pvpai.config.ModConfig;

/** Colors of the menu for each visual style. */
public record Theme(int overlay, int panel, int highlight, int border, int text, int sub, int hover, int control,
                    boolean blur, boolean shadow) {

    public static final String[] NAMES = {"Стекло", "Прозрачный", "Тёмный", "Серый"};

    public static Theme current() {
        return of(ModConfig.INSTANCE.menuStyle);
    }

    public static Theme of(int style) {
        return switch (style) {
            // transparent: no blur, light see-through panels
            case 1 -> new Theme(0x14000000, 0x4A0B0D12, 0x0DFFFFFF, 0x24FFFFFF, 0xFFFFFFFF, 0xB3E6E9F0, 0x14FFFFFF, 0x26FFFFFF, false, false);
            // dark: solid, deep black panels
            case 2 -> new Theme(0x66000000, 0xF50D0F14, 0x08FFFFFF, 0x14FFFFFF, 0xFFF4F5F7, 0x9AC4C8D0, 0x0FFFFFFF, 0x1FFFFFFF, false, true);
            // gray
            case 3 -> new Theme(0x4D000000, 0xF52A2D34, 0x0AFFFFFF, 0x1AFFFFFF, 0xFFF4F5F7, 0xA6D0D4DC, 0x12FFFFFF, 0x24FFFFFF, false, true);
            // glass (iOS-like): blurred background, tinted frosted panels, bright hairline border
            default -> new Theme(0x1F05070C, 0x66161A22, 0x12FFFFFF, 0x38FFFFFF, 0xFFFFFFFF, 0xB8E8ECF4, 0x14FFFFFF, 0x2EFFFFFF, true, false);
        };
    }
}
