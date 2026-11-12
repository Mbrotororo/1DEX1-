package ru.onedex.pvpai.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import ru.onedex.pvpai.PvpAiClient;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

/** All user settings. Saved to config/1dex1-pvpai.json */
public class ModConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("1dex1-pvpai.json");

    public static ModConfig INSTANCE = new ModConfig();

    // ---------- PvP AI ----------
    public boolean pvpAiEnabled = false;
    /** Analysis length in seconds: 30 .. 300. */
    public int analysisSeconds = 60;
    /** 0 = над ником, 1 = HUD */
    public int displayMode = 0;
    /** Show "~%" forecast for players you are not fighting yet. */
    public boolean forecastAll = false;

    // ---------- HUD ----------
    /** HUD size multiplier, 0.5 .. 1.5 */
    public float hudScale = 1.0f;
    /** HUD position as a fraction of free screen space (0 = left/top, 1 = right/bottom). */
    public float hudX = 0.97f;
    public float hudY = 0.32f;

    // ---------- Визуал ----------
    /** 0 = белый, 1 = серый, 2 = чёрный */
    public int background = 2;
    /** true = стеклянный (размытие), false = обычный */
    public boolean glass = true;
    /** Accent color in HSV (picked with the color picker). */
    public float accentHue = 0.61f;
    public float accentSat = 0.70f;
    public float accentVal = 1.0f;

    public static void load() {
        try {
            if (Files.exists(FILE)) {
                try (Reader r = Files.newBufferedReader(FILE)) {
                    ModConfig c = GSON.fromJson(r, ModConfig.class);
                    if (c != null) INSTANCE = c;
                }
            }
        } catch (Exception e) {
            PvpAiClient.LOGGER.warn("Failed to read config, using defaults", e);
        }
        INSTANCE.sanitize();
    }

    public static void save() {
        try {
            INSTANCE.sanitize();
            Files.createDirectories(FILE.getParent());
            try (Writer w = Files.newBufferedWriter(FILE)) {
                GSON.toJson(INSTANCE, w);
            }
        } catch (Exception e) {
            PvpAiClient.LOGGER.warn("Failed to save config", e);
        }
    }

    private void sanitize() {
        analysisSeconds = Math.max(30, Math.min(300, analysisSeconds));
        if (displayMode < 0 || displayMode > 1) displayMode = 0;
        background = Math.max(0, Math.min(2, background));
        hudScale = clamp(Float.isNaN(hudScale) ? 1f : hudScale, 0.5f, 1.5f);
        hudX = clamp(Float.isNaN(hudX) ? 0.97f : hudX, 0f, 1f);
        hudY = clamp(Float.isNaN(hudY) ? 0.32f : hudY, 0f, 1f);
        accentHue = clamp(Float.isNaN(accentHue) ? 0.61f : accentHue, 0f, 1f);
        accentSat = clamp(Float.isNaN(accentSat) ? 0.7f : accentSat, 0f, 1f);
        accentVal = clamp(Float.isNaN(accentVal) ? 1f : accentVal, 0f, 1f);
    }

    private static float clamp(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    public int accentColor() {
        return 0xFF000000 | (net.minecraft.util.math.MathHelper.hsvToRgb(Math.min(accentHue, 0.9999f), accentSat, accentVal) & 0xFFFFFF);
    }

    /** True when the accent is so light that white text on it would be unreadable. */
    public boolean accentIsLight() {
        int c = accentColor();
        double l = 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
        return l > 175;
    }
}
