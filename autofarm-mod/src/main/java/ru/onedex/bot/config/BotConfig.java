package ru.onedex.bot.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import ru.onedex.bot.BotClient;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Settings (config/1dex1-bot.json): server commands and the farm size. */
public final class BotConfig {
    public String stashCommand = "/home d";
    public String farmCommand = "/home g";
    public String rtpCommand = "/rtp";
    public String sellCommand = "/b";
    public List<String> sellMenuKeywords = new ArrayList<>(List.of("табличк", "продаж", "скупщик", "sell"));

    public int farmWidth = 30;
    public int farmLength = 70;
    public int floors = 10;
    public int floorGap = 4;
    public int firstFloorHeight = 3;
    public int farmMinutes = 120;
    public int storagePairs = 10;
    public int keepSeeds = 192;

    public boolean hud = true;

    private static BotConfig INSTANCE;
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("1dex1-bot.json"); }

    public static BotConfig get() {
        if (INSTANCE == null) load();
        return INSTANCE;
    }

    public static void load() {
        try {
            Path f = file();
            if (Files.exists(f)) INSTANCE = GSON.fromJson(Files.readString(f), BotConfig.class);
        } catch (Exception e) {
            BotClient.LOGGER.warn("config: {}", e.toString());
        }
        if (INSTANCE == null) INSTANCE = new BotConfig();
        save();
    }

    public static void save() {
        try { Files.writeString(file(), GSON.toJson(INSTANCE)); } catch (Exception e) { BotClient.LOGGER.warn("config save: {}", e.toString()); }
    }
}
