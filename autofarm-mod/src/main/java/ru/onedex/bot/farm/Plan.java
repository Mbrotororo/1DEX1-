package ru.onedex.bot.farm;

import net.minecraft.block.BlockState;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.bot.Chests;
import ru.onedex.bot.bot.Ctl;
import ru.onedex.bot.bot.Sell;
import ru.onedex.bot.config.BotConfig;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * 1DEX1's plan:
 *  1. /home d — take tools, torches, chests and food from the stash;
 *  2. /home g — break the small berry farm there, dig dirt and build a berries farm (10 floors, 70 x 30);
 *  3. a row of 10 double chests next to it;
 *  4. farm for 2 hours, the harvest goes into the chests (when they are full: sell everything with /b);
 *  5. sell everything, then /rtp until bamboo is found;
 *  6. the same with bamboo (a second farm next to the first), then both farms in turns.
 */
public final class Plan {
    private Plan() {}

    static final Pattern FOOD = Pattern.compile("^(bread|cooked_.*|baked_potato|golden_carrot|carrot|apple|sweet_berries|pumpkin_pie|cookie|steak)$");
    static final Pattern TOOL = Pattern.compile(".*_(shovel|sword|pickaxe|axe)$");
    static final Pattern MANMADE = Pattern.compile(".*(fence|_wall|glass|slab|stairs|planks|lantern|sign|carpet|wool|bricks|trapdoor|door|button|pressure|rail|hopper|composter|barrel|water_cauldron|cauldron|campfire|hay_block|scaffolding).*");

    static State st() { return State.get(); }
    static BotConfig cfg() { return BotConfig.get(); }

    public static void run() {
        State s = st();
        eat();
        switch (s.phase) {
            case "stash" -> stash();
            case "clear" -> clear();
            case "build" -> build(s.farm);
            case "storage" -> placeStorage();
            case "farm" -> farm(s.farm);
            case "sell" -> sellAll();
            case "bamboo" -> findBamboo();
            case "both" -> farmBoth();
            default -> { s.phase = "stash"; State.save(); }
        }
    }

    static void phase(String p) {
        st().phase = p;
        State.save();
        BotClient.LOGGER.info("[bot] этап: {}", p);
    }

    /** Goes to the stash first, then comes back to this phase. */
    static void needStash(String why, String back) {
        Bot.INSTANCE.stage("Нужно взять из стеша: " + why);
        st().next = back;
        phase("stash");
    }

    // ------------------------------------------------------------------ food
    static void eat() {
        int food = Ctl.call(() -> Ctl.player().getHungerManager().getFoodLevel());
        if (food >= 14) return;
        for (int i = 0; i < 6 && Ctl.call(() -> Ctl.player().getHungerManager().getFoodLevel()) < 19; i++) {
            if (!Ctl.hold(n -> FOOD.matcher(n).matches(), null)) return;
            KeyBinding use = Ctl.mc().options.useKey;
            Ctl.run(() -> use.setPressed(true));
            Ctl.ticks(40);
            Ctl.run(() -> use.setPressed(false));
            Ctl.ticks(4);
        }
    }

    // ------------------------------------------------------------------ 1. the stash
    static List<BlockPos> chestsAround(int radius) {
        return Ctl.call(() -> {
            BlockPos me = Ctl.player().getBlockPos();
            List<BlockPos> out = new ArrayList<>();
            for (BlockPos p : BlockPos.iterate(me.add(-radius, -3, -radius), me.add(radius, 4, radius))) {
                String n = Ctl.blockName(Ctl.world().getBlockState(p));
                if (n.equals("chest") || n.equals("barrel") || n.equals("trapped_chest")) out.add(p.toImmutable());
            }
            out.sort(Comparator.comparingDouble(p -> p.getSquaredDistance(me)));
            return out;
        });
    }

