package ru.onedex.newyear.render;

import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import ru.onedex.newyear.config.NyConfig;

/** Text garland: colored bulbs on a green wire that blink in a running pattern. */
public final class Garland {
    private Garland() {}

    public static final int[] COLORS = {0xFFFF3B30, 0xFFFFCC00, 0xFF34C759, 0xFF0A84FF, 0xFFFF2D92, 0xFFFF9500};
    private static final int BULBS = 6;

    public static Text text(int seed) {
        long ms = System.currentTimeMillis();
        int period = NyConfig.INSTANCE.garlandSpeed == 1 ? 180 : 420;
        long beat = ru.onedex.newyear.music.MusicFx.garlandStep();
        long step = beat >= 0 ? beat : ms / period;
        MutableText t = Text.empty();
        for (int i = 0; i < BULBS; i++) {
            if (i > 0) t.append(Text.literal("~").withColor(0xFF2E7D32));
            int col = COLORS[(i + seed) % COLORS.length];
            boolean on = ((step + i) % 3) != 0;
            t.append(Text.literal("●").withColor(on ? col : dim(col)));
        }
        return t;
    }

    public static int dim(int c) {
        int r = ((c >> 16) & 255) * 35 / 100, g = ((c >> 8) & 255) * 35 / 100, b = (c & 255) * 35 / 100;
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }
}
