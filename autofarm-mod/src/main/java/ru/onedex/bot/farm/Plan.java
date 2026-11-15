package ru.onedex.bot.farm;

import net.minecraft.block.BlockState;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.bot.Chests;
import ru.onedex.bot.bot.Ctl;
import ru.onedex.bot.bot.Move;
import ru.onedex.bot.bot.Sell;
import ru.onedex.bot.config.BotConfig;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    /** The food eaten first: things that cannot be planted by mistake come before carrots and berries. */
    static final List<String> FOOD_ORDER = List.of("cooked_beef", "cooked_porkchop", "golden_carrot", "cooked_mutton", "cooked_salmon",
            "cooked_chicken", "baked_potato", "bread", "cooked_cod", "cooked_rabbit", "pumpkin_pie", "apple", "cookie", "carrot", "sweet_berries");
    /** What the bot's own work leaves in the bag and nobody needs (thrown away when the bag gets full). */
    static final Pattern JUNK = Pattern.compile("^(wheat_seeds|beetroot_seeds|pumpkin_seeds|melon_seeds|.*_sapling|stick|dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|pink_petals|gravel|flint|sand|red_sand|calcite|clay_ball|rotten_flesh|bone|arrow|string|spider_eye|poisonous_potato|kelp|seagrass|dead_bush|vine|glow_lichen|moss_carpet|.*_leaves|short_grass|tall_grass|fern|large_fern|coarse_dirt|rooted_dirt|hanging_roots|mangrove_roots|pointed_dripstone)$");
    static final Pattern MANMADE = Pattern.compile(".*(fence|_wall|glass|slab|stairs|planks|lantern|sign|carpet|wool|bricks|trapdoor|door|button|pressure|rail|composter|water_cauldron|cauldron|campfire|hay_block|scaffolding).*");

    static State st() { return State.get(); }
    static long lastShovelTrip;
    static int interruptedStores;
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
            // the bamboo farm is off: a saved bamboo step goes back to the berry farm
            case "bamboo" -> { if (cfg().bambooFarm) findBamboo(); else { s.farm = 0; phase("farm"); } }
            case "both" -> { if (cfg().bambooFarm) farmBoth(); else { s.farm = 0; phase("farm"); } }
            default -> { s.phase = "stash"; State.save(); }
        }
    }

    static void phase(String p) {
        st().phase = p;
        State.save();
        BotClient.LOGGER.info("[bot] этап: {}", p);
    }

    /** The phase to go on with after a side trip (stash, storage, selling): what was set, or `def`. */
    static String takeNext(String def) {
        String n = st().next != null ? st().next : def;
        st().next = st().after;
        st().after = null;
        return n;
    }

    /** Goes to the stash first, then comes back to this phase (and after it, to where we were going). */
    static void needStash(String why, String back) {
        Bot.INSTANCE.stage("Нужно взять из стеша: " + why);
        if (st().next != null && !st().next.equals(back)) st().after = st().next;
        st().next = back;
        phase("stash");
    }

    // ------------------------------------------------------------------ food
    static int foodRank(String n) {
        int i = FOOD_ORDER.indexOf(n);
        return i >= 0 ? i : (FOOD.matcher(n).matches() ? 50 : 99);
    }

    /**
     * Eats when hungry. Sneaking and looking up: a click on a chest does not open it while sneaking, and
     * food that can be planted (berries, carrots) finds no soil to go on up there, so it is eaten.
     */
    static void eat() {
        int food = Ctl.call(() -> Ctl.player().getHungerManager().getFoodLevel());
        if (food >= 14) return;
        Ctl.closeScreen();
        Comparator<ItemStack> best = Comparator.comparingInt(s -> -foodRank(Ctl.itemName(s)));
        // the food in the hand first (standing, not sneaking), then sneak and look up
        if (!Ctl.hold(n -> FOOD.matcher(n).matches(), best)) return;
        Move.sneak(true);
        Move.look(Ctl.call(() -> Ctl.player().getYaw()), -90f);
        Ctl.ticks(14);   // the head goes up smoothly
        try {
            for (int i = 0; i < 6 && Ctl.call(() -> Ctl.player().getHungerManager().getFoodLevel()) < 19; i++) {
                // the next piece: from the hotbar it is a slot change only; from the bag hold() stands up for it
                if (!Ctl.hold(n -> FOOD.matcher(n).matches(), best)) return;
                KeyBinding use = Ctl.mc().options.useKey;
                Ctl.run(() -> use.setPressed(true));
                Ctl.ticks(40);
                Ctl.run(() -> use.setPressed(false));
                Ctl.ticks(4);
            }
        } finally {
            Ctl.run(() -> Ctl.mc().options.useKey.setPressed(false));
            Move.sneak(false);
        }
    }

    // ------------------------------------------------------------------ the bag
    /** Throws away junk when the bag is getting full (never anything that is not on the junk list). */
    static void tidyBag(int wantFree) {
        if (Ctl.freeSlots() >= wantFree) return;
        Bot.INSTANCE.stage("Выкидываю мусор");
        Ctl.toss(n -> JUNK.matcher(n).matches());
        // more building blocks than repairs and the column need: only once both farms stand (until then
        // the dirt is for the next floors, and digging it takes long)
        Site s = site();
        boolean allBuilt = s != null && st().builtCount(0) >= s.F && (!cfg().bambooFarm || st().builtCount(1) >= s.F);
        if (Ctl.freeSlots() < wantFree && allBuilt) {
            Ctl.tossExcess("dirt", 64 * 3);
            Ctl.tossExcess("cobblestone", 64 * 2);
        }
    }

    // ------------------------------------------------------------------ 1. the stash
    static List<BlockPos> chestsAround(int radius) {
        return Ctl.direct(() -> {
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
        tidyBag(8);
        Bot.INSTANCE.stage("Иду в стеш (" + cfg().stashCommand + ")");
        if (!Ctl.teleport(cfg().stashCommand, 200)) { Ctl.sleep(5000); return; }
        Bot.INSTANCE.stage("Беру ресурсы из стеша");
        for (BlockPos chest : chestsAround(10)) {
            GenericContainerScreenHandler h = Chests.open(chest);
            if (h == null) continue;
            // torches for a few floors at a time: the bag also has to carry the dirt (more on the next visit)
            take(h, n -> n.equals("torch"), 64 * 6 - Ctl.count("torch"));
            take(h, n -> n.equals("chest"), cfg().storagePairs * 2 - Ctl.count("chest"));
            take(h, n -> n.endsWith("_shovel"), Math.max(0, 3 - Ctl.countMatch(n -> n.endsWith("_shovel"))));
            take(h, n -> n.endsWith("_sword"), Math.max(0, 1 - Ctl.countMatch(n -> n.endsWith("_sword"))));
            take(h, n -> n.endsWith("_pickaxe"), Math.max(0, 1 - Ctl.countMatch(n -> n.endsWith("_pickaxe"))));
            take(h, n -> FOOD.matcher(n).matches() && !n.equals("sweet_berries"), 64 - Ctl.countMatch(n -> FOOD.matcher(n).matches()));
            take(h, n -> n.equals("sweet_berries") || n.equals("bamboo"), 256 - Ctl.count("sweet_berries") - Ctl.count("bamboo"));
            take(h, n -> n.equals("dirt") || Floors.WALK_ITEMS.contains(n), Math.max(0, (Ctl.freeSlots() - 10) * 64));
            Chests.close();
        }
        st().stashDone = true;
        Ctl.swordToHotbar();   // fights never click in the bag: the sword has to be at hand
        // nothing of it at all although there was room: the stash is out of it
        st().noMoreTorches = Ctl.count("torch") == 0 && Ctl.freeSlots() > 2;
        st().noMoreChests = Ctl.count("chest") == 0 && Ctl.freeSlots() > 2;
        phase(takeNext(st().site == null ? "clear" : "build"));
    }

    static void take(GenericContainerScreenHandler h, Predicate<String> test, int want) {
        if (want <= 0 || Ctl.freeSlots() <= 2) return;
        Chests.withdraw(h, test, want);
        Ctl.ticks(3);
    }

    // ------------------------------------------------------------------ 2. the place
    static Site site() { return st().site; }

    /** Over our area (by x and z: the farm floors are high above the ground, the column base can be low). */
    static boolean nearFarm(Site s, BlockPos p, int margin) {
        return p.getX() >= s.x - 7 - margin && p.getX() <= s.farmX(1) + s.W + 1 + margin &&
                p.getZ() >= s.z - 2 - margin && p.getZ() <= s.z + s.L + 1 + margin;
    }

    /** At the farm (or brought there with the home command). False if the teleport did not work. */
    static boolean goFarm() {
        Site s = site();
        if (s != null && nearFarm(s, Ctl.feet(), 8) && Floors.shaftFails < 2) return true;
        Bot.INSTANCE.stage("Иду на ферму (" + cfg().farmCommand + ")");
        boolean ok = Ctl.teleport(cfg().farmCommand, 200);
        if (ok) Floors.shaftFails = 0;
        else Ctl.sleep(5000);   // a cooldown on the command: next time
        return ok;
    }

    static void clear() {
        Bot.INSTANCE.stage("Иду на место фермы (" + cfg().farmCommand + ")");
        if (!Ctl.teleport(cfg().farmCommand, 200)) { Ctl.sleep(5000); return; }
        BlockPos home = Ctl.feet();
        BotConfig c = cfg();
        Site old = site();
        if (old != null && nearFarm(old, home, 4) && st().builtCount(0) + st().builtCount(1) > 0) {
            // the farm already stands here (the progress was reset): go on with it
            BotClient.LOGGER.info("[bot] ферма уже стоит: {} {} {}", old.x, old.y, old.z);
            phase(takeNext("build"));
            return;
        }
        st().forgetSite();
        // the first floor is the ground we stand on at /home g: the whole place is dug level with it
        int ground = Ctl.direct(() -> Site.groundNow(Ctl.world(), home.getX(), home.getZ(), home.getY()));
        Site s = Site.around(home, ground);
        st().site = s;
        State.save();
        BotClient.LOGGER.info("[bot] ферма: {} {} {}", s.x, s.y, s.z);
        // break the small farm (berry bushes give seeds) and anything built on the place
        Bot.INSTANCE.stage("Ломаю мини-ферму");
        for (int round = 0; round < 4; round++) {
            List<BlockPos> todo = Ctl.direct(() -> {
                List<BlockPos> out = new ArrayList<>();
                for (BlockPos p : BlockPos.iterate(new BlockPos(s.x - 7, s.y - 1, s.z - 2), new BlockPos(s.x + s.W + 1, s.y + 6, s.z + s.L + 1))) {
                    BlockState st = Ctl.world().getBlockState(p);
                    String n = Ctl.blockName(st);
                    if (n.equals("sweet_berry_bush") || (MANMADE.matcher(n).matches() && !Floors.container(n))) out.add(p.toImmutable());
                }
                BlockPos me = Ctl.player().getBlockPos();
                out.sort(Comparator.comparingDouble(p -> p.getSquaredDistance(me)));
                return out;
            });
            if (todo.isEmpty()) break;
            for (BlockPos p : todo) {
                if (Ctl.reach(p) > 4.5 && !Ctl.goTo(p, 3.5, 300)) continue;
                Ctl.mine(p);
                if (Ctl.freeSlots() < 3) tidyBag(4);
                if (Ctl.freeSlots() < 3) break;
            }
            Ctl.collectDrops(6, 10);
        }
        st().farm = 0;
        phase("build");
    }

    // ------------------------------------------------------------------ dirt
    /** The middle of both farms (dirt is dug away from it). */
    static Vec3d farmsCenter(Site s) {
        return new Vec3d((s.x + s.farmX(1) + s.W) / 2.0, s.y, s.z + s.L / 2.0);
    }

    /**
     * Digs the dirt the bot sees around it, nearest first, never in the farm area or right next to it.
     * A block is dug only when nothing next to it stands higher: the ground goes down one even layer at a
     * time and there is never a pit to fall into. When nothing is left around, it walks further out.
     */
    static final Pattern DIGGABLE = Pattern.compile("^(grass_block|dirt|podzol|coarse_dirt|rooted_dirt|mycelium)$");

    /** The farms themselves with their column and storage strips (and a little around): never dug. */
    static boolean farmGround(Site s, BlockPos p) {
        for (int f = 0; f < 2; f++) {
            int x0 = s.farmX(f) - (f == 0 ? 9 : 5), x1 = s.farmX(f) + s.W + 2;
            if (p.getX() >= x0 && p.getX() <= x1 && p.getZ() >= s.z - 4 && p.getZ() <= s.z + s.L + 3) return true;
        }
        return false;
    }

    /**
     * Digs the dirt and grass the bot sees around it, never on the farms. Nothing deeper than the ground it
     * stands on, hills and bumps first, so the land goes down evenly; out of a hole it cannot walk out of by
     * a little column. When nothing is left in sight it goes round the farms to the next side.
     */
    static void digDirt(int target) {
        Move.quick = true;
        try {
            digDirtQuick(target);
        } finally {
            Move.quick = false;
        }
    }

    static void digDirtQuick(int target) {
        Site s = site();
        Bot.INSTANCE.stage("Копаю землю");
        tidyBag(6);
        Set<BlockPos> skip = new HashSet<>();
        Set<BlockPos> mined = new HashSet<>();
        int moves = 0, dug = 0, walkFails = 0;
        BlockPos[] last = {null};   // the block dug before: the next one near it (little turning and walking)
        while (Ctl.count("dirt") < target && Ctl.freeSlots() > 3 && moves < 10) {
            BlockPos next = Ctl.direct(() -> {
                var w = Ctl.world();
                BlockPos me = Ctl.player().getBlockPos();
                BlockPos best = null;
                double bs = 1e18;
                for (BlockPos p : BlockPos.iterate(me.add(-16, -1, -16), me.add(16, 5, 16))) {
                    if (p.getY() < me.getY() - 1 || skip.contains(p)) continue;   // not deeper than where we stand
                    String n = Ctl.blockName(w.getBlockState(p));
                    if (!DIGGABLE.matcher(n).matches()) continue;
                    if (p.getX() == me.getX() && p.getZ() == me.getZ()) continue;   // what we stand on
                    if (farmGround(s, p)) continue;
                    BlockPos up = p.up();
                    if (!w.getBlockState(up).getCollisionShape(w, up).isEmpty() || !w.getFluidState(up).isEmpty()) continue;
                    if (!Ctl.solidNow(p.down())) continue;   // no hole into a cave
                    boolean wet = false;
                    for (net.minecraft.util.math.Direction d : net.minecraft.util.math.Direction.Type.HORIZONTAL)
                        if (!w.getFluidState(p.offset(d)).isEmpty()) wet = true;   // water would run in
                    if (wet) continue;
                    // near first, higher first (a hill goes before the ground at our feet)
                    double sc = p.getSquaredDistance(me) - 12.0 * (p.getY() - (me.getY() - 1));
                    if (last[0] != null) sc += 0.6 * p.getSquaredDistance(last[0]);
                    if (sc < bs) { bs = sc; best = p.toImmutable(); }
                }
                return best;
            });
            if (next != null && mined.contains(next)) { skip.add(next); continue; }   // it came back: protected ground
            if (next == null || walkFails >= 4) {
                // nothing (more) to get here: on round the farms to the next side
                walkFails = 0;
                moves++;
                Ctl.collectDrops(6, 10);
                int turn = st().digTurn++;
                double ang = turn * Math.PI / 4;
                double r = Math.max(s.farmX(1) + s.W - s.x, s.L) / 2.0 + 12 + 10 * ((turn / 8) % 4);
                Vec3d c = farmsCenter(s);
                int tx = (int) Math.round(c.x + Math.cos(ang) * r), tz = (int) Math.round(c.z + Math.sin(ang) * r);
                Bot.INSTANCE.stage("Иду за землёй");
                int ty = Ctl.direct(() -> Site.groundNow(Ctl.world(), tx, tz, Ctl.feet().getY() + 20)) + 1;
                if (!Ctl.goTo(new BlockPos(tx, ty, tz), 6, 900)) climbOut();
                Bot.INSTANCE.stage("Копаю землю");
                continue;
            }
            if (Ctl.reach(next) > 4.3 && !Ctl.goTo(next.up(), 3.0, 300)) {
                // cannot get there (water, a fence, a wall): that whole bit is left
                for (BlockPos q : BlockPos.iterate(next.add(-2, -2, -2), next.add(2, 2, 2))) skip.add(q.toImmutable());
                if (++walkFails >= 2) climbOut();
                continue;
            }
            walkFails = 0;
            // (ground that is protected comes back right away: mine() says so, and it is left alone)
            if (Ctl.mine(next, false)) {
                mined.add(next);
                last[0] = next;
                dug++;
                if (dug % 6 == 0) Ctl.collectDrops(6, 12);   // the dirt falls where the block was: go and get it
                if (Ctl.freeSlots() <= 4) tidyBag(6);
            } else skip.add(next);
        }
        Ctl.collectDrops(6, 12);
        State.save();
    }

    /** Down in a hole the paths cannot leave: build a little column under us up to the ground around. */
    static void climbOut() {
        int around = Ctl.direct(() -> {
            BlockPos c = Ctl.player().getBlockPos();
            int t = c.getY() - 1;
            for (int dx = -2; dx <= 2; dx++) for (int dz = -2; dz <= 2; dz++)
                t = Math.max(t, Site.groundNow(Ctl.world(), c.getX() + dx, c.getZ() + dz, c.getY() + 4));
            return t;
        });
        climbOut(around + 1);
    }

    /** Down in a hole deeper than a step: build a little column under us and walk out from its top. */
    static void climbOut(int groundY) {
        for (int i = 0; i < 3 && Ctl.feet().getY() < groundY - 1; i++) {
            String mat = Ctl.count("dirt") > 0 ? "dirt" : Floors.walkItem();
            if (mat == null || !Ctl.pillarUp(mat)) break;
        }
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
        List<Integer> todo = unbuilt(f);
        if (!todo.isEmpty()) {
            // torches are needed for floors never built (a floor mended after a hole has its torches)
            boolean fresh = false;
            for (int k : todo) if (!st().everBuilt(f, k)) fresh = true;
            if (fresh && Ctl.count("torch") == 0) {
                if (!st().noMoreTorches) { needStash("факелы", "build"); return; }
                // the stash had none: wait for them; a dark farm grows nothing and monsters spawn on it
                Bot.INSTANCE.stage("Положи факелы в стеш (" + cfg().stashCommand + ")");
                Ctl.sleep(60_000);
                st().noMoreTorches = false;
                State.save();
                return;
            }
            if (!Ctl.has(n -> n.endsWith("_shovel")) && System.currentTimeMillis() - lastShovelTrip > 15 * 60_000L) {
                lastShovelTrip = System.currentTimeMillis();
                needStash("лопаты", "build");
                return;
            }
            // a harvest round first when it is time (the bag is emptiest now, before more dirt is dug)
            if (tendWhileBuilding(s, f)) return;
            // a bag of dirt first (the rows can only be dirt). The first floor is the ground itself: it is dug
            // level right away (holes take only a little dirt, and what is dug off the bumps comes in).
            // Dirt is dug from where we are; the home command only brings us back to build.
            // (with blocks in the bag it builds with them first, and goes for more when they run out)
            boolean groundFloor = todo.get(0) == 0 && s.first == 0;
            int need = groundFloor ? 32 : 64;
            if (Ctl.count("dirt") < need) {
                if (!nearFarm(s, Ctl.feet(), 150)) { if (!goFarm()) return; }
                Floors.toGround(s);
                // a bag full of plants: into the chests first (with no room the dirt cannot be dug)
                if (Ctl.freeSlots() <= 4 && storageReady()) store();
                int room = Math.min(12, Math.max(0, Ctl.freeSlots() - 4)) * 64;   // 12 stacks a trip at most
                digDirt(Ctl.count("dirt") + room);
                if (Ctl.count("dirt") < Math.min(need, 64)) { Ctl.sleep(1000); return; }   // more next time, from here
            }
        }
        if (!goFarm()) return;
        if (!nearFarm(s, Ctl.feet(), 40)) {
            // the home command leads somewhere else now: a new place for the farm
            BotClient.LOGGER.info("[bot] /home g теперь в другом месте — новая ферма");
            st().forgetSite();
            phase("clear");
            return;
        }
        if (f == 1 && s.y1 == null) {
            // the bamboo farm's own ground: the usual height of the ground where it goes
            s.y1 = Ctl.direct(() -> {
                List<Integer> hs = new ArrayList<>();
                for (int dx = 0; dx < s.W; dx += 3)
                    for (int dz = 0; dz < s.L; dz += 3)
                        hs.add(Site.groundNow(Ctl.world(), s.farmX(1) + dx, s.z + dz, s.top() + 16));
                hs.sort(Integer::compare);
                return hs.get(hs.size() / 2);
            });
            State.save();
            BotClient.LOGGER.info("[bot] ферма бамбука: земля {}", s.y1);
        }
        Floors.toGround(s);
        if (todo.isEmpty()) {
            st().tendAt = 0;   // the next farm's building starts its own clock
            st().tendFloors = 0;
            if (f == 0 && !storageReady()) { st().next = takeNext("farm"); phase("storage"); }
            else phase(takeNext("farm"));
            return;
        }
        if (todo.get(0) == 0) {
            // somebody's chest (or furnace, barrel...) on the ground of the farm: the bot never breaks those
            BlockPos box = Ctl.direct(() -> {
                for (BlockPos p : BlockPos.iterate(new BlockPos(s.farmX(f), s.base(f) + 1, s.z), new BlockPos(s.farmX(f) + s.W - 1, s.base(f) + s.gap - 1, s.z + s.L - 1)))
                    if (Floors.container(Ctl.blockName(Ctl.world().getBlockState(p)))) return p.toImmutable();
                return null;
            });
            if (box != null) {
                Bot.INSTANCE.stage("Убери " + Ctl.name(box) + " с места фермы: " + box.getX() + " " + box.getY() + " " + box.getZ());
                Ctl.sleep(30_000);
                return;
            }
        }
        // the chests right after the ground floor: what grows while the rest is built has somewhere to go
        // (when they cannot be put now, building goes on and they are tried again a while later)
        if (f == 0 && st().isBuilt(0, 0) && !storageReady() && System.currentTimeMillis() - storageGaveUp > 15 * 60_000L) {
            // a return already set (farm, both) comes back to building by itself while a floor is unbuilt
            if (st().next == null) st().next = "build";
            phase("storage");
            return;
        }
        Bot.INSTANCE.stage("Строю ферму " + (f == 0 ? "ягод" : "бамбука"));
        Floors.stopAfterFloor = cfg().harvestEveryMinutes > 0;
        Floors.trip(s, f, todo, Floors.Mode.BUILD);
    }

    /**
     * While a farm is being built: every harvestEveryMinutes a round over the floors already built. What is ripe
     * is picked (only as much as the empty rows still need) and planted on the empty rows, lowest floor first, so
     * the farm fills up floor by floor while the rest goes up. Bamboo is cut above its first piece and grows back.
     * True if a round was made.
     */
    static boolean tendWhileBuilding(Site s, int f) {
        int every = cfg().harvestEveryMinutes;
        if (every <= 0) return false;
        List<Integer> done = new ArrayList<>();
        for (int k = 0; k < s.F; k++) if (st().isBuilt(f, k)) done.add(k);
        if (done.isEmpty()) return false;
        long now = System.currentTimeMillis();
        // the first time: right away when several floors already stand (plants on them may be ripe); else the
        // clock starts now (the ground floor was just planted)
        if (st().tendAt == 0) { st().tendAt = done.size() > 1 ? 1 : now; State.save(); }
        // a floor finished since the last round: a round right away (its rows get plants while the next goes up)
        boolean newFloor = done.size() > st().tendFloors;
        if (!newFloor && now - st().tendAt < every * 60_000L) return false;
        // what the round can put on the rows: the plants in the bag, and what fits in it (two slots kept free).
        // What is picked is planted on the same round, so a bag full of dirt still leaves room for a round.
        // Too little: later, when the blocks in the bag are used up
        int fits = Ctl.count(s.plant(f)) + Math.max(0, Ctl.freeSlots() - 2) * 64;
        if (fits < 32) return false;
        // the rows are read at the farm: from the stash its chunks are not loaded (a failed teleport: next call)
        if (!goFarm()) return false;
        st().tendAt = now;   // a round cut short (a fight, a restart) is not begun again at once
        st().tendFloors = done.size();
        State.save();
        // the floors with empty rows, and how many plants they need: none, no round (until a new floor stands)
        int[] empty = Floors.emptyRows(s, f, done);
        int need = 0, top = -1;
        for (int i = 0; i < done.size(); i++) if (empty[i] > 0) { need += empty[i]; top = done.get(i); }
        if (need == 0) return false;
        Floors.toGround(s);
        List<Integer> floors = new ArrayList<>();
        for (int k : done) if (k <= top) floors.add(k);   // the floors above the last empty row are not walked
        Bot.INSTANCE.stage("Собираю урожай и сажаю");
        Floors.Result r;
        Floors.harvestCap = Math.min(need + 32, fits);   // only what the empty rows need, and what fits
        try {
            r = Floors.trip(s, f, floors, Floors.Mode.TEND);
        } finally {
            Floors.harvestCap = Integer.MAX_VALUE;
        }
        st().harvested += r.harvested;
        BotClient.LOGGER.info("[bot] обход: собрал {}, посадил {} (пустых грядок было {})", r.harvested, r.planted, need);
        if (storageReady()) store();   // what is more than is kept for planting goes into the chests
        st().tendAt = System.currentTimeMillis();   // the next round counts from the end of this one
        State.save();
        return true;
    }

    // ------------------------------------------------------------------ 4. storage
    static List<BlockPos> storage() {
        Site s = site();
        List<BlockPos> out = new ArrayList<>();
        List<BlockPos> spots = s.storageSpots(cfg().storagePairs);
        for (int i = 0; i < spots.size(); i++) if (!st().badStorage.contains(i)) out.add(s.storageAt(spots.get(i)));
        return out;
    }

    /** Every spot has its chest; or the stash is out of chests and at least one stands (we use what there is). */
    static boolean storageReady() {
        List<BlockPos> l = storage();
        int have = 0;
        for (BlockPos p : l) if (Ctl.name(p).contains("chest")) have++;
        if (have == 0) return false;
        return have == l.size() || st().noMoreChests;
    }

    static final Map<Integer, Integer> storageFails = new HashMap<>();
    /** When the storage could not be finished while the farm was being built (building went on). */
    static long storageGaveUp;

    /** Puts an item, clearing once whatever (not a container) is between the eye and the face. */
    static boolean placeClearing(BlockPos target, String item, BlockPos ref) {
        if (Ctl.place(target, item, ref)) return true;
        BlockPos ob = Ctl.lastObstacle;
        if (ob == null || ob.equals(ref) || Floors.container(Ctl.name(ob)) || !Ctl.mine(ob)) return false;
        return Ctl.place(target, item, ref);
    }

    static void placeStorage() {
        Site s = site();
        if (!goFarm()) return;
        Floors.toGround(s);
        Bot.INSTANCE.stage("Ставлю хранилище");
        List<BlockPos> spots = s.storageSpots(cfg().storagePairs);
        for (int i = 0; i < spots.size(); i++) {
            if (st().badStorage.contains(i)) continue;
            BlockPos p = s.storageAt(spots.get(i));
            if (Ctl.name(p).contains("chest")) continue;
            if (Ctl.count("chest") == 0) {
                if (!st().noMoreChests) { st().next = takeNext("farm"); needStash("сундуки", "storage"); return; }
                break;   // the stash had none: we go on with the chests that stand
            }
            // stand on the farm's ground floor east of the spot: both halves of a pair face the same way and
            // join into a double chest; the earth between us and the spot (a bank beside a dug farm) goes first
            BlockPos stand = new BlockPos(s.farmX(0), p.getY(), p.getZ());
            boolean ok = Ctl.goTo(stand, 0.6, 600);
            if (ok) {
                for (int dx = 1; dx <= 3; dx++)
                    for (int up = 0; up <= 1; up++) {
                        BlockPos q = new BlockPos(p.getX() + dx - 1, p.getY() + up, p.getZ());
                        String n = Ctl.name(q);
                        if (!Floors.air(n) && !Floors.container(n) && !n.contains("torch")) Ctl.mine(q);
                    }
                // ground under the chest
                if (!Ctl.solid(p.down())) {
                    String mat = Ctl.count("dirt") > 0 ? "dirt" : Floors.walkItem();
                    if (mat != null) Ctl.placeAny(p.down(), mat);
                }
                ok = placeClearing(p, "chest", p.down()) || Ctl.name(p).contains("chest");
            }
            if (!ok) {
                int n = storageFails.merge(i, 1, Integer::sum);
                if (n >= 3) { st().badStorage.add(i); State.save(); BotClient.LOGGER.info("[bot] место для сундука {} пропущено", i); }
            }
        }
        if (storageReady()) {
            lightStorage(s);
            phase(takeNext("farm"));
            return;
        }
        if ("build".equals(st().next)) {
            // the farm is still being built: building does not need the chests, it goes on (tried again later)
            storageGaveUp = System.currentTimeMillis();
            st().noMoreChests = false;   // the next try looks in the stash again
            BotClient.LOGGER.info("[bot] хранилище пока не поставить — строю дальше");
            phase(takeNext("build"));
            return;
        }
        // not a single chest could be put: tell it and wait (the owner brings chests or frees the place)
        Bot.INSTANCE.stage(Ctl.count("chest") == 0 ? "Положи сундуки в стеш (" + cfg().stashCommand + ")" : "Нет места для сундуков у фермы");
        Ctl.sleep(60_000);
        st().noMoreChests = false;
        if (storage().isEmpty()) st().badStorage.clear();
        State.save();
    }

    /** A torch in the free cell between two pairs of chests: no monster appears at the storage at night. */
    static void lightStorage(Site s) {
        List<BlockPos> spots = s.storageSpots(cfg().storagePairs);
        for (int i = 1; i + 1 < spots.size(); i += 2) {
            if (Ctl.count("torch") == 0) return;
            BlockPos a = spots.get(i);
            BlockPos gap = s.storageAt(a.add(0, 0, 1));
            // a bank of earth left there: the torch goes on top of it
            for (int up = 0; up < 3 && Ctl.solid(gap); up++) gap = gap.up();
            if (Ctl.name(gap).contains("torch") || Floors.container(Ctl.name(gap)) || Ctl.solid(gap) || !Ctl.solid(gap.down())) continue;
            BlockPos stand = s.first == 0 ? new BlockPos(s.farmX(0), gap.getY(), gap.getZ()) : gap.add(-2, 0, 0);
            if (Ctl.reach(gap) > 4.0 && !Ctl.goTo(stand, 0.8, 300)) continue;
            placeClearing(gap, "torch", gap.down());
        }
    }

    /** Harvest into the storage, keeping some seeds. False when the storage is full. */
    static boolean store() {
        Map<String, Integer> keep = new HashMap<>();
        keep.put("sweet_berries", cfg().keepSeeds);
        keep.put("bamboo", cfg().keepSeeds);
        tidyBag(6);
        if (Ctl.count("sweet_berries") <= cfg().keepSeeds && Ctl.count("bamboo") <= cfg().keepSeeds) return true;
        Bot.INSTANCE.stage("Складываю в хранилище");
        Chests.interrupted = false;
        for (BlockPos p : storage()) {
            if (Ctl.count("sweet_berries") <= cfg().keepSeeds && Ctl.count("bamboo") <= cfg().keepSeeds) return true;
            if (!Ctl.name(p).contains("chest")) continue;
            GenericContainerScreenHandler h = Chests.open(p);
            if (h == null) continue;
            Chests.deposit(h, n -> n.equals("sweet_berries") || n.equals("bamboo"), keep);
            Chests.close();
        }
        // a monster came: not full, just not done (next time); but not forever
        if (Chests.interrupted && ++interruptedStores < 3) return true;
        interruptedStores = 0;
        return Ctl.count("sweet_berries") <= cfg().keepSeeds + 64 && Ctl.count("bamboo") <= cfg().keepSeeds + 64;
    }

    // ------------------------------------------------------------------ 5. farming
    static void farm(int f) {
        Site s = site();
        if (!goFarm()) return;
        Floors.toGround(s);
        String here = st().phase;
        if (!storageReady()) { st().next = here; phase("storage"); return; }
        // a floor with a hole that farming could not mend is built again first
        if (!unbuilt(f).isEmpty()) { st().farm = f; st().next = here; phase("build"); return; }
        long need = cfg().farmMinutes * 60_000L;
        if (st().farmedMs >= need) {
            st().farmedMs = 0;
            st().next = !cfg().bambooFarm ? "farm" : f == 0 && !"both".equals(here) ? "bamboo" : "both";
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
        long need = cfg().farmMinutes * 60_000L;
        if (st().farmedMs >= need) { st().farmedMs = 0; st().next = "both"; phase("sell"); return; }
        st().farm = st().farm == 0 ? 1 : 0;
        if (!unbuilt(st().farm).isEmpty()) { st().next = "both"; phase("build"); return; }
        farm(st().farm);
        // farm() may have sent us somewhere (storage, build, sell): it set "both" to come back to
        State.save();
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
            tidyBag(10);
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
        if (!goFarm()) return;
        Floors.toGround(site());
        Bot.INSTANCE.stage("Сдаю всё скупщику");
        store();
        sellEverything();
        phase(takeNext("farm"));
    }

    // ------------------------------------------------------------------ 7. bamboo
    static void findBamboo() {
        Bot.INSTANCE.stage("Ищу бамбук (" + cfg().rtpCommand + ")");
        if (Ctl.count("bamboo") >= 128) {
            if (!goFarm()) return;
            st().farm = 1;
            phase("build");
            return;
        }
        tidyBag(8);
        if (!Ctl.teleport(cfg().rtpCommand, 300)) { Ctl.sleep(8000); return; }
        Ctl.ticks(40);
        Set<BlockPos> skip = new HashSet<>();
        for (int pick = 0; pick < 30 && Ctl.count("bamboo") < 256 && Ctl.freeSlots() > 3; pick++) {
            BlockPos base = Ctl.direct(() -> {
                BlockPos me = Ctl.player().getBlockPos();
                BlockPos best = null;
                double bd = 1e9;
                for (BlockPos p : BlockPos.iterate(me.add(-48, -12, -48), me.add(48, 12, 48))) {
                    if (!Ctl.blockName(Ctl.world().getBlockState(p)).equals("bamboo")) continue;
                    if (Ctl.blockName(Ctl.world().getBlockState(p.down())).equals("bamboo")) continue;
                    if (skip.contains(p)) continue;
                    double d = p.getSquaredDistance(me);
                    if (d < bd) { bd = d; best = p.toImmutable(); }
                }
                return best;
            });
            if (base == null) break;
            Bot.INSTANCE.stage("Нашёл бамбук! Собираю");
            if (Ctl.reach(base) > 4.4 && !Ctl.goTo(base, 2.5, 600)) { skip.add(base); continue; }
            if (!Ctl.mine(base)) skip.add(base);
            Ctl.collectDrops(5, 6);
        }
        if (Ctl.count("bamboo") >= 64) {
            Bot.INSTANCE.stage("Бамбук есть — домой (" + cfg().farmCommand + ")");
            for (int i = 0; i < 6 && !Ctl.teleport(cfg().farmCommand, 200); i++) Ctl.sleep(10_000);
            st().farm = 1;
            phase("build");
        }
    }
}
