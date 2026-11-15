package ru.onedex.bot.farm;

import net.minecraft.block.BlockState;
import net.minecraft.state.property.Properties;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.bot.Ctl;
import ru.onedex.bot.config.BotConfig;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Up a column, walking the floors, down again.
 * The bot walks the walkways in straight lines one cell at a time (sneaking at the edges, so it never falls).
 * A missing block ahead is put the way a player bridges: sneak to the edge until the side of the block under
 * us is in sight, click it, then step on. The cells on both sides are put against the cell built one step
 * back, whose face is in sight from where we stand.
 */
public final class Floors {
    private Floors() {}

    static final Pattern SOIL = Pattern.compile("^(dirt|grass_block|coarse_dirt|podzol|rooted_dirt|moss_block)$");
    static final Pattern WALK = Pattern.compile("^(dirt|grass_block|coarse_dirt|podzol|rooted_dirt|moss_block|cobblestone|cobbled_deepslate|stone|deepslate)$");
    /** Somebody's things: never broken by the bot. */
    static final Pattern CONTAINER = Pattern.compile(".*(chest|barrel|shulker_box|furnace|smoker|hopper|dispenser|dropper|brewing_stand|crafter|lectern|jukebox|decorated_pot|beacon|spawner).*");

    public static int blocks() { return Ctl.count("dirt") + Ctl.count("cobblestone"); }

    static boolean air(String n) { return n.equals("air") || n.equals("cave_air") || n.equals("void_air"); }
    static boolean container(String n) { return CONTAINER.matcher(n).matches(); }

    static boolean floorOk(Site s, int f, int dx, int dz, int y) {
        String n = Ctl.name(new BlockPos(s.farmX(f) + dx, y, s.z + dz));
        return (s.isRow(dx, dz) ? SOIL : WALK).matcher(n).matches();
    }

    /** Solid but not ours (a bamboo stalk, leaves, a log) or a plant in the way. */
    static boolean foreign(String n) {
        if (air(n) || n.contains("torch") || n.equals("water") || container(n)) return false;
        return !WALK.matcher(n).matches();
    }

    // ------------------------------------------------------------------ the column
    static int shaftFails;

    static boolean onColumn(BlockPos s) {
        BlockPos f = Ctl.feet();
        return f.getX() == s.getX() && f.getZ() == s.getZ();
    }

    /**
     * Ground of a column = lowest ground of the column cell and the free strip next to it (nothing is built
     * or dug there), so the bot can always step into the column from the side.
     */
    static int colBase(Site s, int f) {
        BlockPos c = s.shaft(f);
        int a = s.ground(c.getX() - 1, c.getZ()), b = s.ground(c.getX() - 1, c.getZ() - 1), d = s.ground(c.getX() - 1, c.getZ() + 1);
        int here = s.ground(c.getX(), c.getZ());
        return Math.min(Math.min(a, here), Math.min(b, d));
    }

    static boolean toShaftBottom(Site s, int f) {
        BlockPos c = s.shaft(f);
        int g = colBase(s, f);
        if (!onColumn(c)) {
            if (!Ctl.goTo(new BlockPos(c.getX() - 1, g + 1, c.getZ()), 1.2, 600)) return false;
            // the column cell and the way into it must be free above the ground
            for (int dx : new int[]{0, -1}) {
                for (int y = g + 4; y >= g + 1; y--) {
                    BlockPos p = new BlockPos(c.getX() + dx, y, c.getZ());
                    String n = Ctl.name(p);
                    if (!air(n) && !container(n) && !n.contains("torch")) Ctl.mine(p);
                }
            }
            Ctl.stepTo(new BlockPos(c.getX() - 1, g + 1, c.getZ()), false);
            Ctl.stepTo(new BlockPos(c.getX(), g + 1, c.getZ()), false);
            if (!onColumn(c)) return false;
        }
        int guard = 0;
        while (Ctl.feet().getY() > g + 1 && guard++ < 60) if (!Ctl.digDown()) break;
        return onColumn(c);
    }

