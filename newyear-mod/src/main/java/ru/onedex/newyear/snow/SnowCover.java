package ru.onedex.newyear.snow;

import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.block.BlockState;
import net.minecraft.block.LeavesBlock;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.WorldRenderer;
import net.minecraft.client.texture.SpriteAtlasTexture;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.Atlases;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import ru.onedex.newyear.config.NyConfig;

/**
 * Client-side snow cover: a smooth layer of snow on the ground around the player with big drifts
 * piled against walls and free-standing mounds. Purely visual (no collision, nothing sent to the server).
 */
public final class SnowCover {
    private SnowCover() {}

    private static final int R = 28;
    private static final int N = 2 * R + 1;
    private static final RenderLayer LAYER = RenderLayers.entityCutoutNoCull(SpriteAtlasTexture.BLOCK_ATLAS_TEXTURE);
    private static final Identifier SNOW_SPRITE = Identifier.ofVanilla("block/snow");
    public static final SoundEvent STEP = SoundEvent.of(Identifier.of("dexnewyear", "snow_step"));

    private static int centerX = Integer.MIN_VALUE, centerZ;
    private static final int[] base = new int[N * N];      // y of the snow bottom (top face of the ground)
    private static final float[] depth = new float[N * N]; // snow depth in blocks, 0 = none
    private static final int[] light = new int[N * N];
    /** 0 = natural ground, 1 = roof / built block, 2 = tree leaves */
    private static final byte[] kind = new byte[N * N];
    /** y of the block that carries the snow */
    private static final int[] support = new int[N * N];
    /** Columns whose ground differs by at most this many eighths count as one surface. */
    private static final int SAME = 2;

    private static boolean same(int a, int b) {
        return a != Integer.MIN_VALUE && b != Integer.MIN_VALUE && Math.abs(a - b) <= SAME;
    }
    private static long lastBuild = -1000;
    private static ClientWorld builtFor;
    private static int builtSize = -1;
    private static boolean built;

    private static int idx(int i, int j) {
        return i * N + j;
    }

    // ------------------------------------------------------------------ build

