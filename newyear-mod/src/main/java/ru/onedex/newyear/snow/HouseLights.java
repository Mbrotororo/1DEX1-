package ru.onedex.newyear.snow;

import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.block.BlockState;
import net.minecraft.block.LeavesBlock;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.WorldRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.world.Heightmap;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.music.MusicFx;
import ru.onedex.newyear.render.Garland;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Light chains along the roof edges of buildings around the player: a green wire that sags a little
 * between the corners of every block, colored bulbs on it and a soft glow around every lit bulb.
 * Only built blocks get lights (planks, stairs, bricks, ...), not hills or trees.
 */
public final class HouseLights {
    private HouseLights() {}

    private static final Identifier DECOR = Identifier.of("dexnewyear", "textures/entity/decor.png");
    private static final Identifier GLOW = Identifier.of("dexnewyear", "textures/entity/glow.png");
    private static final int[] WARM = {0xFFFFD89A, 0xFFFFC870, 0xFFFFE2B0};
    private static final int[] ICY = {0xFFD8F1FF, 0xFF7FC8FF, 0xFFAEE0FF};
    private static final int WIRE = 0xFF1F3B26;
    private static final int MAX_SEGMENTS = 1400;

    /** One block edge: the wire goes from A to B, {@code ox/oz} point away from the wall. */
    private record Seg(float ax, float ay, float az, float bx, float by, float bz, float ox, float oz,
                       float sag, int index, int light) {
    }

    private static List<Seg> segs = new ArrayList<>();

    public static void clear() {
        segs = new ArrayList<>();
    }

    private static int hash(int x, int y, int z) {
        int h = x * 73856093 ^ y * 19349663 ^ z * 83492791;
        h ^= h >>> 13;
        h *= 0x5bd1e995;
        return h ^ (h >>> 15);
    }

    /** Blocks that look like part of a house. Natural ground, plants and tree parts never get lights. */
    private static boolean built(BlockState s) {
        if (s.isAir() || !s.getFluidState().isEmpty()) return false;
        if (s.getBlock() instanceof LeavesBlock) return false;
        if (s.isIn(BlockTags.DIRT) || s.isIn(BlockTags.SAND) || s.isIn(BlockTags.BASE_STONE_OVERWORLD)
                || s.isIn(BlockTags.ICE) || s.isIn(BlockTags.SNOW) || s.isIn(BlockTags.LOGS)
                || s.isIn(BlockTags.TERRACOTTA) || s.isIn(BlockTags.CORAL_BLOCKS)) return false;
        String path = net.minecraft.registry.Registries.BLOCK.getId(s.getBlock()).getPath();
        return !(path.endsWith("_ore") || path.equals("gravel") || path.equals("clay") || path.equals("mycelium")
                || path.equals("podzol") || path.equals("obsidian") || path.equals("bedrock") || path.contains("mushroom_block")
                || path.equals("magma_block") || path.equals("sandstone") || path.equals("red_sandstone")
                || path.equals("snow_block") || path.equals("moss_block") || path.equals("mud"));
    }