    /**
     * What the column is built of. Cobblestone keeps the dirt for the rows, but only with a pickaxe: the
     * column is dug down again, and cobblestone without a pickaxe takes ten seconds a block.
     */
    static String columnBlock() {
        boolean pick = Ctl.has(n -> n.endsWith("_pickaxe"));
        if (pick && Ctl.count("cobblestone") > 0) return "cobblestone";
        if (Ctl.count("dirt") > 0) return "dirt";
        return Ctl.count("cobblestone") > 0 ? "cobblestone" : null;
    }

    static boolean climb(Site s, int f, int k) {
        int target = s.floorY(k) + 1;
        if (!onColumn(s.shaft(f))) return false;
        int guard = 0;
        while (Ctl.feet().getY() < target && guard++ < 120) {
            BlockPos head = Ctl.feet().up(2);
            if (Ctl.solid(head) && !Ctl.mine(head)) return false;
            String mat = columnBlock();
            if (mat == null) return false;
            boolean up = false;
            for (int t = 0; t < 8 && !up; t++) { up = Ctl.pillarUp(mat); if (!up) Ctl.ticks(5 + t * 2); }
            if (!up) return false;
        }
        return Ctl.feet().getY() == target;
    }

    /** Along the walkways (the x = 0 line and the two end lines) back to the column on this floor. */
    static boolean walkHome(Site s, int f) {
        BlockPos c = s.shaft(f);
        BlockPos p = Ctl.feet();
        int y = p.getY();
        int[] d = {p.getX() - s.farmX(f), p.getZ() - s.z};
        if (d[0] < 0 || d[0] >= s.W || d[1] < 0 || d[1] >= s.L) return onColumn(c);
        java.util.function.BiPredicate<Integer, Integer> walk = (tx, tz) -> {
            while (d[0] != tx || d[1] != tz) {
                int nx = d[0] + Integer.signum(tx - d[0]), nz = d[1] + Integer.signum(tz - d[1]);
                if (!Ctl.stepTo(new BlockPos(s.farmX(f) + nx, y, s.z + nz), true)) return false;
                d[0] = nx; d[1] = nz;
            }
            return true;
        };
        if (d[0] % 2 != 0 && d[0] > 0 && !walk.test(d[0] - 1, d[1])) return false;
        if (d[0] != 0 && d[1] != 0 && d[1] != s.L - 1 && !walk.test(d[0], d[1] < s.L / 2 ? 0 : s.L - 1)) return false;
        if (!walk.test(0, d[1])) return false;
        if (!walk.test(0, c.getZ() - s.z)) return false;
        // after a fall to a lower floor the column itself stands here: open it and step in
        BlockPos in = new BlockPos(c.getX(), y, c.getZ());
        for (BlockPos q : new BlockPos[]{in.up(), in}) {
            String n = Ctl.name(q);
            if (!air(n) && !n.contains("torch") && !container(n)) Ctl.mine(q);
        }
        Ctl.stepTo(in, true);
        return onColumn(c);
    }

    /** Down the column to the ground. Never digs through the farm: without the column, /home brings us down. */
    static void descend(Site s, int f) {
        BlockPos c = s.shaft(f);
        int base = colBase(s, f) + 1;
        if (Ctl.feet().getY() <= base) return;
        for (int tries = 0; tries < 3 && !onColumn(c); tries++) {
            if (walkHome(s, f)) break;
            Ctl.ticks(10);
        }
        if (!onColumn(c)) {
            if (Ctl.feet().getY() <= s.y + 2) return;   // on the ground anyway
            BotClient.LOGGER.info("[bot] не дошёл до столба, спускаюсь командой");
            Ctl.teleport(BotConfig.get().farmCommand, 200);
            return;
        }
        int guard = 0;
        while (Ctl.feet().getY() > base && guard++ < 120) if (!Ctl.digDown()) break;
    }

    /** If we are up on a farm (after a restart), get down by the column. */
    public static void toGround(Site s) {
        BlockPos p = Ctl.feet();
        if (p.getY() <= s.y + 2 || !s.inZone(p, 0)) return;
        int f = p.getX() >= s.farmX(1) - 2 ? 1 : 0;
        Bot.INSTANCE.stage("Спускаюсь");
        descend(s, f);
    }

