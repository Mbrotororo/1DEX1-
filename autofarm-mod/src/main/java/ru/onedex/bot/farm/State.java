package ru.onedex.bot.farm;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import ru.onedex.bot.BotClient;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
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
    public long tendAt;            // the last harvest round while the farm was still being built
    public long sold;              // items sold in total
    public long harvested;
    public boolean stashDone;
    public String next;            // the phase to go back to after the stash / selling
    public String after;           // and the one after that (a stash trip in the middle of a side trip)
    public boolean noMoreTorches;  // the stash had no torches left (the bot waits for them, a dark farm grows nothing)
    public int digTurn;
    public int digRing;
    public List<Integer> lit = new ArrayList<>();         // farms whose ground under floor 0 has its torches
    public List<Integer> badStorage = new ArrayList<>();  // storage spots where no chest could be put
    public boolean noMoreChests;   // the stash had no chests left: the storage stays as it is
    public Map<Integer, List<Integer>> ever = new HashMap<>();   // floors built at least once (they have their torches)
    /** Saved by an older version (another farm layout): its place and floors are not used. */
    public int stateVersion = 0;
    static final int VERSION = 2;

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
        if (INSTANCE == null) {
            // a broken file (the game was closed while it was written): the copy before it
            try {
                Path b = file().resolveSibling("1dex1-bot-state.json.bak");
                if (Files.exists(b)) INSTANCE = GSON.fromJson(Files.readString(b), State.class);
            } catch (Exception e) {
                BotClient.LOGGER.warn("state backup: {}", e.toString());
            }
        }
        if (INSTANCE == null) { INSTANCE = new State(); INSTANCE.stateVersion = VERSION; }
        if (INSTANCE.built == null) INSTANCE.built = new HashMap<>();
        if (INSTANCE.stateVersion < VERSION) {
            // the farm is laid out differently now: start the place over (the bag keeps what the stash gave)
            boolean stashed = INSTANCE.stashDone;
            INSTANCE = new State();
            INSTANCE.stateVersion = VERSION;
            INSTANCE.stashDone = stashed;
            INSTANCE.phase = stashed ? "clear" : "stash";
            save();
        }
        if (INSTANCE.lit == null) INSTANCE.lit = new ArrayList<>();
        if (INSTANCE.badStorage == null) INSTANCE.badStorage = new ArrayList<>();
        if (INSTANCE.ever == null) INSTANCE.ever = new HashMap<>();
        if (INSTANCE.ever.isEmpty()) {
            // a state saved before this was kept: what is built now has been built
            for (var e : INSTANCE.built.entrySet()) INSTANCE.ever.put(e.getKey(), new ArrayList<>(e.getValue()));
        }
    }

    /** Written to a temp file and moved over the old one, so a crash never leaves half a file. */
    public static synchronized void save() {
        try {
            Path f = file();
            Path tmp = f.resolveSibling("1dex1-bot-state.json.tmp");
            Files.writeString(tmp, GSON.toJson(INSTANCE));
            if (Files.exists(f)) Files.copy(f, f.resolveSibling("1dex1-bot-state.json.bak"), StandardCopyOption.REPLACE_EXISTING);
            try {
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception e) {
            BotClient.LOGGER.warn("state save: {}", e.toString());
        }
    }

    /**
     * The plan starts over from the stash. What is already built stays known (the place, the floors,
     * the light under them), so a farm that stands is not built a second time over itself.
     */
    public static void reset() {
        State old = get();
        INSTANCE = new State();
        INSTANCE.stateVersion = VERSION;
        INSTANCE.site = old.site;
        INSTANCE.built = old.built;
        INSTANCE.lit = old.lit;
        INSTANCE.ever = old.ever;
        save();
    }

    /** Forget the place too (a new /home g somewhere else). */
    public void forgetSite() {
        site = null;
        built = new HashMap<>();
        lit = new ArrayList<>();
        badStorage = new ArrayList<>();
        ever = new HashMap<>();
        digTurn = 0;
        digRing = 0;
        tendAt = 0;
    }

    public void unmarkBuilt(int f, int k) {
        List<Integer> l = built.get(f);
        if (l != null && l.remove(Integer.valueOf(k))) save();
    }

    public boolean isBuilt(int f, int k) { return built.getOrDefault(f, List.of()).contains(k); }

    public void markBuilt(int f, int k) {
        List<Integer> l = built.computeIfAbsent(f, x -> new ArrayList<>());
        if (!l.contains(k)) l.add(k);
        List<Integer> e = ever.computeIfAbsent(f, x -> new ArrayList<>());
        if (!e.contains(k)) e.add(k);
        save();
    }

    public boolean everBuilt(int f, int k) { return ever.getOrDefault(f, List.of()).contains(k); }

    public int builtCount(int f) { return built.getOrDefault(f, List.of()).size(); }
}