    static void stash() {
        Bot.INSTANCE.stage("Иду в стеш (" + cfg().stashCommand + ")");
        if (!Ctl.teleport(cfg().stashCommand, 200)) { Ctl.sleep(5000); return; }
        Bot.INSTANCE.stage("Беру ресурсы из стеша");
        Map<String, Integer> want = new HashMap<>();
        for (BlockPos chest : chestsAround(10)) {
            GenericContainerScreenHandler h = Chests.open(chest);
            if (h == null) continue;
            take(h, n -> n.equals("torch"), 64 * 20 - Ctl.count("torch"));
            take(h, n -> n.equals("chest"), cfg().storagePairs * 2 - Ctl.count("chest"));
            take(h, n -> n.endsWith("_shovel"), Math.max(0, 3 - Ctl.countMatch(n -> n.endsWith("_shovel"))));
            take(h, n -> n.endsWith("_sword"), Math.max(0, 2 - Ctl.countMatch(n -> n.endsWith("_sword"))));
            take(h, n -> n.endsWith("_pickaxe"), Math.max(0, 1 - Ctl.countMatch(n -> n.endsWith("_pickaxe"))));
            take(h, n -> FOOD.matcher(n).matches() && !n.equals("sweet_berries"), 64 - Ctl.countMatch(n -> FOOD.matcher(n).matches()));
            take(h, n -> n.equals("sweet_berries") || n.equals("bamboo"), 256);
            take(h, n -> n.equals("dirt") || n.equals("cobblestone"), Math.max(0, (Ctl.freeSlots() - 10) * 64));
            Chests.close();
        }
        st().stashDone = true;
        String next = st().next != null ? st().next : (st().site == null ? "clear" : "build");
        st().next = null;
        phase(next);
    }

    static void take(GenericContainerScreenHandler h, Predicate<String> test, int want) {
        if (want <= 0 || Ctl.freeSlots() <= 2) return;
        Chests.withdraw(h, test, want);
        Ctl.ticks(3);
    }

    // ------------------------------------------------------------------ 2. the place
    static Site site() { return st().site; }

    static void goFarm() {
        Site s = site();
        if (s != null) {
            Vec3d p = Ctl.pos();
            if (Math.abs(p.x - (s.x + s.W / 2.0)) < s.W + 40 && Math.abs(p.z - (s.z + s.L / 2.0)) < s.L) return;
        }
        Bot.INSTANCE.stage("Иду на ферму (" + cfg().farmCommand + ")");
        Ctl.teleport(cfg().farmCommand, 200);
    }

    static void clear() {
        Bot.INSTANCE.stage("Иду на место фермы (" + cfg().farmCommand + ")");
        if (!Ctl.teleport(cfg().farmCommand, 200)) { Ctl.sleep(5000); return; }
        BlockPos home = Ctl.feet();
        BotConfig c = cfg();
        // the highest ground under the berries farm and its storage
        int top = Ctl.call(() -> {
            int best = -999;
            int x0 = home.getX() - c.farmWidth / 2 - 7, z0 = home.getZ() - c.farmLength / 2 - 2;
            for (int x = x0; x <= x0 + c.farmWidth + 8; x += 2)
                for (int z = z0; z <= z0 + c.farmLength + 3; z += 2)
                    best = Math.max(best, Site.groundNow(Ctl.world(), x, z, home.getY() + 6));
            return best;
        });
        Site s = Site.around(home, top);
        st().site = s;
        State.save();
        BotClient.LOGGER.info("[bot] ферма: {} {} {}", s.x, s.y, s.z);
        // break the small farm (berry bushes give seeds) and anything built on the place
        Bot.INSTANCE.stage("Ломаю мини-ферму");
        for (int round = 0; round < 4; round++) {
            List<BlockPos> todo = Ctl.call(() -> {
                List<BlockPos> out = new ArrayList<>();
                for (BlockPos p : BlockPos.iterate(new BlockPos(s.x - 7, s.y - 1, s.z - 2), new BlockPos(s.x + s.W + 1, s.y + 6, s.z + s.L + 1))) {
                    BlockState st = Ctl.world().getBlockState(p);
                    String n = Ctl.blockName(st);
                    if (n.equals("sweet_berry_bush") || (MANMADE.matcher(n).matches() && !n.contains("chest"))) out.add(p.toImmutable());
                }
                BlockPos me = Ctl.player().getBlockPos();
                out.sort(Comparator.comparingDouble(p -> p.getSquaredDistance(me)));
                return out;
            });
            if (todo.isEmpty()) break;
            for (BlockPos p : todo) {
                if (Ctl.reach(p) > 4.5 && !Ctl.goTo(p, 3.5, 300)) continue;
                Ctl.mine(p);
                if (Ctl.freeSlots() < 3) break;
            }
            Ctl.collectDrops(6, 10);
        }
        st().farm = 0;
        phase("build");
    }