    // ------------------------------------------------------------------ light under the farm
    /**
     * Torches on the ground under a farm, about 10 blocks apart: with no light there monsters would spawn
     * under floor 0, right where /home g puts us. False if there are not enough torches for it.
     */
    static boolean lightGround(Site s, int f) {
        List<BlockPos> spots = new ArrayList<>();
        for (int dx = 4; dx < s.W; dx += 10)
            for (int dz = 5; dz < s.L; dz += 12) {
                int x = s.farmX(f) + dx, z = s.z + dz;
                spots.add(new BlockPos(x, s.ground(x, z) + 1, z));
            }
        int missing = 0;
        for (BlockPos spot : spots) if (!Ctl.name(spot).contains("torch")) missing++;
        if (missing == 0) return true;
        if (Ctl.count("torch") < missing) return false;
        Bot.INSTANCE.stage("Свечу под фермой");
        for (BlockPos spot : spots) {
            if (Ctl.name(spot).contains("torch")) continue;
            if (!Ctl.goTo(spot, 1.5, 400)) continue;
            String n = Ctl.name(spot);
            if (!air(n) && !container(n) && !Ctl.solid(spot)) Ctl.mine(spot);   // grass or a flower on the spot
            if (Ctl.place(spot, "torch", spot.down())) continue;
            // grass next to it in the way of the look: clear it and try again
            BlockPos ob = Ctl.lastObstacle;
            if (ob != null && !ob.equals(spot.down()) && !container(Ctl.name(ob)) && !Ctl.solid(ob) && Ctl.mine(ob))
                Ctl.place(spot, "torch", spot.down());
        }
        for (BlockPos spot : spots) if (!Ctl.name(spot).contains("torch")) return false;
        return true;
    }

    // ------------------------------------------------------------------ one pass over a floor
    static List<Integer> lanes(int W) {
        List<Integer> l = new ArrayList<>();
        for (int c = 2; c < W; c += 4) l.add(c);
        int lastRow = W - 1;
        if (lastRow % 2 == 0) lastRow--;
        if (!l.isEmpty() && lastRow > l.get(l.size() - 1) + 1) l.add(lastRow + 1 < W ? lastRow + 1 : lastRow - 1);
        return l;
    }

    public enum Mode { BUILD, TEND }

    public static final class Result {
        public int harvested, planted;
        public boolean finished, full, noBlocks, stuck, hole;
        public int lane;
    }

    static final class Pass {
        final Site s; final int f, k, L; final Mode mode; final String plant;
        final List<int[]> path = new ArrayList<>();
        final Result r = new Result();
        boolean blocked, noMaterial;
        int startLane;

        Pass(Site s, int f, int k, Mode mode) {
            this.s = s; this.f = f; this.k = k; this.mode = mode;
            this.L = s.floorY(k);
            this.plant = s.plant(f);
        }

        BlockPos cell(int dx, int dz) { return new BlockPos(s.farmX(f) + dx, L + 1, s.z + dz); }
        BlockPos floor(int dx, int dz) { return new BlockPos(s.farmX(f) + dx, L, s.z + dz); }
        boolean edge(int dx, int dz) { return dx <= 0 || dx >= s.W - 1 || dz <= 0 || dz >= s.L - 1; }

        String material(int dx, int dz) {
            if (s.isRow(dx, dz)) return Ctl.count("dirt") > 0 ? "dirt" : null;
            if (Ctl.count("cobblestone") > 0) return "cobblestone";
            return Ctl.count("dirt") > 0 ? "dirt" : null;
        }

        /** While farming, blocks are spent on repairs only above what the climb to the top floor needs. */
        boolean canSpare() {
            return mode == Mode.BUILD || blocks() > 4 * (s.F - 1 - k) + 8;
        }

