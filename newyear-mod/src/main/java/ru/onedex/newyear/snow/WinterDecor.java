package ru.onedex.newyear.snow;

import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.LeavesBlock;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.WorldRenderer;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.texture.SpriteAtlasTexture;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.fluid.FluidState;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.util.Atlases;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.music.MusicFx;
import ru.onedex.newyear.render.Garland;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Random;

/** Icicles on roof edges, thin ice near shores, ornaments and lights on trees, footprints in the snow. */
public final class WinterDecor {
    private WinterDecor() {}

    private static final RenderLayer ICE_LAYER = RenderLayers.entityTranslucent(SpriteAtlasTexture.BLOCK_ATLAS_TEXTURE);
    private static final Identifier FROST = Identifier.of("dexnewyear", "textures/entity/frost.png");
    private static final Identifier PRINT = Identifier.of("dexnewyear", "textures/entity/footprint.png");
    private static final Identifier DECOR = Identifier.of("dexnewyear", "textures/entity/decor.png");
    private static final Identifier ICE_SPRITE = Identifier.ofVanilla("block/ice");
    private static final int[] ORNAMENT_COLORS = {0xFFD7263D, 0xFFE8B931, 0xFF2D6CDF, 0xFFC0C8D4, 0xFF8E44AD, 0xFF2EAD6B};
    private static final Random RNG = new Random();

    private record Icicle(float x, float y, float z, float len, float w, int light) {
    }

    private record IcePatch(int x, int z, float y, float alpha, int light) {
    }

    private record Ornament(float x, float y, float z, float size, int color, boolean bulb, int seed, int light) {
    }

    private static final class Print {
        float x, y, z, yaw, age;
        boolean left;
    }

    private static final class Walker {
        double x, z;
        double acc;
        boolean left;
    }

    private static List<Icicle> icicles = new ArrayList<>();
    private static List<IcePatch> ice = new ArrayList<>();
    private static List<Ornament> ornaments = new ArrayList<>();
    private static final List<Print> prints = new ArrayList<>();
    private static final Map<Integer, Walker> walkers = new HashMap<>();
    private static ClientWorld world;

    private static int hash(int x, int y, int z) {
        int h = x * 73856093 ^ y * 19349663 ^ z * 83492791;
        h ^= h >>> 13;
        h *= 0x5bd1e995;
        return h ^ (h >>> 15);
    }

    private static float rnd(int x, int y, int z, int salt) {
        return ((hash(x + salt * 31, y - salt * 17, z + salt * 7) >>> 8) & 0xFFFF) / 65535f;
    }

    // ------------------------------------------------------------------ rebuild (with the snow cover)

