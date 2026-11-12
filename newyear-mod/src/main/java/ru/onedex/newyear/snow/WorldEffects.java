package ru.onedex.newyear.snow;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.Atlases;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import ru.onedex.newyear.config.NyConfig;

/** Client-side snowfall around the camera and frosty breath of players. Nothing is sent to the server. */
public final class WorldEffects {
    private WorldEffects() {}

    private static final Identifier[] FLAKES = {
            Identifier.of("dexnewyear", "snow_0"), Identifier.of("dexnewyear", "snow_1"),
            Identifier.of("dexnewyear", "snow_2"), Identifier.of("dexnewyear", "snow_3")};
    private static final Identifier BREATH = Identifier.of("dexnewyear", "breath");
    private static final Random RNG = Random.create();
    private static double windAngle = RNG.nextDouble() * Math.PI * 2;

    private static Sprite sprite(MinecraftClient mc, Identifier id) {
        return mc.getAtlasManager().getAtlasTexture(Atlases.PARTICLES).getSprite(id);
    }

    public static void tick(MinecraftClient mc) {
        if (mc.world == null || mc.player == null || mc.isPaused()) return;
        NyConfig c = NyConfig.INSTANCE;
        if (c.snowfall) snow(mc, mc.world, c);
        if (c.breath) breath(mc, mc.world);
    }

    private static void snow(MinecraftClient mc, ClientWorld world, NyConfig c) {
        if (mc.player.isSubmergedInWater()) return;
        int s = c.snowStrength;
        int perTick = Math.min(40, (int) Math.round((2 + Math.pow(s - 1, 1.55) * 1.8) * ru.onedex.newyear.music.MusicFx.snowAmount()));
        if (ru.onedex.newyear.music.MusicFx.snowBeat()) {
            perTick = Math.min(90, perTick * 3 + 8);
            windAngle += (RNG.nextDouble() - 0.5) * 0.8;
        }
        windAngle += (RNG.nextDouble() - 0.5) * 0.01;
        double windSpeed = c.wind ? 0.006 + s * s * 0.0009 : 0;
        double wx = Math.cos(windAngle) * windSpeed, wz = Math.sin(windAngle) * windSpeed;
        Vec3d cam = mc.gameRenderer.getCamera().getCameraPos();
        float radius = 18;
        for (int i = 0; i < perTick; i++) {
            double r = 1.5 + Math.sqrt(RNG.nextDouble()) * radius;
            double a = RNG.nextDouble() * Math.PI * 2;
            double height = -3 + RNG.nextDouble() * 15;
            double fall = (0.035 + RNG.nextDouble() * 0.03 + s * 0.002) * ru.onedex.newyear.music.MusicFx.snowSpeed();
            // start upwind so the flakes drift into view
            double travel = (height + 4) / fall;
            double x = cam.x + Math.cos(a) * r - wx * travel * 0.5;
            double z = cam.z + Math.sin(a) * r - wz * travel * 0.5;
            double y = cam.y + height;
            int top = world.getTopY(Heightmap.Type.MOTION_BLOCKING, (int) Math.floor(x), (int) Math.floor(z));
            if (y < top) continue; // under a roof / inside: no snow
            float size;
            int tex;
            switch (c.flakeSize) {
                case 0 -> { size = 0.035f + RNG.nextFloat() * 0.03f; tex = RNG.nextInt(2); }
                case 2 -> { size = 0.09f + RNG.nextFloat() * 0.08f; tex = 2 + RNG.nextInt(2); }
                default -> {
                    float k = RNG.nextFloat();
                    size = 0.035f + k * k * 0.13f;
                    tex = size > 0.1f ? 2 + RNG.nextInt(2) : RNG.nextInt(2);
                }
            }
            mc.particleManager.addParticle(new SnowParticle(world, x, y, z, sprite(mc, FLAKES[tex]), size, fall, wx, wz));
        }
    }

    private static void breath(MinecraftClient mc, ClientWorld world) {
        long time = world.getTime();
        boolean firstPerson = mc.options.getPerspective().isFirstPerson();
        for (AbstractClientPlayerEntity p : world.getPlayers()) {
            if (p.isInvisible() || p.isSubmergedInWater() || p.isSpectator()) continue;
            if (p == mc.player && firstPerson) continue;
            if (p.squaredDistanceTo(mc.player) > 32 * 32) continue;
            int period = p.isSprinting() ? 18 : 36;
            if ((time + p.getId() * 13L) % period != 0) continue;
            Vec3d look = p.getRotationVector(p.getPitch(), p.getHeadYaw()); // where the head (and mouth) visibly points
            Vec3d mouth = p.getEyePos().add(look.multiply(0.32)).add(0, -0.13, 0);
            Sprite sp = sprite(mc, BREATH);
            int n = 3 + RNG.nextInt(3);
            for (int i = 0; i < n; i++) {
                double spread = 0.012;
                mc.particleManager.addParticle(new BreathParticle(world, mouth.x, mouth.y, mouth.z,
                        look.x * 0.035 + (RNG.nextDouble() - 0.5) * spread,
                        look.y * 0.035 + 0.004 + (RNG.nextDouble() - 0.5) * spread,
                        look.z * 0.035 + (RNG.nextDouble() - 0.5) * spread, sp));
            }
        }
    }
}
