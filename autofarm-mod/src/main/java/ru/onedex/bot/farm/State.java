package ru.onedex.bot.farm;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import ru.onedex.bot.BotClient;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** What the bot has done so far (config/1dex1-bot-state.json), so it goes on after a restart. */
public final class State {
    /** stash, clear, build, storage, farm, sell, bamboo, both */
    public String phase = "stash";
    /** which farm is worked now: 0 = berries (at /home g), 1 = bamboo (next to it) */
    public int farm = 0;
    public Site site;
    public Map<Integer, List<Integer>> built = new HashMap<>();
    public long farmedMs;          // time spent farming in this round
    public long sold;              // items sold in total
    public long harvested;
    public boolean stashDone;
    public String next;            // the phase to go back to after the stash / selling
    public boolean noMoreTorches;  // the stash had no torches left: build without them
    public int digTurn;
    public int digRing;

    private static State INSTANCE;
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("1dex1-bot-state.json"); }

    public static State get() {
        if (INSTANCE == null) load();
        return INSTANCE;
    }

    public static void load() {
        try {
            Path f = file();
            if (Files.exists(f)) INSTANCE = GSON.fromJson(Files.readString(f), State.class);
        } catch (Exception e) {
            BotClient.LOGGER.warn("state: {}", e.toString());
        }
        if (INSTANCE == null) INSTANCE = new State();
        if (INSTANCE.built == null) INSTANCE.built = new HashMap<>();
    }

    public static synchronized void save() {
        try { Files.writeString(file(), GSON.toJson(INSTANCE)); } catch (Exception e) { BotClient.LOGGER.warn("state save: {}", e.toString()); }
    }

    public static void reset() {
        INSTANCE = new State();
        save();
    }

    public boolean isBuilt(int f, int k) { return built.getOrDefault(f, List.of()).contains(k); }

    public void markBuilt(int f, int k) {
        List<Integer> l = built.computeIfAbsent(f, x -> new ArrayList<>());
        if (!l.contains(k)) l.add(k);
        save();
    }

    public int builtCount(int f) { return built.getOrDefault(f, List.of()).size(); }
}