    // ------------------------------------------------------------------ dirt
    static void digDirt(int target) {
        Site s = site();
        int turn = st().digTurn, ring = st().digRing;
        Bot.INSTANCE.stage("Копаю землю");
        int fails = 0;
        while (Ctl.count("dirt") < target && fails < 6 && Ctl.freeSlots() > 3) {
            double ang = turn * Math.PI / 4;
            double cx = s.x + s.W + 4, cz = s.z + s.L / 2.0;   // between the two farms
            double R = Math.max(s.W * 2 + 8, s.L) / 2.0 + 14 + ring;
            BlockPos spot = new BlockPos((int) Math.round(cx + Math.cos(ang) * R), s.y, (int) Math.round(cz + Math.sin(ang) * R));
            Vec3d me = Ctl.pos();
            if (Math.hypot(me.x - spot.getX(), me.z - spot.getZ()) > 16) {
                Ctl.goTo(new BlockPos(spot.getX(), s.ground(spot.getX(), spot.getZ()) + 1, spot.getZ()), 6, 1200);
            }
            List<BlockPos> found = Ctl.call(() -> {
                List<BlockPos> out = new ArrayList<>();
                BlockPos c = Ctl.player().getBlockPos();
                for (BlockPos p : BlockPos.iterate(c.add(-6, -4, -6), c.add(6, 3, 6))) {
                    String n = Ctl.blockName(Ctl.world().getBlockState(p));
                    if (!(n.equals("grass_block") || n.equals("dirt") || n.equals("podzol"))) continue;
                    if (s.inZone(p, 1) || p.getY() < s.y - 3 || p.getY() > s.y + 4) continue;
                    var above = Ctl.world().getBlockState(p.up());
                    if (!above.getCollisionShape(Ctl.world(), p.up()).isEmpty() || !above.getFluidState().isEmpty()) continue;
                    out.add(p.toImmutable());
                }
                out.sort(Comparator.comparingDouble(p -> p.getSquaredDistance(c)));
                return out;
            });
            if (found.isEmpty()) {
                ring += 8;
                if (ring > 64) { ring = 0; turn++; }
                st().digTurn = turn; st().digRing = ring;
                fails++;
                continue;
            }
            int before = Ctl.count("dirt");
            int dug = 0;
            for (BlockPos p : found) {
                if (Ctl.reach(p) > 4.4) continue;
                if (Ctl.mine(p)) dug++;
                if (Ctl.count("dirt") >= target || Ctl.freeSlots() <= 3) break;
            }
            if (dug == 0) { Ctl.goTo(found.get(0), 2.5, 200); fails++; continue; }
            Ctl.collectDrops(3, 4);
            if (Ctl.count("dirt") > before) fails = 0; else fails++;
        }
        State.save();
    }

    // ------------------------------------------------------------------ 3. building
    static List<Integer> unbuilt(int f) {
        List<Integer> l = new ArrayList<>();
        for (int k = 0; k < site().F; k++) if (!st().isBuilt(f, k)) l.add(k);
        return l;
    }

