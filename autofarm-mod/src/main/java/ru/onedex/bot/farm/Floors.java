package ru.onedex.bot.farm;

import net.minecraft.block.BlockState;
import net.minecraft.state.property.Properties;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.bot.Ctl;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Up a column, walking the floors, down again.
 * The bot walks the walkways in straight lines one cell at a time (sneaking at the edges, so it never falls),
 * builds the floor under each cell (builder) or plants and harvests the rows on both sides (farmer).
 */
public final class Floors {
    private Floors() {}

    static final Pattern SOIL = Pattern.compile("^(dirt|grass_block|coarse_dirt|podzol|rooted_dirt|moss_block)$");
    static final Pattern WALK = Pattern.compile("^(dirt|grass_block|coarse_dirt|podzol|rooted_dirt|moss_block|cobblestone|cobbled_deepslate|stone|deepslate)$");

    public static int blocks() { return Ctl.count("dirt") + Ctl.count("cobblestone"); }

    static boolean floorOk(Site s, int f, int dx, int dz, int y) {
        String n = Ctl.name(new BlockPos(s.farmX(f) + dx, y, s.z + dz));
        return (s.isRow(dx, dz) ? SOIL : WALK).matcher(n).matches();
    }

    /** Solid but not ours (a bamboo stalk, leaves, a log) or a plant in the way. */
    static boolean foreign(String n) {
        if (n.equals("air") || n.equals("cave_air") || n.contains("torch") || n.equals("water")) return false;
        return !WALK.matcher(n).matches();
    }

    // ------------------------------------------------------------------ the column
    static boolean onColumn(BlockPos s) {
        BlockPos f = Ctl.feet();
        return f.getX() == s.getX() && f.getZ() == s.getZ();
    }

