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
    /** 0 = над ником, 1 = HUD, 2 = чат */
    public int displayMode = 0;
    /** Show "~%" forecast for players you are not fighting yet. */
    public boolean forecastAll = false;
    /** Remember players between sessions. */
    public boolean saveProfiles = true;

    // ---------- Визуал ----------
    /** 0 = стекло, 1 = прозрачный, 2 = тёмный, 3 = серый */
    public int menuStyle = 0;
    /** true = плавная анимация, false = резкая */
    public boolean smoothAnimation = true;
    /** 0 синий, 1 фиолетовый, 2 мятный, 3 розовый, 4 белый */
    public int accent = 0;
    /** Blur strength for glass style 1..10 */
    public int blurStrength = 6;

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
        displayMode = Math.max(0, Math.min(2, displayMode));
        menuStyle = Math.max(0, Math.min(3, menuStyle));
        accent = Math.max(0, Math.min(4, accent));
        blurStrength = Math.max(1, Math.min(10, blurStrength));
    }

    public int accentColor() {
        return switch (accent) {
            case 1 -> 0xFF8B5CF6;
            case 2 -> 0xFF34D399;
            case 3 -> 0xFFF472B6;
            case 4 -> 0xFFE8EAF0;
            default -> 0xFF4C8DFF;
        };
    }
}