        /**
         * Makes floor cell (dx, dz) right. `ref` is the neighbour whose face is clicked; with `bridge`, we
         * first sneak to the edge of `ref` (the block under us) toward the cell, so that face is in sight.
         */
        boolean placeFloor(int dx, int dz, BlockPos ref, Direction bridge) {
            if (floorOk(s, f, dx, dz, L)) return true;
            BlockPos p = floor(dx, dz);
            String n = Ctl.name(p);
            if (container(n)) return false;
            // anything that does not belong here goes: a plant, leaves, or stone / cobblestone in a row of soil
            if (!air(n) && !n.equals("water") && (foreign(n) || s.isRow(dx, dz))) { Ctl.mine(p); n = Ctl.name(p); }
            if (!air(n) && !n.equals("water")) return false;
            String mat = material(dx, dz);
            if (mat == null) { noMaterial = true; return false; }
            if (!canSpare()) return false;
            if (bridge != null) {
                // the block in the hand first, standing in the middle of our cell: at the edge we lean out
                // sneaking, and nobody clicks in the inventory like that
                if (!Ctl.hold(mat)) return false;
                Ctl.edgeToward(ref, bridge);
            }
            BlockPos ob = null;
            if (ref != null && Ctl.solid(ref)) {
                if (Ctl.place(p, mat, ref, bridge != null)) return true;
                ob = Ctl.lastObstacle;   // what was in the way of the best face (before other tries overwrite it)
            }
            if (Ctl.placeAny(p, mat)) return true;
            if (ob == null) ob = Ctl.lastObstacle;
            // leaves or the like between the eye and the face: clear it and try once more (never a crop of the farm)
            String obn = ob == null ? "" : Ctl.name(ob);
            boolean crop = obn.equals("sweet_berry_bush") || obn.startsWith("bamboo");
            if (ob != null && !ob.equals(ref) && !crop && foreign(obn) && Ctl.mine(ob)) {
                if (ref != null && Ctl.solid(ref) && Ctl.place(p, mat, ref, bridge != null)) return true;
                return Ctl.placeAny(p, mat);
            }
            return false;
        }

        /** The two cells above a walkway cell must be free to walk there. */
        void clearWay(int dx, int dz) {
            for (int up = 1; up <= 2; up++) {
                BlockPos p = floor(dx, dz).up(up);
                String n = Ctl.name(p);
                if (!air(n) && !n.contains("torch") && !n.equals("water") && !container(n)) Ctl.mine(p);
            }
        }

        boolean stop(boolean full, boolean noBlocks) {
            blocked = true;
            if (full) r.full = true;
            if (noBlocks) r.noBlocks = true;
            if (!full && !noBlocks) r.stuck = true;
            return false;
        }

        boolean step(int dx, int dz, int fx, int fz) {
            Direction dir = Direction.fromVector(dx - fx, 0, dz - fz, null);
            noMaterial = false;
            // leaves or a stalk above the next cell first: the body leans over there to see the face
            clearWay(dx, dz);
            if (!placeFloor(dx, dz, floor(fx, fz), dir)) {
                if (mode == Mode.TEND) r.hole = true;
                BotClient.LOGGER.info("[bot] этаж {}: не поставил блок {},{} ({})", k + 1, dx, dz, noMaterial ? "нет блоков" : Ctl.name(floor(dx, dz)));
                return stop(false, noMaterial);
            }
            clearWay(dx, dz);
            if (!Ctl.stepTo(cell(dx, dz), edge(dx, dz))) {
                BotClient.LOGGER.info("[bot] этаж {}: не прошёл на {},{}", k + 1, dx, dz);
                return stop(false, false);
            }
            path.add(new int[]{dx, dz});
            return true;
        }

        boolean line(int fx, int fz, int tx, int tz, boolean work) {
            int x = fx, z = fz;
            int sx = Integer.signum(tx - fx), sz = Integer.signum(tz - fz);
            while ((x != tx || z != tz) && !blocked) {
                int nx = x + sx, nz = z + sz;
                if (!step(nx, nz, x, z)) return false;
                x = nx; z = nz;
                if (work) work(x, z, sz);
                // a full bag matters only while farming (building empties the bag)
                if (mode == Mode.TEND && Ctl.freeSlots() < 2) return stop(true, false);
            }
            return !blocked;
        }

