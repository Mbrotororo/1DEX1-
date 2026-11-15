package ru.onedex.bot.farm;

import net.minecraft.block.BlockState;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.math.BlockPos;
import ru.onedex.bot.bot.Ctl;
import ru.onedex.bot.config.BotConfig;

import java.util.ArrayList;
import java.util.List;

/**
 * The place: the berries farm where /home g is, the bamboo farm east of it, the storage (a row of double
 * chests) along the west side and the columns the bot climbs.
 *
 *   west                                                    east
 *   storage x-4 | . . | column x-1 | FARM 0 | spacing (30) | column | FARM 1
 *
 * Floor 0 of each farm is its ground, dug level (y = the ground under /home g for the berries farm, the
 * ground where the bamboo farm goes for that one); the next floors are `gap` above (2 blocks of air).
 */
public final class Site {
    public int x, y, z, W, L, F, gap, first;
    public int spacing = 30;
    /** Ground level of the bamboo farm (found when it is first built). */
    public Integer y1;

    public static Site around(BlockPos home, int groundY) {
        BotConfig c = BotConfig.get();
        Site s = new Site();
        s.W = c.farmWidth; s.L = c.farmLength; s.F = c.floors; s.gap = c.floorGap; s.first = c.firstFloorHeight;
        s.spacing = c.farmSpacing;
        s.x = home.getX() - s.W / 2;
        s.z = home.getZ() - s.L / 2;
        s.y = groundY;
        return s;
    }

    public int farmX(int f) { return x + f * (W + spacing); }
    public String plant(int f) { return f == 0 ? "sweet_berries" : "bamboo"; }
    /** Ground level of farm f. */
    public int base(int f) { return f == 0 || y1 == null ? y : y1; }
    public int floorY(int f, int k) { return base(f) + first + k * gap; }
    /** The highest ground of both farms: everything near them is looked for from well above it. */
    public int top() { return Math.max(y, y1 == null ? y : y1); }
    /** Which farm the x of a place belongs to. */
    public int farmAt(int px) { return px >= farmX(1) - 3 ? 1 : 0; }

    public boolean isRow(int dx, int dz) { return dx % 2 == 1 && dz > 0 && dz < L - 1; }
    /** 4 x 6 grid: light for the plants everywhere and no dark spot for monsters. */
    public boolean isTorch(int dx, int dz) { return dx % 4 == 0 && dz % 6 == 3 && dz < L - 1; }

    public BlockPos shaft(int f) { return new BlockPos(farmX(f) - 1, 0, z + 1); }

    /** Storage: pairs of chests along the west side of the berries farm (one free block between pairs). */
    public List<BlockPos> storageSpots(int pairs) {
        List<BlockPos> out = new ArrayList<>();
        for (int j = 0; j + 1 < L && out.size() < pairs * 2; j += 3) {
            out.add(new BlockPos(x - 4, 0, z + j));
            out.add(new BlockPos(x - 4, 0, z + j + 1));
        }
        return out;
    }

    /** Our whole area: no digging for dirt in here. */
    public boolean inZone(BlockPos p, int margin) {
        return p.getX() >= x - 7 - margin && p.getX() <= farmX(1) + W + 1 + margin &&
                p.getZ() >= z - 2 - margin && p.getZ() <= z + L + 1 + margin;
    }

    public boolean inFarm(int f, BlockPos p, int margin) {
        return p.getX() >= farmX(f) - margin && p.getX() < farmX(f) + W + margin &&
                p.getZ() >= z - margin && p.getZ() < z + L + margin;
    }

    /** The real ground (first solid terrain block from just above the highest ground down). Game thread. */
    public static int groundNow(ClientWorld w, int x, int z, int fromY) {
        for (int y = fromY; y > fromY - 30; y--) {
            BlockPos p = new BlockPos(x, y, z);
            BlockState s = w.getBlockState(p);
            String n = Ctl.blockName(s);
            if (n.contains("leaves") || n.contains("log") || n.contains("chest") || n.contains("torch") || n.contains("bush") ||
                    n.contains("fence") || n.contains("crafting") || n.contains("furnace") || n.contains("bamboo")) continue;
            if (s.isFullCube(w, p)) return y;
        }
        return fromY - 30;
    }

    /** The surface near the farms (looked for from above the ground of both farms: a hill there counts). */
    public int ground(int gx, int gz) { return Ctl.direct(() -> groundNow(Ctl.world(), gx, gz, top() + 16)); }
    public BlockPos onGround(BlockPos p) { return new BlockPos(p.getX(), ground(p.getX(), p.getZ()) + 1, p.getZ()); }
}