    public static void rebuild(ClientWorld w, int cx, int cy, int cz) {
        // 1) every free bottom edge of a built top block: face -> (line, along) -> attach height
        record Key(int dir, int line, int along) {
        }
        record Edge(int x, int z, float y, int light) {
        }
        Map<Key, Edge> edges = new HashMap<>();
        BlockPos.Mutable p = new BlockPos.Mutable();
        int r = 24;
        for (int x = cx - r; x <= cx + r; x++) {
            for (int z = cz - r; z <= cz + r; z++) {
                if (!w.getChunkManager().isChunkLoaded(x >> 4, z >> 4)) continue;
                int top = w.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, x, z) - 1;
                if (top < cy - 20 || top > cy + 28) continue;
                p.set(x, top, z);
                BlockState s = w.getBlockState(p);
                if (!built(s)) continue;
                VoxelShape shape = s.getCollisionShape(w, p);
                if (shape.isEmpty()) continue;
                Box b = shape.getBoundingBox();
                if (b.minX > 0.01 || b.maxX < 0.99 || b.minZ > 0.01 || b.maxZ < 0.99) continue; // fences, walls, panes
                for (Direction d : Direction.Type.HORIZONTAL) {
                    BlockPos side = p.offset(d);
                    // a real eave: air next to the block and at least 2 blocks of air under that
                    if (!w.getBlockState(side).isAir() || !w.getBlockState(side.down()).isAir() || !w.getBlockState(side.down(2)).isAir()) continue;
                    int line = d.getAxis() == Direction.Axis.X ? x : z;
                    int along = d.getAxis() == Direction.Axis.X ? z : x;
                    edges.put(new Key(d.ordinal(), line, along), new Edge(x, z, top + (float) b.minY, WorldRenderer.getLightmapCoordinates(w, side)));
                }
            }
        }
        // 2) wire segments; neighbours one step up or down share a corner (lights follow a stair roof)
        List<Seg> out = new ArrayList<>();
        for (Map.Entry<Key, Edge> en : edges.entrySet()) {
            if (out.size() >= MAX_SEGMENTS) break;
            Key k = en.getKey();
            Edge e = en.getValue();
            Direction d = Direction.values()[k.dir()];
            Edge prev = edges.get(new Key(k.dir(), k.line(), k.along() - 1));
            Edge next = edges.get(new Key(k.dir(), k.line(), k.along() + 1));
            float y0 = prev != null && Math.abs(prev.y() - e.y()) <= 1.01f ? (prev.y() + e.y()) / 2f : e.y();
            float y1 = next != null && Math.abs(next.y() - e.y()) <= 1.01f ? (next.y() + e.y()) / 2f : e.y();
            float ox = d.getOffsetX(), oz = d.getOffsetZ();
            // the outer face of the block, a hair outside so the wire never hides in the wall
            float fx = e.x() + 0.5f + ox * 0.53f, fz = e.z() + 0.5f + oz * 0.53f;
            float ax, az, bx, bz;
            if (d.getAxis() == Direction.Axis.X) {
                ax = fx; bx = fx;
                az = e.z(); bz = e.z() + 1;
            } else {
                az = fz; bz = fz;
                ax = e.x(); bx = e.x() + 1;
            }
            float sag = 0.07f + ((hash(e.x(), (int) e.y(), e.z()) >>> 8) & 255) / 255f * 0.05f;
            int index = k.along() * 2 + (k.line() & 1) * 5 + k.dir() * 3;
            out.add(new Seg(ax, y0 - 0.02f, az, bx, y1 - 0.02f, bz, ox, oz, sag, index, e.light()));
        }
        segs = out;
    }

    // ------------------------------------------------------------------ render

    private static int[] palette(NyConfig c) {
        return switch (c.lightsColors) {
            case 1 -> WARM;
            case 2 -> ICY;
            default -> Garland.COLORS;
        };
    }

    /** Brightness 0..1 of bulb number {@code i}. */
    private static float level(NyConfig c, int i, long ms) {
        long beat = MusicFx.garlandStep();
        switch (c.lightsMode) {
            case 1: { // running lights
                long step = beat >= 0 ? beat * 2 : ms / 110;
                long ph = Math.floorMod(i - step, 6);
                return ph == 0 ? 1f : ph == 1 ? 0.55f : 0.12f;
            }
            case 2: { // slow shimmer
                double t = beat >= 0 ? beat * 0.9 : ms / 1000.0 * 1.6;
                return 0.35f + 0.65f * (float) (0.5 + 0.5 * Math.sin(t + i * 0.55));
            }
            default: { // classic blinking
                long step = beat >= 0 ? beat : ms / 480;
                return Math.floorMod(step + i, 3) != 0 ? 1f : 0.1f;
            }
        }
    }

    public static void render(WorldRenderContext ctx) {
        if (segs.isEmpty()) return;
        NyConfig c = NyConfig.INSTANCE;
        MinecraftClient mc = MinecraftClient.getInstance();
        Vec3d cam = mc.gameRenderer.getCamera().getCameraPos();
        Quaternionf rot = mc.gameRenderer.getCamera().getRotation();
        MatrixStack.Entry e = ctx.matrices().peek();
        float cx = (float) cam.x, cy = (float) cam.y, cz = (float) cam.z;
        int[] pal = palette(c);
        long ms = System.currentTimeMillis();
        float[] px = new float[7], py = new float[7], pz = new float[7];

        VertexConsumer vc = ctx.consumers().getBuffer(RenderLayers.entityCutoutNoCull(DECOR));
        int bulbs = 0;
        float[][] glow = new float[segs.size() * 2][];
        for (Seg s : segs) {
            // the wire: a sagging curve in 6 pieces
            for (int i = 0; i <= 6; i++) {
                float u = i / 6f;
                px[i] = s.ax + (s.bx - s.ax) * u - cx;
                pz[i] = s.az + (s.bz - s.az) * u - cz;
                py[i] = s.ay + (s.by - s.ay) * u - s.sag * 4 * u * (1 - u) - cy;
            }
            float th = 0.014f;
            for (int i = 0; i < 6; i++) {
                // vertical ribbon + ribbon that sticks out of the wall: visible from any angle
                quad(vc, e, px[i], py[i] + th, pz[i], px[i + 1], py[i + 1] + th, pz[i + 1], px[i + 1], py[i + 1] - th, pz[i + 1], px[i], py[i] - th, pz[i], WIRE, s.light);
                quad(vc, e, px[i] - s.ox * th, py[i], pz[i] - s.oz * th, px[i + 1] - s.ox * th, py[i + 1], pz[i + 1] - s.oz * th,
                        px[i + 1] + s.ox * th, py[i + 1], pz[i + 1] + s.oz * th, px[i] + s.ox * th, py[i], pz[i] + s.oz * th, WIRE, s.light);
            }
            // two bulbs per block
            for (int b = 0; b < 2; b++) {
                float u = b == 0 ? 0.25f : 0.75f;
                float bx = s.ax + (s.bx - s.ax) * u - cx + s.ox * 0.01f;
                float bz = s.az + (s.bz - s.az) * u - cz + s.oz * 0.01f;
                float by = s.ay + (s.by - s.ay) * u - s.sag * 4 * u * (1 - u) - cy;
                int idx = s.index + b;
                int col = pal[Math.floorMod(idx, pal.length)];
                float lv = level(c, idx, ms);
                int shown = mix(Garland.dim(col), col, lv);
                int light = lv > 0.3f ? 0xF000F0 : s.light;
                box(vc, e, bx, by - 0.035f, bz, 0.026f, 0.022f, 0xFF2A2A2A, s.light);  // socket
                box(vc, e, bx, by - 0.095f, bz, 0.042f, 0.058f, shown, light);         // bulb
                if (lv > 0.25f) glow[bulbs++] = new float[]{bx, by - 0.095f, bz, col, lv};
            }
        }
        if (bulbs == 0) return;
        VertexConsumer gv = ctx.consumers().getBuffer(RenderLayers.eyes(GLOW));
        Vector3f[] corner = {new Vector3f(), new Vector3f(), new Vector3f(), new Vector3f()};
        for (int i = 0; i < bulbs; i++) {
            float[] g = glow[i];
            int col = (int) g[3];
            float lv = g[4];
            float size = 0.26f + 0.16f * lv;
            int a = Math.round(150 * lv);
            int color = (a << 24) | (col & 0xFFFFFF);
            float[][] off = {{-1, -1}, {-1, 1}, {1, 1}, {1, -1}};
            for (int k = 0; k < 4; k++) {
                corner[k].set(off[k][0] * size, off[k][1] * size, 0).rotate(rot).add(g[0], g[1], g[2]);
            }
            // both windings: the glow layer culls back faces
            int[][] order = {{0, 1, 2, 3}, {3, 2, 1, 0}};
            float[][] uv = {{0, 1}, {0, 0}, {1, 0}, {1, 1}};
            for (int[] o : order) {
                for (int q : o) {
                    gv.vertex(e, corner[q].x, corner[q].y, corner[q].z).color(color).texture(uv[q][0], uv[q][1])
                            .overlay(OverlayTexture.DEFAULT_UV).light(0xF000F0).normal(e, 0, 1, 0);
                }
            }
        }
    }

    private static int mix(int a, int b, float t) {
        t = Math.max(0, Math.min(1, t));
        int r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
        int g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
        int bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    /** Axis-aligned box with half size {@code hw} (x/z) and {@code hh} (y). */
    private static void box(VertexConsumer vc, MatrixStack.Entry e, float x, float y, float z, float hw, float hh, int color, int light) {
        float x0 = x - hw, x1 = x + hw, y0 = y - hh, y1 = y + hh, z0 = z - hw, z1 = z + hw;
        int side = shade(color, 0.85f), bottom = shade(color, 0.7f);
        quad(vc, e, x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, color, light);
        quad(vc, e, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, bottom, light);
        quad(vc, e, x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, side, light);
        quad(vc, e, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, side, light);
        quad(vc, e, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, color, light);
        quad(vc, e, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, color, light);
    }

    private static int shade(int c, float f) {
        int r = Math.round(((c >> 16) & 255) * f), g = Math.round(((c >> 8) & 255) * f), b = Math.round((c & 255) * f);
        return (c & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    private static void quad(VertexConsumer vc, MatrixStack.Entry e,
                             float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz, int color, int light) {
        v(vc, e, ax, ay, az, 0, 0, color, light);
        v(vc, e, bx, by, bz, 1, 0, color, light);
        v(vc, e, cx, cy, cz, 1, 1, color, light);
        v(vc, e, dx, dy, dz, 0, 1, color, light);
    }

    private static void v(VertexConsumer vc, MatrixStack.Entry e, float x, float y, float z, float u, float v, int color, int light) {
        vc.vertex(e, x, y, z).color(color).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(light).normal(e, 0, 1, 0);
    }
}