    public static void tick(MinecraftClient mc) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.snowCover || mc.world == null || mc.player == null) {
            built = false;
            return;
        }
        int px = mc.player.getBlockX(), pz = mc.player.getBlockZ();
        long t = mc.world.getTime();
        boolean moved = Math.abs(px - centerX) >= 4 || Math.abs(pz - centerZ) >= 4;
        int sizeKey = c.driftSize + (c.snowOnRoofs ? 10 : 0);
        if (mc.world != builtFor || builtSize != sizeKey || moved || t - lastBuild >= 40 || t < lastBuild) {
            build(mc.world, px, pz, c);
            lastBuild = t;
            builtFor = mc.world;
            builtSize = sizeKey;
            WinterDecor.rebuild(mc.world, c);
        }
    }

    private static void build(ClientWorld world, int cx, int cz, NyConfig c) {
        centerX = cx;
        centerZ = cz;
        BlockPos.Mutable p = new BlockPos.Mutable();
        // 1) ground level of every column (base is stored in half blocks: slabs hold snow too)
        boolean roofs = c.snowOnRoofs;
        Heightmap.Type hm = roofs ? Heightmap.Type.MOTION_BLOCKING : Heightmap.Type.MOTION_BLOCKING_NO_LEAVES;
        for (int i = 0; i < N; i++) {
            for (int j = 0; j < N; j++) {
                int x = cx + i - R, z = cz + j - R;
                int k = idx(i, j);
                base[k] = Integer.MIN_VALUE;
                depth[k] = 0;
                kind[k] = 0;
                if (!world.getChunkManager().isChunkLoaded(x >> 4, z >> 4)) continue;
                int top = world.getTopY(hm, x, z);
                if (top <= world.getBottomY()) continue;
                p.set(x, top - 1, z);
                BlockState ground = world.getBlockState(p);
                if (!ground.getFluidState().isEmpty()) continue;
                boolean leaves = ground.getBlock() instanceof LeavesBlock;
                if (leaves && !roofs) continue;
                // existing vanilla snow layers: our snow starts on top of them (no z-fighting)
                int extraLayers = 0;
                if (ground.isOf(net.minecraft.block.Blocks.SNOW)) {
                    extraLayers = ground.get(net.minecraft.block.SnowBlock.LAYERS);
                    top -= 1;
                    p.set(x, top - 1, z);
                    ground = world.getBlockState(p);
                    leaves = ground.getBlock() instanceof LeavesBlock;
                    if (leaves && !roofs) continue;
                }
                int eighths;
                if (leaves || ground.isSideSolidFullSquare(world, p, Direction.UP)) {
                    eighths = top * 8;
                } else {
                    if (!roofs) continue;
                    net.minecraft.util.shape.VoxelShape shape = ground.getCollisionShape(world, p);
                    if (shape.isEmpty()) continue;
                    net.minecraft.util.math.Box b = shape.getBoundingBox();
                    if (b.minX > 0.01 || b.maxX < 0.99 || b.minZ > 0.01 || b.maxZ < 0.99) continue; // fences, walls, ...
                    if (b.maxY > 1.01) continue;
                    eighths = (top - 1) * 8 + (int) Math.round(b.maxY * 8);
                }
                p.set(x, top, z);
                BlockState above = world.getBlockState(p);
                if (above.isOf(net.minecraft.block.Blocks.SNOW) && extraLayers == 0) {
                    extraLayers = above.get(net.minecraft.block.SnowBlock.LAYERS);
                } else if (extraLayers == 0 && !above.isAir() && !above.isReplaceable()) {
                    continue;
                }
                if (!above.getFluidState().isEmpty()) continue;
                base[k] = eighths + extraLayers;
                support[k] = top - 1;
                kind[k] = (byte) (leaves ? 2 : (natural(ground) ? 0 : 1));
                light[k] = WorldRenderer.getLightmapCoordinates(world, p);
            }
        }
        // 2) snow depth: thin layer + drifts against walls + mounds
        float size = switch (c.driftSize) {
            case 0 -> 0.55f;
            case 2 -> 1.6f;
            default -> 1.0f;
        };
        for (int i = 0; i < N; i++) {
            for (int j = 0; j < N; j++) {
                int k = idx(i, j);
                if (base[k] == Integer.MIN_VALUE) continue;
                int x = cx + i - R, z = cz + j - R;
                float d = 0.07f + 0.09f * fbm(x * 0.11f, z * 0.11f);
                // drift piled against higher neighbours (walls, houses, hills)
                float drift = 0;
                for (int di = -3; di <= 3; di++) {
                    for (int dj = -3; dj <= 3; dj++) {
                        if (di == 0 && dj == 0) continue;
                        int ii = i + di, jj = j + dj;
                        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
                        int nb = base[idx(ii, jj)];
                        float wall = (nb == Integer.MIN_VALUE ? wallAt(world, x + di, z + dj, (int) Math.floor(base[k] / 8f)) : (nb - base[k]) / 8f);
                        if (wall <= 0) continue;
                        float dist = (float) Math.sqrt(di * di + dj * dj);
                        if (dist > 3.2f) continue;
                        float f = Math.min(wall, 3) * 0.55f * (float) Math.pow(Math.max(0, 1f - (dist - 1f) / 2.8f), 1.3);
                        if (f > drift) drift = f;
                    }
                }
                drift *= 0.75f + 0.5f * fbm(x * 0.23f + 17, z * 0.23f + 5);
                // free-standing mounds
                float m = fbm(x * 0.055f + 41, z * 0.055f + 93);
                float mound = (float) Math.pow(Math.max(0, m - 0.48f) / 0.52f, 1.3) * 1.7f;
                float h = kind[k] == 0 ? (d + Math.max(drift, mound)) * size
                        : kind[k] == 1 ? (d + drift * 0.45f) * Math.min(1.2f, size) // roofs: no mounds
                        : 0.1f + 0.12f * fbm(x * 0.3f, z * 0.3f);                  // snow caps on trees
                // fade the thickness towards the edge of the area
                float edge = (float) Math.sqrt((i - R) * (i - R) + (j - R) * (j - R)) / R;
                if (edge > 1f) {
                    base[k] = Integer.MIN_VALUE;
                    continue;
                }
                if (edge > 0.75f) h = Math.max(0.05f, h * (1f - (edge - 0.75f) / 0.25f));
                depth[k] = Math.min(2.2f, Math.max(0.05f, h));
            }
        }
        // 3) soften: average with neighbours on the same level (rounder drifts)
        float[] tmp = depth.clone();
        for (int i = 1; i < N - 1; i++) {
            for (int j = 1; j < N - 1; j++) {
                int k = idx(i, j);
                if (base[k] == Integer.MIN_VALUE) continue;
                float sum = tmp[k] * 3, w = 3;
                int[][] nb = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
                for (int[] o : nb) {
                    int kk = idx(i + o[0], j + o[1]);
                    if (same(base[kk], base[k])) {
                        sum += tmp[kk] + (base[kk] - base[k]) / 8f;
                        w++;
                    }
                }
                depth[k] = sum / w;
            }
        }
        built = true;
    }

    private static boolean natural(BlockState s) {
        return s.isIn(net.minecraft.registry.tag.BlockTags.DIRT) || s.isIn(net.minecraft.registry.tag.BlockTags.SAND)
                || s.isIn(net.minecraft.registry.tag.BlockTags.BASE_STONE_OVERWORLD) || s.isOf(net.minecraft.block.Blocks.SNOW_BLOCK)
                || s.isOf(net.minecraft.block.Blocks.GRAVEL) || s.isOf(net.minecraft.block.Blocks.GRASS_BLOCK) || s.isOf(net.minecraft.block.Blocks.PODZOL);
    }

    /** Height of a wall at (x, z) relative to level y when the column itself has no snow (e.g. a fence, a tree trunk). */
    private static float wallAt(ClientWorld world, int x, int z, int y) {
        BlockPos pos = new BlockPos(x, y, z);
        BlockState s = world.getBlockState(pos);
        if (s.isAir() || s.isReplaceable() || !s.getFluidState().isEmpty()) return 0;
        return world.getBlockState(pos.up()).isAir() ? 1 : 2;
    }

    // ------------------------------------------------------------------ queries

    /** Snow surface height (absolute y) at a world column, or NaN if there is no snow. */
    public static float surfaceAt(int x, int z) {
        if (!built) return Float.NaN;
        int i = x - centerX + R, j = z - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return Float.NaN;
        int k = idx(i, j);
        if (base[k] == Integer.MIN_VALUE || depth[k] <= 0) return Float.NaN;
        return base[k] / 8f + depth[k];
    }

    /** Whether the local player is standing in the visual snow. */
    public static boolean playerOnSnow(ClientPlayerEntity p) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.snowCover || !built) return false;
        int i = p.getBlockX() - centerX + R, j = p.getBlockZ() - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return false;
        int k = idx(i, j);
        return base[k] != Integer.MIN_VALUE && Math.abs(p.getY() - base[k] / 8f) < 0.6;
    }

    /** Plays the snow step sound for the local player (replaces the vanilla step sound on snow). */
    public static void playStep(ClientPlayerEntity p) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.snowSteps) return;
        float vol = 0.5f * c.stepVolume * (p.isSneaking() ? 0.5f : 1f);
        float pitch = 0.9f + p.getRandom().nextFloat() * 0.2f + (p.isSprinting() ? 0.06f : 0f);
        p.getEntityWorld().playSoundClient(p.getX(), p.getY(), p.getZ(), STEP, SoundCategory.PLAYERS, vol, pitch, false);
        if (ru.onedex.newyear.NewYearClient.DEV) ru.onedex.newyear.NewYearClient.LOGGER.info("[dev] snow step vol=" + vol);
    }

    // ------------------------------------------------------------------ render

    public static void render(WorldRenderContext ctx) {
        NyConfig c = NyConfig.INSTANCE;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (!c.snowCover || !built || mc.world == null || builtFor != mc.world) return;
        Sprite sprite = mc.getAtlasManager().getAtlasTexture(Atlases.BLOCKS).getSprite(SNOW_SPRITE);
        float u0 = sprite.getMinU(), u1 = sprite.getMaxU(), v0 = sprite.getMinV(), v1 = sprite.getMaxV();
        Vec3d cam = mc.gameRenderer.getCamera().getCameraPos();
        VertexConsumer vc = ctx.consumers().getBuffer(LAYER);
        MatrixStack.Entry e = ctx.matrices().peek();
        float ox = (float) (centerX - R - cam.x), oz = (float) (centerZ - R - cam.z);
        float[] h = new float[9];
        for (int i = 0; i < N; i++) {
            for (int j = 0; j < N; j++) {
                int k = idx(i, j);
                int b = base[k];
                if (b == Integer.MIN_VALUE) continue;
                float y0 = (float) (b / 8.0 - cam.y);
                fillHeights(i, j, h);
                float x0 = ox + i, z0 = oz + j;
                int lt = light[k];
                for (int sq = 0; sq < 4; sq++) {
                    int a = (sq / 2) * 3 + (sq % 2); // top-left vertex index of the sub-quad in the 3x3 grid
                    float sx = (sq % 2) * 0.5f, sz = (sq / 2) * 0.5f;
                    float ha = h[a], hb = h[a + 1], hc = h[a + 4], hd = h[a + 3];
                    // normal from the diagonals
                    float nx = (ha - hb + hd - hc) * 1.6f, nz = (ha - hd + hb - hc) * 1.6f, ny = 1f;
                    float len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
                    nx /= len;
                    ny /= len;
                    nz /= len;
                    float ua = u0 + (u1 - u0) * sx, ub = u0 + (u1 - u0) * (sx + 0.5f);
                    float va = v0 + (v1 - v0) * sz, vb = v0 + (v1 - v0) * (sz + 0.5f);
                    vert(vc, e, x0 + sx, y0 + ha, z0 + sz, ua, va, lt, nx, ny, nz);
                    vert(vc, e, x0 + sx, y0 + hd, z0 + sz + 0.5f, ua, vb, lt, nx, ny, nz);
                    vert(vc, e, x0 + sx + 0.5f, y0 + hc, z0 + sz + 0.5f, ub, vb, lt, nx, ny, nz);
                    vert(vc, e, x0 + sx + 0.5f, y0 + hb, z0 + sz, ub, va, lt, nx, ny, nz);
                }
                // side walls where the snow ends (edge of a roof, a cliff, no snow next to it)
                side(vc, e, sprite, i, j, -1, 0, x0, y0, z0, h[0], h[3], h[6], lt);
                side(vc, e, sprite, i, j, 1, 0, x0 + 1, y0, z0, h[2], h[5], h[8], lt);
                side(vc, e, sprite, i, j, 0, -1, x0, y0, z0, h[0], h[1], h[2], lt);
                side(vc, e, sprite, i, j, 0, 1, x0, y0, z0 + 1, h[6], h[7], h[8], lt);
            }
        }
    }

    /** 3x3 grid of snow heights over column (i, j) (corners shared with neighbours -> smooth surface). */
    private static void fillHeights(int i, int j, float[] h) {
        float c00 = corner(i, j, -1, -1), c10 = corner(i, j, 1, -1), c01 = corner(i, j, -1, 1), c11 = corner(i, j, 1, 1);
        float mid = depth[idx(i, j)];
        h[0] = c00;
        h[2] = c10;
        h[6] = c01;
        h[8] = c11;
        h[1] = (c00 + c10) / 2f;
        h[7] = (c01 + c11) / 2f;
        h[3] = (c00 + c01) / 2f;
        h[5] = (c10 + c11) / 2f;
        h[4] = (c00 + c10 + c01 + c11) / 8f + mid / 2f;
    }

    /** Exact absolute y of the snow surface at a point (matches the rendered mesh), or NaN. */
    public static float heightAtPoint(double x, double z) {
        if (!built) return Float.NaN;
        int bx = (int) Math.floor(x), bz = (int) Math.floor(z);
        int i = bx - centerX + R, j = bz - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return Float.NaN;
        int k = idx(i, j);
        if (base[k] == Integer.MIN_VALUE) return Float.NaN;
        float[] h = new float[9];
        fillHeights(i, j, h);
        float fx = (float) (x - bx) * 2f, fz = (float) (z - bz) * 2f;
        int sx = Math.min(1, (int) fx), sz = Math.min(1, (int) fz);
        float u = fx - sx, v = fz - sz;
        int a = sz * 3 + sx;
        float top = h[a] + (h[a + 1] - h[a]) * u;
        float bot = h[a + 3] + (h[a + 4] - h[a + 3]) * u;
        return base[k] / 8f + top + (bot - top) * v;
    }

    /** Ground level (absolute y, half-block precision) of a column with snow, or NaN. */
    public static float groundAt(int x, int z) {
        if (!built) return Float.NaN;
        int i = x - centerX + R, j = z - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return Float.NaN;
        int b = base[idx(i, j)];
        return b == Integer.MIN_VALUE ? Float.NaN : b / 8f;
    }

    /** y of the block that carries the snow at a column, or Integer.MIN_VALUE. */
    public static int supportAt(int x, int z) {
        if (!built) return Integer.MIN_VALUE;
        int i = x - centerX + R, j = z - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return Integer.MIN_VALUE;
        int k = idx(i, j);
        return base[k] == Integer.MIN_VALUE ? Integer.MIN_VALUE : support[k];
    }

    /** Kind of the snowy column: 0 ground, 1 roof, 2 leaves, -1 none. */
    public static int kindAt(int x, int z) {
        if (!built) return -1;
        int i = x - centerX + R, j = z - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return -1;
        int k = idx(i, j);
        return base[k] == Integer.MIN_VALUE ? -1 : kind[k];
    }

    public static int lightAt(int x, int z) {
        int i = x - centerX + R, j = z - centerZ + R;
        if (i < 0 || j < 0 || i >= N || j >= N) return 0xF000F0;
        return light[idx(i, j)];
    }

    public static boolean isBuilt() {
        return built;
    }

    /** Height (relative to this column's ground) of the snow at the corner (i + dx/2, j + dz/2) of column (i, j). */
    private static float corner(int i, int j, int dx, int dz) {
        int b = base[idx(i, j)];
        float sum = 0;
        int n = 0;
        boolean open = false;
        int[] is = {i, i + dx}, js = {j, j + dz};
        for (int ii : is) {
            for (int jj : js) {
                if (ii < 0 || jj < 0 || ii >= N || jj >= N) {
                    open = true;
                    continue;
                }
                int kk = idx(ii, jj);
                int nb = base[kk];
                if (same(nb, b)) {
                    sum += depth[kk] + (nb - b) / 8f; // absolute surface, relative to our ground
                    n++;
                } else if (nb == Integer.MIN_VALUE || nb < b) {
                    open = true; // edge of a drop / end of the snow
                }
                // higher neighbour = wall: the drift leans against it
            }
        }
        float avg = sum / Math.max(1, n);
        return Math.max(0.04f, open ? avg * 0.7f : avg);
    }

    private static void side(VertexConsumer vc, MatrixStack.Entry e, Sprite sp, int i, int j, int di, int dj,
                             float x, float y0, float z, float ha, float hm, float hb, int lt) {
        int ii = i + di, jj = j + dj;
        int b = base[idx(i, j)];
        if (ii >= 0 && jj >= 0 && ii < N && jj < N) {
            int nb = base[idx(ii, jj)];
            if (same(nb, b) || (nb != Integer.MIN_VALUE && nb > b)) return; // continues on the same level or against a wall
        }
        float u0 = sp.getMinU(), u1 = sp.getMaxU(), v0 = sp.getMinV(), v1 = sp.getMaxV();
        float vh = (v1 - v0);
        float um = (u0 + u1) / 2f;
        float nx = di, nz = dj;
        if (di != 0) {
            // x is fixed, edge runs along z
            vert(vc, e, x, y0, z, u0, v0 + vh * Math.min(1, ha), lt, nx, 0, nz);
            vert(vc, e, x, y0 + ha, z, u0, v0, lt, nx, 0, nz);
            vert(vc, e, x, y0 + hm, z + 0.5f, um, v0, lt, nx, 0, nz);
            vert(vc, e, x, y0, z + 0.5f, um, v0 + vh * Math.min(1, hm), lt, nx, 0, nz);
            vert(vc, e, x, y0, z + 0.5f, um, v0 + vh * Math.min(1, hm), lt, nx, 0, nz);
            vert(vc, e, x, y0 + hm, z + 0.5f, um, v0, lt, nx, 0, nz);
            vert(vc, e, x, y0 + hb, z + 1, u1, v0, lt, nx, 0, nz);
            vert(vc, e, x, y0, z + 1, u1, v0 + vh * Math.min(1, hb), lt, nx, 0, nz);
        } else {
            vert(vc, e, x, y0, z, u0, v0 + vh * Math.min(1, ha), lt, nx, 0, nz);
            vert(vc, e, x, y0 + ha, z, u0, v0, lt, nx, 0, nz);
            vert(vc, e, x + 0.5f, y0 + hm, z, um, v0, lt, nx, 0, nz);
            vert(vc, e, x + 0.5f, y0, z, um, v0 + vh * Math.min(1, hm), lt, nx, 0, nz);
            vert(vc, e, x + 0.5f, y0, z, um, v0 + vh * Math.min(1, hm), lt, nx, 0, nz);
            vert(vc, e, x + 0.5f, y0 + hm, z, um, v0, lt, nx, 0, nz);
            vert(vc, e, x + 1, y0 + hb, z, u1, v0, lt, nx, 0, nz);
            vert(vc, e, x + 1, y0, z, u1, v0 + vh * Math.min(1, hb), lt, nx, 0, nz);
        }
    }

    private static void vert(VertexConsumer vc, MatrixStack.Entry e, float x, float y, float z, float u, float v, int light, float nx, float ny, float nz) {
        vc.vertex(e, x, y, z).color(shade(nx, ny, nz)).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(light).normal(e, nx, ny, nz);
    }

    /** Soft "sun" shading so the white drifts read in 3D: slopes facing away get a cool blue shadow. */
    private static int shade(float nx, float ny, float nz) {
        float lx = 0.45f, ly = 0.78f, lz = 0.43f;
        float d = Math.max(0, nx * lx + ny * ly + nz * lz);
        float b = 0.70f + 0.30f * d;
        int r = Math.round(255 * Math.min(1f, b * 0.98f + 0.02f));
        int g = Math.round(255 * Math.min(1f, b * 0.99f + 0.02f));
        int bl = Math.round(255 * Math.min(1f, b * 0.92f + 0.10f));
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    // ------------------------------------------------------------------ noise

    private static float fbm(float x, float y) {
        return noise(x, y) * 0.6f + noise(x * 2.1f + 13, y * 2.1f + 7) * 0.3f + noise(x * 4.3f + 3, y * 4.3f + 29) * 0.1f;
    }

    private static float noise(float x, float y) {
        int xi = (int) Math.floor(x), yi = (int) Math.floor(y);
        float xf = x - xi, yf = y - yi;
        float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        float a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
        return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }

    private static float hash(int x, int y) {
        int h = x * 374761393 + y * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) & 0xFFFF) / 65535f;
    }
}