    static void build(int f) {
        Site s = site();
        if (s == null) { phase("clear"); return; }
        goFarm();
        Floors.toGround(s);
        List<Integer> todo = unbuilt(f);
        if (todo.isEmpty()) { phase(f == 0 && !storageReady() ? "storage" : "farm"); return; }
        if (Ctl.count("torch") == 0 && !st().noMoreTorches) { needStash("факелы", "build"); return; }
        // a bag of dirt: as much as fits, leaving room for tools and the column
        if (Floors.blocks() < 300) {
            int room = Math.max(0, Ctl.freeSlots() - 4) * 64;
            digDirt(Ctl.count("dirt") + room);
            if (Floors.blocks() < 100) { Ctl.sleep(2000); return; }
        }
        Bot.INSTANCE.stage("Строю ферму " + (f == 0 ? "ягод" : "бамбука"));
        Floors.trip(s, f, todo, Floors.Mode.BUILD);
    }

    // ------------------------------------------------------------------ 4. storage
    static List<BlockPos> storage() {
        Site s = site();
        List<BlockPos> out = new ArrayList<>();
        for (BlockPos p : s.storageSpots(cfg().storagePairs)) out.add(s.onGround(p));
        return out;
    }

    static boolean storageReady() {
        for (BlockPos p : storage()) if (!Ctl.name(p).contains("chest")) return false;
        return true;
    }

    static void placeStorage() {
        goFarm();
        Floors.toGround(site());
        Bot.INSTANCE.stage("Ставлю хранилище");
        for (BlockPos p : storage()) {
            if (Ctl.name(p).contains("chest")) continue;
            if (Ctl.count("chest") == 0) { needStash("сундуки", "storage"); return; }
            // stand west of the row: both halves of a pair face the same way and join into a double chest
            Ctl.goTo(p.add(-2, 0, 0), 0.6, 400);
            Ctl.place(p, "chest", p.down());
        }
        phase("farm");
    }

    /** Harvest into the storage, keeping some seeds. False when the storage is full. */
    static boolean store() {
        Map<String, Integer> keep = new HashMap<>();
        keep.put("sweet_berries", cfg().keepSeeds);
        keep.put("bamboo", cfg().keepSeeds);
        if (Ctl.count("sweet_berries") <= cfg().keepSeeds && Ctl.count("bamboo") <= cfg().keepSeeds) return true;
        Bot.INSTANCE.stage("Складываю в хранилище");
        for (BlockPos p : storage()) {
            if (Ctl.count("sweet_berries") <= cfg().keepSeeds && Ctl.count("bamboo") <= cfg().keepSeeds) return true;
            if (!Ctl.name(p).contains("chest")) continue;
            GenericContainerScreenHandler h = Chests.open(p);
            if (h == null) continue;
            Chests.deposit(h, n -> n.equals("sweet_berries") || n.equals("bamboo"), keep);
            Chests.close();
        }
        return Ctl.count("sweet_berries") <= cfg().keepSeeds + 64 && Ctl.count("bamboo") <= cfg().keepSeeds + 64;
    }

    // ------------------------------------------------------------------ 5. farming
    static void farm(int f) {
        Site s = site();
        goFarm();
        Floors.toGround(s);
        if (!storageReady()) { phase("storage"); return; }
        long need = cfg().farmMinutes * 60_000L;
        if (st().farmedMs >= need) {
            st().farmedMs = 0;
            st().next = f == 0 ? "bamboo" : "both";
            phase("sell");
            return;
        }
        long t0 = System.currentTimeMillis();
        String plant = s.plant(f);
        if (Ctl.count(plant) < 32) takeFromStorage(plant, cfg().keepSeeds);
        Bot.INSTANCE.stage("Фармлю " + (f == 0 ? "ягоды" : "бамбук"));
        List<Integer> floors = new ArrayList<>();
        for (int k = 0; k < s.F; k++) if (st().isBuilt(f, k)) floors.add(k);
        Floors.Result r = Floors.trip(s, f, floors, Floors.Mode.TEND);
        st().harvested += r.harvested;
        if (!store()) {
            // the chests are full: everything goes to the buyer right now
            sellEverything();
        }
        st().farmedMs += System.currentTimeMillis() - t0;
        State.save();
    }

