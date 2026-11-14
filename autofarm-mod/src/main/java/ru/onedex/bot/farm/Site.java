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
 *   west                                            east
 *   storage x-4 | . . | columns x-1 | FARM 0 | 8 free | FARM 1
 */
public final class Site {
    public int x, y, z, W, L, F, gap, first;

    public static Site around(BlockPos home, int groundY) {
        BotConfig c = BotConfig.get();
        Site s = new Site();
        s.W = c.farmWidth; s.L = c.farmLength; s.F = c.floors; s.gap = c.floorGap; s.first = c.firstFloorHeight;
        s.x = home.getX() - s.W / 2;
        s.z = home.getZ() - s.L / 2;
        s.y = groundY;
        return s;
    }

    public int farmX(int f) { return x + f * (W + 8); }
    public String plant(int f) { return f == 0 ? "sweet_berries" : "bamboo"; }
    public int floorY(int k) { return y + first + k * gap; }

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
                p.getZ() >= z - 2 - margin && p.getZ() <= z + L + 1 + margin && p.getY() >= y - 3;
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

    public int ground(int gx, int gz) { return Ctl.call(() -> groundNow(Ctl.world(), gx, gz, y + 1)); }
    public BlockPos onGround(BlockPos p) { return new BlockPos(p.getX(), ground(p.getX(), p.getZ()) + 1, p.getZ()); }
}
