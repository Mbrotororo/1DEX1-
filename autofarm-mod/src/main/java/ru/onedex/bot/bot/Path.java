package ru.onedex.bot.bot;

import net.minecraft.block.BlockState;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

/**
 * A* over the blocks you can stand on: walk to the 8 neighbours, one block up with a jump, down a drop of up
 * to 3. Never through water, lava, fire, berry bushes or cactus. Runs on the game thread.
 */
public final class Path {
    private Path() {}

    private record Node(BlockPos pos, double g, double f, Node parent) {}

    private static boolean bad(String n) {
        return n.contains("lava") || n.contains("fire") || n.equals("sweet_berry_bush") || n.equals("cactus") ||
                n.equals("magma_block") || n.equals("powder_snow") || n.equals("cobweb");
    }

    private static boolean passable(ClientWorld w, BlockPos p) {
        BlockState s = w.getBlockState(p);
        if (!s.getFluidState().isEmpty()) return false;
        if (bad(Ctl.blockName(s))) return false;
        return s.getCollisionShape(w, p).isEmpty();
    }

    private static boolean floor(ClientWorld w, BlockPos p) {
        BlockState s = w.getBlockState(p);
        if (bad(Ctl.blockName(s))) return false;
        if (!s.getFluidState().isEmpty()) return false;
        var shape = s.getCollisionShape(w, p);
        return !shape.isEmpty() && shape.getMax(Direction.Axis.Y) >= 0.5;
    }

    static boolean standable(ClientWorld w, BlockPos p) {
        return passable(w, p) && passable(w, p.up()) && floor(w, p.down());
    }

    private static final int[][] DIRS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    /** Path of feet positions from start to a cell within `range` of goal, or null. */
    public static List<BlockPos> find(ClientWorld w, BlockPos start, BlockPos goal, double range, int maxNodes) {
        if (!standable(w, start)) {
            // standing on a slab / in a plant: try the cell above
            if (standable(w, start.up())) start = start.up();
        }
        PriorityQueue<Node> open = new PriorityQueue<>((a, b) -> Double.compare(a.f, b.f));
        Map<BlockPos, Double> best = new HashMap<>();
        open.add(new Node(start, 0, h(start, goal), null));
        best.put(start, 0.0);
        Node closest = null;
        double closestH = Double.MAX_VALUE;
        int n = 0;
        while (!open.isEmpty() && n++ < maxNodes) {
            Node cur = open.poll();
            double hh = h(cur.pos, goal);
            if (hh < closestH) { closestH = hh; closest = cur; }
            if (Math.sqrt(cur.pos.getSquaredDistance(goal)) <= range) return build(cur);
            for (int[] d : DIRS) {
                boolean diag = d[0] != 0 && d[1] != 0;
                BlockPos side = cur.pos.add(d[0], 0, d[1]);
                if (diag) {
                    // no corner cutting
                    BlockPos a = cur.pos.add(d[0], 0, 0), b = cur.pos.add(0, 0, d[1]);
                    if (!passable(w, a) || !passable(w, a.up()) || !passable(w, b) || !passable(w, b.up())) continue;
                }
                if (!w.isChunkLoaded(side.getX() >> 4, side.getZ() >> 4)) continue;
                double step = diag ? 1.414 : 1.0;
                // same level
                if (standable(w, side)) { push(open, best, cur, side, step, goal); continue; }
                // one up (jump): room above our head too
                BlockPos up = side.up();
                if (!diag && passable(w, cur.pos.up(2)) && standable(w, up)) { push(open, best, cur, up, step + 0.6, goal); continue; }
                // drop down (up to 3)
                if (passable(w, side) && passable(w, side.up())) {
                    for (int k = 1; k <= 3; k++) {
                        BlockPos dn = side.down(k);
                        if (!passable(w, dn)) break;
                        if (standable(w, dn)) { push(open, best, cur, dn, step + 0.3 * k, goal); break; }
                    }
                }
            }
        }
        // could not reach: go as close as we can (useful for far targets in loaded chunks)
        return closest != null && closest.parent != null ? build(closest) : null;
    }

    private static void push(PriorityQueue<Node> open, Map<BlockPos, Double> best, Node cur, BlockPos p, double cost, BlockPos goal) {
        double g = cur.g + cost;
        Double old = best.get(p);
        if (old != null && old <= g) return;
        best.put(p, g);
        open.add(new Node(p, g, g + h(p, goal), cur));
    }

    private static double h(BlockPos a, BlockPos b) {
        double dx = a.getX() - b.getX(), dy = a.getY() - b.getY(), dz = a.getZ() - b.getZ();
        return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy) * 0.5;
    }

    private static List<BlockPos> build(Node n) {
        List<BlockPos> out = new ArrayList<>();
        for (Node c = n; c != null; c = c.parent) out.add(c.pos);
        Collections.reverse(out);
        return out;
    }
}