    static void farmBoth() {
        Site s = site();
        long need = cfg().farmMinutes * 60_000L;
        if (st().farmedMs >= need) { st().farmedMs = 0; st().next = "both"; phase("sell"); return; }
        st().farm = st().farm == 0 ? 1 : 0;
        if (unbuilt(st().farm).size() > 0) { phase("build"); return; }
        farm(st().farm);
        if ("sell".equals(st().phase)) st().next = "both";
        State.save();
        if (!"sell".equals(st().phase)) phase("both");
    }

    static void takeFromStorage(String item, int want) {
        for (BlockPos p : storage()) {
            if (Ctl.count(item) >= want) return;
            if (!Ctl.name(p).contains("chest")) continue;
            GenericContainerScreenHandler h = Chests.open(p);
            if (h == null) continue;
            Chests.withdraw(h, n -> n.equals(item), want - Ctl.count(item));
            Chests.close();
        }
    }

    // ------------------------------------------------------------------ 6. selling
    static void sellEverything() {
        List<String> goods = List.of("sweet_berries", "bamboo");
        for (int round = 0; round < 40; round++) {
            // fill the bag from the chests, one after another
            boolean any = false;
            for (BlockPos p : storage()) {
                if (Ctl.freeSlots() <= 3) break;
                if (!Ctl.name(p).contains("chest")) continue;
                GenericContainerScreenHandler h = Chests.open(p);
                if (h == null) continue;
                if (Chests.withdraw(h, goods::contains, 64 * 30) > 0) any = true;
                Chests.close();
            }
            if (Ctl.count("sweet_berries") + Ctl.count("bamboo") == 0) return;
            int sold = Sell.sell(goods);
            st().sold += sold;
            State.save();
            if (sold == 0) {
                Bot.INSTANCE.stage("Скупщик ничего не взял — проверь меню " + cfg().sellCommand);
                store();
                Ctl.sleep(10_000);
                return;
            }
            goFarm();
            if (!any) return;
        }
    }

    static void sellAll() {
        goFarm();
        Floors.toGround(site());
        Bot.INSTANCE.stage("Сдаю всё скупщику");
        store();
        sellEverything();
        String next = st().next != null ? st().next : "farm";
        st().next = null;
        phase(next);
    }

    // ------------------------------------------------------------------ 7. bamboo
    static void findBamboo() {
        Bot.INSTANCE.stage("Ищу бамбук (" + cfg().rtpCommand + ")");
        if (Ctl.count("bamboo") >= 128) {
            goFarm();
            st().farm = 1;
            phase("build");
            return;
        }
        if (!Ctl.teleport(cfg().rtpCommand, 300)) { Ctl.sleep(8000); return; }
        Ctl.ticks(40);
        for (int pick = 0; pick < 30 && Ctl.count("bamboo") < 256 && Ctl.freeSlots() > 3; pick++) {
            BlockPos base = Ctl.call(() -> {
                BlockPos me = Ctl.player().getBlockPos();
                BlockPos best = null;
                double bd = 1e9;
                for (BlockPos p : BlockPos.iterate(me.add(-48, -12, -48), me.add(48, 12, 48))) {
                    if (!Ctl.blockName(Ctl.world().getBlockState(p)).equals("bamboo")) continue;
                    if (Ctl.blockName(Ctl.world().getBlockState(p.down())).equals("bamboo")) continue;
                    double d = p.getSquaredDistance(me);
                    if (d < bd) { bd = d; best = p.toImmutable(); }
                }
                return best;
            });
            if (base == null) break;
            Bot.INSTANCE.stage("Нашёл бамбук! Собираю");
            if (Ctl.reach(base) > 4.4 && !Ctl.goTo(base, 2.5, 600)) continue;
            Ctl.mine(base);
            Ctl.collectDrops(5, 6);
        }
        if (Ctl.count("bamboo") >= 64) {
            Bot.INSTANCE.stage("Бамбук есть — домой (" + cfg().farmCommand + ")");
            Ctl.teleport(cfg().farmCommand, 200);
            st().farm = 1;
            phase("build");
        }
    }
}
