package ru.onedex.pvpai.analysis;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import ru.onedex.pvpai.PvpAiClient;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/** Persists player profiles + prediction statistics. */
public class ProfileStore {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("1dex1-pvpai-profiles.json");

    public Map<String, Profile> profiles = new HashMap<>();
    public int fights;
    public int predictions;
    public int correct;
    public int wins;
    public int losses;

    public static ProfileStore load() {
        try {
            if (Files.exists(FILE)) {
                try (Reader r = Files.newBufferedReader(FILE)) {
                    ProfileStore s = GSON.fromJson(r, ProfileStore.class);
                    if (s != null) {
                        if (s.profiles == null) s.profiles = new HashMap<>();
                        return s;
                    }
                }
            }
        } catch (Exception e) {
            PvpAiClient.LOGGER.warn("Failed to read profiles", e);
        }
        return new ProfileStore();
    }

    public void save() {
        try {
            // keep the file small: drop players not seen for 30 days
            long cutoff = System.currentTimeMillis() - 30L * 24 * 3600 * 1000;
            profiles.values().removeIf(p -> p.lastSeen < cutoff);
            Files.createDirectories(FILE.getParent());
            try (Writer w = Files.newBufferedWriter(FILE)) {
                GSON.toJson(this, w);
            }
        } catch (Exception e) {
            PvpAiClient.LOGGER.warn("Failed to save profiles", e);
        }
    }
}