        static boolean crop(String n) { return n.equals("sweet_berry_bush") || n.startsWith("bamboo"); }

        /** The cells on both sides of the lane at row z (we came from z - dirZ), then plants and torches. */
        void work(int c, int z, int dirZ) {
            if (mode == Mode.BUILD) {
                // a tree in the farm: its leaves and trunk between this floor and the next go (the plants need
                // the room, and they are in the way of the clicks)
                for (int d = -2; d <= 2; d++) {
                    int x = c + d;
                    if (x < 0 || x >= s.W) continue;
                    for (int up = 1; up < s.gap; up++) {
                        BlockPos q = floor(x, z).up(up);
                        String n = Ctl.name(q);
                        if (foreign(n) && !crop(n) && Ctl.reach(q) < 4.4) Ctl.mine(q);
                    }
                }
            }
            for (int d : new int[]{-1, 1, -2, 2}) {
                int x = c + d;
                if (x < 0 || x >= s.W) continue;
                noMaterial = false;
                BlockPos ref = dirZ != 0 ? floor(x, z - dirZ) : null;
                boolean ok = placeFloor(x, z, ref, null);
                if (!ok && mode == Mode.BUILD && noMaterial && s.isRow(x, z)) { stop(false, true); return; }
            }
            for (int d = -2; d <= 2; d++) {
                int x = c + d;
                if (x < 0 || x >= s.W) continue;
                BlockPos top = floor(x, z).up();
                if (!Ctl.solid(top.down())) continue;
                String here = Ctl.name(top);
                if (s.isRow(x, z)) {
                    if (mode != Mode.TEND) continue;
                    if (plant.equals("bamboo")) {
                        String up = Ctl.name(top.up());
                        if (here.equals("bamboo") && up.equals("bamboo")) {
                            // cut above the first piece: the plant grows back by itself
                            if (Ctl.mine(top.up())) r.harvested++;
                        } else if (air(here) && Ctl.count("bamboo") > 0) {
                            if (Ctl.place(top, "bamboo", top.down())) r.planted++;
                        }
                    } else {
                        if (here.equals("sweet_berry_bush")) {
                            int age = Ctl.direct(() -> {
                                BlockState st = Ctl.world().getBlockState(top);
                                return st.contains(Properties.AGE_3) ? st.get(Properties.AGE_3) : 0;
                            });
                            if (age >= 2) { Ctl.use(top); Ctl.ticks(2); r.harvested++; }
                        } else if (air(here) && Ctl.count("sweet_berries") > 0) {
                            if (Ctl.place(top, "sweet_berries", top.down())) r.planted++;
                        }
                    }
                } else if (s.isTorch(x, z) && air(here) && Ctl.count("torch") > 0) {
                    Ctl.place(top, "torch", top.down());
                }
            }
        }