    public static void rebuild(ClientWorld w, NyConfig c) {
        if (w != world) {
            prints.clear();
            walkers.clear();
            world = w;
        }
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null) return;
        int cx = mc.player.getBlockX(), cy = mc.player.getBlockY(), cz = mc.player.getBlockZ();
        icicles = c.icicles ? buildIcicles(w, cx, cz) : new ArrayList<>();
        ice = c.iceOnWater ? buildIce(w, cx, cz) : new ArrayList<>();
        ornaments = c.treeDecor ? buildOrnaments(w, cx, cy, cz) : new ArrayList<>();
    }

    private static List<Icicle> buildIcicles(ClientWorld w, int cx, int cz) {
        List<Icicle> out = new ArrayList<>();
        BlockPos.Mutable p = new BlockPos.Mutable();
        int r = 22;
        for (int x = cx - r; x <= cx + r && out.size() < 700; x++) {
            for (int z = cz - r; z <= cz + r; z++) {
                int kind = SnowCover.kindAt(x, z);
                if (kind != 1 && kind != 0) continue;
                int gy = SnowCover.supportAt(x, z); // the block that carries the snow
                if (gy == Integer.MIN_VALUE) continue;
                p.set(x, gy, z);
                BlockState g = w.getBlockState(p);
                if (g.isAir()) continue;
                for (Direction d : Direction.Type.HORIZONTAL) {
                    BlockPos side = p.offset(d);
                    if (!w.getBlockState(side).isAir() || !w.getBlockState(side.down()).isAir()) continue;
                    // a real edge: at least 2 blocks of air below
                    if (!w.getBlockState(side.down(2)).isAir()) continue;
                    int n = 1 + (int) (rnd(x, gy, z, d.ordinal()) * 3);
                    for (int i = 0; i < n; i++) {
                        float t = 0.12f + 0.76f * rnd(x, gy, z, d.ordinal() * 10 + i);
                        float len = 0.18f + 0.55f * (float) Math.pow(rnd(x, gy, z, d.ordinal() * 20 + i), 1.6);
                        float px = x + 0.5f + d.getOffsetX() * 0.53f + (d.getOffsetZ() != 0 ? t - 0.5f : 0);
                        float pz = z + 0.5f + d.getOffsetZ() * 0.53f + (d.getOffsetX() != 0 ? t - 0.5f : 0);
                        int light = WorldRenderer.getLightmapCoordinates(w, side);
                        out.add(new Icicle(px, gy, pz, len, 0.05f + len * 0.06f, light));
                    }
                }
            }
        }
        return out;
    }

    private static List<IcePatch> buildIce(ClientWorld w, int cx, int cz) {
        List<IcePatch> out = new ArrayList<>();
        int r = 24, n = r * 2 + 1;
        float[] waterY = new float[n * n];
        int[] dist = new int[n * n];
        BlockPos.Mutable p = new BlockPos.Mutable();
        java.util.ArrayDeque<int[]> q = new java.util.ArrayDeque<>();
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                int x = cx + i - r, z = cz + j - r;
                int k = i * n + j;
                waterY[k] = Float.NaN;
                dist[k] = Integer.MAX_VALUE;
                int top = w.getTopY(Heightmap.Type.MOTION_BLOCKING, x, z);
                p.set(x, top - 1, z);
                FluidState fs = w.getFluidState(p);
                if (fs.isIn(FluidTags.WATER) && fs.isStill() && w.getBlockState(p.up()).isAir()) {
                    waterY[k] = top - 1 + fs.getHeight(w, p);
                } else {
                    dist[k] = 0; // land = shore
                    q.add(new int[]{i, j});
                }
            }
        }
        while (!q.isEmpty()) {
            int[] c = q.poll();
            int d0 = dist[c[0] * n + c[1]];
            if (d0 >= 5) continue;
            int[][] nb = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
            for (int[] o : nb) {
                int ii = c[0] + o[0], jj = c[1] + o[1];
                if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
                int kk = ii * n + jj;
                if (dist[kk] > d0 + 1) {
                    dist[kk] = d0 + 1;
                    q.add(new int[]{ii, jj});
                }
            }
        }
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                int k = i * n + j;
                if (Float.isNaN(waterY[k]) || dist[k] > 4) continue;
                int x = cx + i - r, z = cz + j - r;
                float a = Math.max(0, 1f - (dist[k] - 1) / 4f) * (0.75f + 0.25f * rnd(x, 0, z, 3));
                if (a < 0.05f) continue;
                out.add(new IcePatch(x, z, waterY[k], a, WorldRenderer.getLightmapCoordinates(w, new BlockPos(x, (int) waterY[k] + 1, z))));
            }
        }
        return out;
    }

    private static List<Ornament> buildOrnaments(ClientWorld w, int cx, int cy, int cz) {
        List<Ornament> out = new ArrayList<>();
        BlockPos.Mutable p = new BlockPos.Mutable();
        int r = 18;
        for (int x = cx - r; x <= cx + r; x++) {
            for (int z = cz - r; z <= cz + r; z++) {
                int top = w.getTopY(Heightmap.Type.MOTION_BLOCKING, x, z);
                int y0 = Math.max(cy - 8, top - 14);
                for (int y = top - 1; y >= y0 && out.size() < 500; y--) {
                    p.set(x, y, z);
                    BlockState s = w.getBlockState(p);
                    if (!(s.getBlock() instanceof LeavesBlock)) continue;
                    boolean spruce = s.isOf(Blocks.SPRUCE_LEAVES);
                    for (Direction d : Direction.Type.HORIZONTAL) {
                        if (!w.getBlockState(p.offset(d)).isAir()) continue;
                        float chance = spruce ? 0.42f : 0.16f;
                        if (rnd(x, y, z, d.ordinal() + 50) > chance) continue;
                        float u = rnd(x, y, z, d.ordinal() + 60) - 0.5f, v = rnd(x, y, z, d.ordinal() + 70) * 0.6f;
                        float px = x + 0.5f + d.getOffsetX() * 0.6f + (d.getOffsetZ() != 0 ? u * 0.7f : 0);
                        float pz = z + 0.5f + d.getOffsetZ() * 0.6f + (d.getOffsetX() != 0 ? u * 0.7f : 0);
                        float py = y + 0.2f + v;
                        boolean bulb = rnd(x, y, z, d.ordinal() + 80) < 0.45f;
                        int color = bulb ? Garland.COLORS[Math.floorMod(hash(x, y, z), Garland.COLORS.length)] : ORNAMENT_COLORS[Math.floorMod(hash(x, y, z) >>> 4, ORNAMENT_COLORS.length)];
                        int light = WorldRenderer.getLightmapCoordinates(w, p.offset(d));
                        out.add(new Ornament(px, py, pz, bulb ? 0.13f : 0.24f + 0.06f * u, color, bulb, hash(x, y, z), light));
                    }
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ tick: footprints, drips

    public static void tick(MinecraftClient mc) {
        NyConfig c = NyConfig.INSTANCE;
        if (mc.world == null || mc.isPaused()) return;
        for (Iterator<Print> it = prints.iterator(); it.hasNext(); ) {
            Print p = it.next();
            p.age += 0.05f;
            if (p.age > 90) it.remove();
        }
        if (c.footprints && c.snowCover && SnowCover.isBuilt()) {
            for (AbstractClientPlayerEntity pl : mc.world.getPlayers()) {
                if (pl.isSpectator() || !pl.isOnGround() || pl.squaredDistanceTo(mc.player) > 26 * 26) continue;
                Walker wk = walkers.computeIfAbsent(pl.getId(), k -> {
                    Walker nw = new Walker();
                    nw.x = pl.getX();
                    nw.z = pl.getZ();
                    return nw;
                });
                double dx = pl.getX() - wk.x, dz = pl.getZ() - wk.z;
                double dist = Math.sqrt(dx * dx + dz * dz);
                wk.x = pl.getX();
                wk.z = pl.getZ();
                if (dist > 2) continue; // teleport
                float ground = SnowCover.groundAt(pl.getBlockX(), pl.getBlockZ());
                if (Float.isNaN(ground) || Math.abs(pl.getY() - ground) > 0.6) continue;
                wk.acc += dist;
                if (wk.acc < 0.62) continue;
                wk.acc = 0;
                wk.left = !wk.left;
                float yaw = (float) Math.atan2(dz, dx);
                float side = wk.left ? 0.13f : -0.13f;
                float px = (float) (pl.getX() - Math.sin(yaw) * side), pz = (float) (pl.getZ() + Math.cos(yaw) * side);
                float sy = SnowCover.heightAtPoint(px, pz);
                if (Float.isNaN(sy)) continue;
                Print pr = new Print();
                pr.x = px;
                pr.z = pz;
                pr.y = sy;
                pr.yaw = yaw;
                pr.left = wk.left;
                prints.add(pr);
                if (prints.size() > 600) prints.remove(0);
            }
        }
        // drips from icicles
        if (c.icicles && !icicles.isEmpty() && RNG.nextInt(6) == 0) {
            Icicle ic = icicles.get(RNG.nextInt(icicles.size()));
            mc.world.addParticleClient(ParticleTypes.DRIPPING_WATER, ic.x, ic.y - ic.len, ic.z, 0, 0, 0);
        }
    }

    // ------------------------------------------------------------------ render

    public static void render(WorldRenderContext ctx) {
        NyConfig c = NyConfig.INSTANCE;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null || mc.world != world) return;
        Vec3d cam = mc.gameRenderer.getCamera().getCameraPos();
        MatrixStack.Entry e = ctx.matrices().peek();
        float cx = (float) cam.x, cy = (float) cam.y, cz = (float) cam.z;

        if (c.icicles && !icicles.isEmpty()) {
            Sprite sp = mc.getAtlasManager().getAtlasTexture(Atlases.BLOCKS).getSprite(ICE_SPRITE);
            VertexConsumer vc = ctx.consumers().getBuffer(ICE_LAYER);
            float u0 = sp.getMinU(), u1 = sp.getMaxU(), v0 = sp.getMinV(), v1 = sp.getMaxV();
            for (Icicle ic : icicles) {
                float x = ic.x - cx, y = ic.y - cy, z = ic.z - cz, w = ic.w / 2f;
                float by = y - ic.len;
                int col = 0xDDE8F6FF;
                // 4 faces of an upside-down pyramid
                float[][] cs = {{-w, -w}, {w, -w}, {w, w}, {-w, w}};
                for (int f = 0; f < 4; f++) {
                    float[] a = cs[f], b = cs[(f + 1) % 4];
                    float nx = (a[0] + b[0]), nz = (a[1] + b[1]);
                    quad(vc, e, x + a[0], y, z + a[1], x + b[0], y, z + b[1], x, by, z, x, by, z, u0, v0, u1, v1, col, ic.light, nx, 0, nz);
                }
            }
        }

        if (c.iceOnWater && !ice.isEmpty()) {
            VertexConsumer vc = ctx.consumers().getBuffer(RenderLayers.entityTranslucent(FROST));
            for (IcePatch p : ice) {
                float x = p.x - cx, y = p.y + 0.012f - cy, z = p.z - cz;
                int col = ((int) (p.alpha * 255) << 24) | 0xFFFFFF;
                float u = (p.x & 3) * 0.25f, v = (p.z & 3) * 0.25f;
                quad(vc, e, x, y, z, x, y, z + 1, x + 1, y, z + 1, x + 1, y, z, u, v, u + 0.25f, v + 0.25f, col, p.light, 0, 1, 0);
            }
        }

        if (c.footprints && !prints.isEmpty()) {
            VertexConsumer vc = ctx.consumers().getBuffer(RenderLayers.entityTranslucent(PRINT));
            for (Print p : prints) {
                float a = Math.max(0, 1f - p.age / 90f);
                if (a <= 0.01f) continue;
                float x = p.x - cx, y = p.y + 0.015f - cy, z = p.z - cz;
                float fx = (float) Math.cos(p.yaw), fz = (float) Math.sin(p.yaw); // forward
                float rx = -fz, rz = fx;                                       // right
                float hl = 0.17f, hw = 0.085f;
                int col = ((int) (a * 150) << 24) | 0x8FA6C2;
                int light = SnowCover.lightAt((int) Math.floor(p.x), (int) Math.floor(p.z));
                float ax = x - fx * hl - rx * hw, az = z - fz * hl - rz * hw;
                float bx = x + fx * hl - rx * hw, bz = z + fz * hl - rz * hw;
                float ccx = x + fx * hl + rx * hw, ccz = z + fz * hl + rz * hw;
                float dx = x - fx * hl + rx * hw, dz = z - fz * hl + rz * hw;
                // texture: toes at v=0, heel at v=1
                quad(vc, e, ax, y, az, bx, y, bz, ccx, y, ccz, dx, y, dz, 1, 1, 0, 0, col, light, 0, 1, 0, true);
            }
        }

        if (c.treeDecor && !ornaments.isEmpty()) {
            VertexConsumer vc = ctx.consumers().getBuffer(RenderLayers.entityCutoutNoCull(DECOR));
            long beat = MusicFx.garlandStep();
            long step = beat >= 0 ? beat : System.currentTimeMillis() / 450;
            for (Ornament o : ornaments) {
                int light = o.light;
                int color = o.color;
                if (o.bulb) {
                    boolean on = ((step + (o.seed & 7)) % 3) != 0;
                    light = on ? 0xF000F0 : o.light;
                    color = on ? o.color : Garland.dim(o.color);
                } else {
                    // tiny gold cap on top of the ball
                    cube(vc, e, o.x - cx, o.y + o.size * 0.55f - cy, o.z - cz, o.size * 0.35f, 0xFFE8C547, light);
                }
                cube(vc, e, o.x - cx, o.y - cy, o.z - cz, o.size, color, light);
            }
        }
    }

    private static void cube(VertexConsumer vc, MatrixStack.Entry e, float x, float y, float z, float s, int color, int light) {
        float h = s / 2f;
        float x0 = x - h, x1 = x + h, y0 = y - h, y1 = y + h, z0 = z - h, z1 = z + h;
        int top = color, side = shadeC(color, 0.82f), bottom = shadeC(color, 0.6f);
        quad(vc, e, x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, 0, 0, 1, 1, top, light, 0, 1, 0);
        quad(vc, e, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, 0, 1, 1, bottom, light, 0, -1, 0);
        quad(vc, e, x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, 0, 0, 1, 1, side, light, 0, 0, -1);
        quad(vc, e, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, 1, side, light, 0, 0, 1);
        quad(vc, e, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, 0, 0, 1, 1, shadeC(color, 0.9f), light, -1, 0, 0);
        quad(vc, e, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, 0, 0, 1, 1, shadeC(color, 0.9f), light, 1, 0, 0);
    }

    private static int shadeC(int c, float f) {
        int r = Math.round(((c >> 16) & 255) * f), g = Math.round(((c >> 8) & 255) * f), b = Math.round((c & 255) * f);
        return (c & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    private static void quad(VertexConsumer vc, MatrixStack.Entry e,
                             float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz,
                             float u0, float v0, float u1, float v1, int color, int light, float nx, float ny, float nz) {
        quad(vc, e, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0, v0, u1, v1, color, light, nx, ny, nz, false);
    }

    private static void quad(VertexConsumer vc, MatrixStack.Entry e,
                             float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz,
                             float u0, float v0, float u1, float v1, int color, int light, float nx, float ny, float nz, boolean rotUv) {
        float len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) {
            nx /= len;
            ny /= len;
            nz /= len;
        }
        if (rotUv) {
            v(vc, e, ax, ay, az, u0, v0, color, light, nx, ny, nz);
            v(vc, e, bx, by, bz, u0, v1, color, light, nx, ny, nz);
            v(vc, e, cx, cy, cz, u1, v1, color, light, nx, ny, nz);
            v(vc, e, dx, dy, dz, u1, v0, color, light, nx, ny, nz);
        } else {
            v(vc, e, ax, ay, az, u0, v0, color, light, nx, ny, nz);
            v(vc, e, bx, by, bz, u1, v0, color, light, nx, ny, nz);
            v(vc, e, cx, cy, cz, u1, v1, color, light, nx, ny, nz);
            v(vc, e, dx, dy, dz, u0, v1, color, light, nx, ny, nz);
        }
    }

    private static void v(VertexConsumer vc, MatrixStack.Entry e, float x, float y, float z, float u, float v, int color, int light, float nx, float ny, float nz) {
        vc.vertex(e, x, y, z).color(color).texture(u, v).overlay(OverlayTexture.DEFAULT_UV).light(light).normal(e, nx, ny, nz);
    }
}
