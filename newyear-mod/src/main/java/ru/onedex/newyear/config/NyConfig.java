package ru.onedex.newyear.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import ru.onedex.newyear.NewYearClient;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

/** All settings of the New Year mod. Saved to config/1dex1-newyear.json */
public class NyConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("1dex1-newyear.json");

    public static NyConfig INSTANCE = new NyConfig();

    // ---------- Снегопад в мире ----------
    public boolean snowfall = true;
    /** 1 (light) .. 10 (blizzard) */
    public int snowStrength = 5;
    /** 0 = мелкие, 1 = разные, 2 = крупные */
    public int flakeSize = 1;
    public boolean wind = true;

    // ---------- Снег на экране ----------
    public boolean screenSnow = true;
    /** 0.1 .. 1.0 */
    public float screenSnowAmount = 0.5f;
    /** Snow piles up on top of the chat, hotbar, buttons and menus. */
    public boolean snowDrifts = true;
    /** Also show screen snow during gameplay (not only in menus). */
    public boolean screenSnowInGame = true;

    // ---------- Шапки ----------
    public boolean hats = true;
    public boolean hatOnMe = true;
    public boolean hatOnOthers = true;

    // ---------- Гирлянды ----------
    public boolean garlands = true;
    /** 0 = медленно, 1 = быстро */
    public int garlandSpeed = 0;

    // ---------- Зимний фильтр ----------
    public boolean winterFilter = true;
    public boolean snowyGrass = true;
    public boolean frostEdges = true;
    /** 0 .. 1 */
    public float coldTint = 0.35f;

    // ---------- Пар изо рта ----------
    public boolean breath = true;

    // ---------- Звёздное небо ----------
    public boolean starrySky = true;
    /** 0 .. 1 */
    public float starBoost = 0.7f;

    // ---------- Визуал ----------
    /** 0 = белый, 1 = серый, 2 = чёрный */
    public int background = 2;
    public boolean glass = true;
    public boolean menuGarland = true;
    /** Accent color in HSV (festive red by default). */
    public float accentHue = 0.0f;
    public float accentSat = 0.78f;
    public float accentVal = 0.92f;

    public static void load() {
        try {
            if (Files.exists(FILE)) {
                try (Reader r = Files.newBufferedReader(FILE)) {
                    NyConfig c = GSON.fromJson(r, NyConfig.class);
                    if (c != null) INSTANCE = c;
                }
            }
        } catch (Exception e) {
            NewYearClient.LOGGER.warn("Failed to read config, using defaults", e);
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
            NewYearClient.LOGGER.warn("Failed to save config", e);
        }
    }

    private void sanitize() {
        snowStrength = Math.max(1, Math.min(10, snowStrength));
        flakeSize = Math.max(0, Math.min(2, flakeSize));
        screenSnowAmount = clamp(screenSnowAmount, 0.1f, 1f);
        garlandSpeed = Math.max(0, Math.min(1, garlandSpeed));
        coldTint = clamp(coldTint, 0f, 1f);
        starBoost = clamp(starBoost, 0f, 1f);
        background = Math.max(0, Math.min(2, background));
        accentHue = clamp(accentHue, 0f, 1f);
        accentSat = clamp(accentSat, 0f, 1f);
        accentVal = clamp(accentVal, 0f, 1f);
    }

    private static float clamp(float v, float lo, float hi) {
        if (Float.isNaN(v)) return lo;
        return v < lo ? lo : (v > hi ? hi : v);
    }

    public int accentColor() {
        return 0xFF000000 | (net.minecraft.util.math.MathHelper.hsvToRgb(Math.min(accentHue, 0.9999f), accentSat, accentVal) & 0xFFFFFF);
    }

    public boolean accentIsLight() {
        int c = accentColor();
        double l = 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
        return l > 175;
    }
}