        void run() {
            BlockPos col = s.shaft(f);
            int entryDz = col.getZ() - s.z;
            BlockPos colTop = new BlockPos(col.getX(), L, col.getZ());
            noMaterial = false;
            clearWay(0, entryDz);
            if (!placeFloor(0, entryDz, colTop, Direction.EAST)) {
                if (mode == Mode.TEND) r.hole = true;
                stop(false, noMaterial);
                Ctl.stepTo(new BlockPos(col.getX(), L + 1, col.getZ()), true);   // back to the middle of the column
                return;
            }
            if (!Ctl.stepTo(cell(0, entryDz), true)) { stop(false, false); return; }
            path.add(new int[]{0, entryDz});
            List<Integer> lanes = lanes(s.W);
            int from = Math.min(startLane, lanes.size() - 1);
            int x = 0, z = entryDz;
            int zStart = from % 2 == 0 ? 0 : s.L - 1;
            if (line(x, z, 0, zStart, false)) z = zStart;
            for (int li = from; li < lanes.size() && !blocked; li++) {
                int c = lanes.get(li);
                r.lane = li;
                // along the end line two cells past the lane and back: the end-line cells beside the lane are
                // then built by walking (they have no built neighbour behind them to click)
                int ext = Math.min(c + 2, s.W - 1);
                if (!line(x, z, ext, z, false)) break;
                x = ext;
                if (!line(x, z, c, z, false)) break;
                x = c;
                work(c, z, 0);
                if (blocked) break;
                int zEnd = z == 0 ? s.L - 1 : 0;
                if (!line(c, z, c, zEnd, true)) break;
                z = zEnd;
                if (li == lanes.size() - 1) r.finished = true;
            }
            // back to the column: the short way along the walkways when the floor is whole,
            // otherwise along our own steps (we know they hold)
            boolean home = r.finished && walkHome(s, f);
            if (!home) {
                for (int i = path.size() - 2; i >= 0; i--) {
                    int[] p = path.get(i);
                    if (!Ctl.stepTo(cell(p[0], p[1]), true)) break;
                }
                Ctl.stepTo(new BlockPos(col.getX(), L + 1, col.getZ()), true);
                if (!onColumn(col)) walkHome(s, f);
            }
        }
    }

    public static boolean floorDone(Site s, int f, int k) {
        int L = s.floorY(k);
        return Ctl.direct(() -> {
            for (int dx = 0; dx < s.W; dx++) for (int dz = 0; dz < s.L; dz++) {
                String n = Ctl.blockName(Ctl.world().getBlockState(new BlockPos(s.farmX(f) + dx, L, s.z + dz)));
                if (!(s.isRow(dx, dz) ? SOIL : WALK).matcher(n).matches()) return false;
            }
            return true;
        });
    }

    /** Where the last trip stopped because of a full bag / no blocks: the next one goes on from there. */
    static int[] resume;   // {farm, k, lane, mode}

    /** One trip up the column: the given floors from the bottom up, then down again. */
    public static Result trip(Site s, int f, List<Integer> floors, Mode mode) {
        Result total = new Result();
        if (!toShaftBottom(s, f)) { total.stuck = true; shaftFails++; return total; }
        shaftFails = 0;
        List<Integer> order = new ArrayList<>(floors);
        order.sort(Integer::compare);
        int[] r = resume != null && resume[0] == f && resume[3] == mode.ordinal() && order.contains(resume[1]) ? resume : null;
        if (r != null) {
            // from the floor where we stopped up; the floors below come on the next trip (we only climb up)
            List<Integer> o2 = new ArrayList<>();
            for (int k : order) if (k >= r[1]) o2.add(k);
            order = o2;
        }
        for (int k : order) {
            Bot.INSTANCE.stage((mode == Mode.BUILD ? "Строю этаж " : "Фармлю этаж ") + (k + 1));
            if (!climb(s, f, k)) { total.stuck = true; break; }
            Pass p = new Pass(s, f, k, mode);
            if (r != null && r[1] == k) p.startLane = r[2];
            p.run();
            total.harvested += p.r.harvested;
            total.planted += p.r.planted;
            if (mode == Mode.BUILD && floorDone(s, f, k)) State.get().markBuilt(f, k);
            // a hole that could not be mended while farming: the floor is built again (with a bag of blocks)
            if (mode == Mode.TEND && p.r.hole) State.get().unmarkBuilt(f, k);
            if (p.r.finished) { if (resume != null && resume[1] == k) resume = null; }
            else if (p.r.full || p.r.noBlocks) resume = new int[]{f, k, p.r.lane, mode.ordinal()};
            if (p.r.full) total.full = true;
            if (p.r.noBlocks) { total.noBlocks = true; break; }
            if (p.r.full) break;
            if (p.r.stuck) {
                total.stuck = true;
                if (!onColumn(s.shaft(f))) break;   // could not get back to the column: no higher floors now
            }
        }
        descend(s, f);
        return total;
    }

    static Vec3d center(Site s) { return new Vec3d(s.x + s.W / 2.0, s.y + 1, s.z + s.L / 2.0); }
}
