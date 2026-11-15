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
    /** From one floor to the next: 3 = two blocks of air between them. */
    public int floorGap = 3;
    /** 0 = the first floor is the ground itself (dug level). */
    public int firstFloorHeight = 0;
    /** Free blocks between the berries farm and the bamboo farm. */
    public int farmSpacing = 30;
    public int farmMinutes = 120;
    public int storagePairs = 10;
    public int keepSeeds = 192;

    public boolean hud = true;

    /** Settings written by an older version get the new farm layout (the commands stay as they were). */
    public int configVersion = 0;
    static final int VERSION = 2;

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
        if (INSTANCE.configVersion < VERSION) {
            INSTANCE.floorGap = 3;
            INSTANCE.firstFloorHeight = 0;
            if (INSTANCE.farmSpacing <= 8) INSTANCE.farmSpacing = 30;
            INSTANCE.configVersion = VERSION;
        }
        save();
    }

    public static void save() {
        try { Files.writeString(file(), GSON.toJson(INSTANCE)); } catch (Exception e) { BotClient.LOGGER.warn("config save: {}", e.toString()); }
    }
}
