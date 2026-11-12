package ru.onedex.newyear.snow;

import net.minecraft.client.particle.BillboardParticle;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.world.ClientWorld;

/** A small puff of frosty breath: drifts forward, grows and fades. */
public class BreathParticle extends BillboardParticle {
    private final float startScale;

    public BreathParticle(ClientWorld world, double x, double y, double z, double vx, double vy, double vz, Sprite sprite) {
        super(world, x, y, z, sprite);
        this.velocityX = vx;
        this.velocityY = vy;
        this.velocityZ = vz;
        this.startScale = 0.09f + random.nextFloat() * 0.05f;
        this.scale = startScale;
        this.maxAge = 22 + random.nextInt(14);
        this.gravityStrength = -0.02f;
        this.velocityMultiplier = 0.9f;
        this.collidesWithWorld = false;
        this.setColor(0.86f, 0.9f, 0.96f);
        this.setAlpha(0.8f);
    }

    @Override
    public BillboardParticle.RenderType getRenderType() {
        return BillboardParticle.RenderType.PARTICLE_ATLAS_TRANSLUCENT;
    }

    @Override
    public void tick() {
        super.tick();
        float t = age / (float) maxAge;
        this.scale = startScale * (1f + t * 2.2f);
        this.setAlpha(0.8f * (1f - t * t));
    }
}