    /** Ground of a column = lowest ground in the free strip next to it (nothing is built or dug there). */
    static int colBase(Site s, int f) {
        BlockPos c = s.shaft(f);
        int a = s.ground(c.getX() - 1, c.getZ()), b = s.ground(c.getX() - 1, c.getZ() - 1), d = s.ground(c.getX() - 1, c.getZ() + 1);
        return Math.min(a, Math.min(b, d));
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
                    if (!n.equals("air") && !n.equals("cave_air") && !n.contains("chest") && !n.contains("torch")) Ctl.mine(p);
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

    static boolean climb(Site s, int f, int k) {
        int target = s.floorY(k) + 1;
        if (!onColumn(s.shaft(f))) return false;
        int guard = 0;
        while (Ctl.feet().getY() < target && guard++ < 120) {
            BlockPos head = Ctl.feet().up(2);
            if (Ctl.solid(head) && !Ctl.mine(head)) return false;
            String mat = Ctl.count("dirt") > 0 ? "dirt" : (Ctl.count("cobblestone") > 0 ? "cobblestone" : null);
            if (mat == null) return false;
            boolean up = false;
            for (int t = 0; t < 8 && !up; t++) { up = Ctl.pillarUp(mat); if (!up) Ctl.ticks(5 + t * 2); }
            if (!up) return false;
        }
        return Ctl.feet().getY() >= target;
    }

    static boolean walkHome(Site s, int f) {
        BlockPos c = s.shaft(f);
        BlockPos p = Ctl.feet();
        int y = p.getY();
        int[] d = {p.getX() - s.farmX(f), p.getZ() - s.z};
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
        Ctl.stepTo(new BlockPos(c.getX(), y, c.getZ()), true);
        return onColumn(c);
    }

    static void descend(Site s, int f) {
        BlockPos c = s.shaft(f);
        if (!onColumn(c)) walkHome(s, f);
        boolean onCol = onColumn(c);
        if (!onCol) BotClient.LOGGER.info("[bot] не дошёл до столба, спускаюсь прямо вниз");
        BlockPos p0 = Ctl.feet();
        int stopY = onCol ? colBase(s, f) + 1 : s.ground(p0.getX(), p0.getZ()) + 1;
        int guard = 0;
        while (Ctl.feet().getY() > stopY && guard++ < 120) {
            BlockPos p = Ctl.feet();
            if (!onColumn(c) && s.isRow(p.getX() - s.farmX(f), p.getZ() - s.z)) Ctl.stepTo(p.add(-1, 0, 0), true);
            if (!Ctl.digDown()) break;
        }
    }

    /** If we are up on a farm (after a restart), get down by the column. */
    public static void toGround(Site s) {
        BlockPos p = Ctl.feet();
        if (p.getY() <= s.y + 2 || !s.inZone(p, 0)) return;
        int f = p.getX() >= s.farmX(1) - 2 ? 1 : 0;
        Bot.INSTANCE.stage("Спускаюсь");
        descend(s, f);
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
        public boolean finished, full, noBlocks, stuck;
        public int lane;
    }

    static final class Pass {
        final Site s; final int f, k, L; final Mode mode; final String plant;
        final List<int[]> path = new ArrayList<>();
        final Result r = new Result();
        boolean blocked;
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

        boolean placeFloor(int dx, int dz, int refDx, int refDz) {
            if (floorOk(s, f, dx, dz, L)) return true;
            BlockPos p = floor(dx, dz);
            String n = Ctl.name(p);
            if (foreign(n)) Ctl.mine(p);
            if (mode != Mode.BUILD && Ctl.count("dirt") < 24) return Ctl.solid(p);
            String mat = material(dx, dz);
            if (mat == null) return false;
            return Ctl.place(p, mat, floor(refDx, refDz)) || Ctl.placeAny(p, mat);
        }

        void clearWay(int dx, int dz) {
            for (int up = 1; up <= 2; up++) {
                BlockPos p = floor(dx, dz).up(up);
                if (foreign(Ctl.name(p))) Ctl.mine(p);
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
            if (!placeFloor(dx, dz, fx, fz)) return stop(false, mode == Mode.BUILD);
            clearWay(dx, dz);
            if (!Ctl.stepTo(cell(dx, dz), edge(dx, dz))) return stop(false, false);
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
                if (work) work(x, z);
                if (Ctl.freeSlots() < 2) return stop(true, false);
            }
            return !blocked;
        }

        void work(int c, int z) {
            for (int d : new int[]{-1, 1, -2, 2}) {
                int x = c + d;
                if (x < 0 || x >= s.W) continue;
                placeFloor(x, z, c + Integer.signum(d) * (Math.abs(d) - 1), z);
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
                        } else if ((here.equals("air")) && Ctl.count("bamboo") > 0) {
                            if (Ctl.place(top, "bamboo", top.down())) r.planted++;
                        }
                    } else {
                        if (here.equals("sweet_berry_bush")) {
                            int age = Ctl.direct(() -> {
                                BlockState st = Ctl.world().getBlockState(top);
                                return st.contains(Properties.AGE_3) ? st.get(Properties.AGE_3) : 0;
                            });
                            if (age >= 2) { Ctl.use(top); Ctl.ticks(2); r.harvested++; }
                        } else if (here.equals("air") && Ctl.count("sweet_berries") > 0) {
                            if (Ctl.place(top, "sweet_berries", top.down())) r.planted++;
                        }
                    }
                } else if (s.isTorch(x, z) && here.equals("air") && Ctl.count("torch") > 0) {
                    Ctl.place(top, "torch", top.down());
                }
            }
        }

        void run() {
            BlockPos col = s.shaft(f);
            int entryDz = col.getZ() - s.z;
            BlockPos entry = floor(0, entryDz);
            if (!Ctl.solid(entry)) {
                if (mode != Mode.BUILD) { stop(false, false); return; }
                String mat = material(0, entryDz);
                if (mat == null || !Ctl.place(entry, mat, new BlockPos(col.getX(), L, col.getZ()))) { stop(false, true); return; }
            }
            if (!Ctl.stepTo(cell(0, entryDz), true)) { stop(false, false); return; }
            path.add(new int[]{0, entryDz});
            List<Integer> lanes = lanes(s.W);
            int from = Math.min(startLane, lanes.size() - 1);
            int x = 0, z = entryDz;
            int zStart = from % 2 == 0 ? 0 : s.L - 1;
            if (line(x, z, 0, zStart, false)) z = zStart;
            for (int li = from; li < lanes.size(); li++) {
                int c = lanes.get(li);
                r.lane = li;
                if (blocked) break;
                if (!line(x, z, c, z, false)) break;
                x = c;
                work(c, z);
                int zEnd = z == 0 ? s.L - 1 : 0;
                if (!line(c, z, c, zEnd, true)) break;
                z = zEnd;
                if (li == lanes.size() - 1) r.finished = true;
            }
            // back along our own steps to the column
            for (int i = path.size() - 2; i >= 0; i--) {
                int[] p = path.get(i);
                if (!Ctl.stepTo(cell(p[0], p[1]), true)) break;
            }
            Ctl.stepTo(new BlockPos(col.getX(), L + 1, col.getZ()), true);
            if (!onColumn(col)) walkHome(s, f);
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
        if (!toShaftBottom(s, f)) { total.stuck = true; return total; }
        List<Integer> order = new ArrayList<>(floors);
        order.sort(Integer::compare);
        int[] r = resume != null && resume[0] == f && resume[3] == mode.ordinal() && order.contains(resume[1]) ? resume : null;
        if (r != null) {
            List<Integer> o2 = new ArrayList<>();
            for (int k : order) if (k >= r[1]) o2.add(k);
            for (int k : order) if (k < r[1]) o2.add(k);
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
            if (p.r.finished) { if (resume != null && resume[1] == k) resume = null; }
            else if (p.r.full || p.r.noBlocks) resume = new int[]{f, k, p.r.lane, mode.ordinal()};
            if (p.r.full) total.full = true;
            if (p.r.noBlocks) { total.noBlocks = true; break; }
            if (p.r.full || p.r.stuck) break;
        }
        descend(s, f);
        return total;
    }

    static Vec3d center(Site s) { return new Vec3d(s.x + s.W / 2.0, s.y + 1, s.z + s.L / 2.0); }
}
