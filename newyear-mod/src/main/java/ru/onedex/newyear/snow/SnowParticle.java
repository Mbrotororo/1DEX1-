package ru.onedex.newyear.snow;

import net.minecraft.client.particle.BillboardParticle;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.world.ClientWorld;

/** A falling snowflake: slow fall, gentle sway, wind drift, melts a moment after touching the ground. */
public class SnowParticle extends BillboardParticle {
    private final double fall;
    private final double swayAmp, swayFreq, swayPhase;
    private final double windX, windZ;
    private int landedTicks = -1;

    public SnowParticle(ClientWorld world, double x, double y, double z, Sprite sprite, float size,
                        double fall, double windX, double windZ) {
        super(world, x, y, z, sprite);
        this.scale = size;
        this.fall = fall;
        this.windX = windX;
        this.windZ = windZ;
        this.swayAmp = 0.01 + random.nextDouble() * 0.025;
        this.swayFreq = 0.04 + random.nextDouble() * 0.06;
        this.swayPhase = random.nextDouble() * Math.PI * 2;
        this.maxAge = 400 + random.nextInt(200);
        this.gravityStrength = 0;
        this.collidesWithWorld = true;
        this.setBoundingBoxSpacing(0.05f, 0.05f);
        this.setColor(0.96f, 0.98f, 1.0f);
        this.zRotation = random.nextFloat() * 6.28f;
        this.lastZRotation = this.zRotation;
    }

    @Override
    public BillboardParticle.RenderType getRenderType() {
        return BillboardParticle.RenderType.PARTICLE_ATLAS_TRANSLUCENT;
    }

    @Override
    public void tick() {
        this.lastX = this.x;
        this.lastY = this.y;
        this.lastZ = this.z;
        this.lastZRotation = this.zRotation;
        if (this.age++ >= this.maxAge) {
            this.markDead();
            return;
        }
        if (landedTicks >= 0) {
            landedTicks++;
            this.setAlpha(Math.max(0, 1f - landedTicks / 12f));
            if (landedTicks > 12) this.markDead();
            return;
        }
        double s = Math.sin(age * swayFreq + swayPhase) * swayAmp;
        this.velocityX = windX + s;
        this.velocityZ = windZ + Math.cos(age * swayFreq * 0.8 + swayPhase) * swayAmp;
        this.velocityY = -fall;
        this.zRotation += (float) (s * 2);
        this.move(this.velocityX, this.velocityY, this.velocityZ);
        if (this.onGround || this.y < world.getBottomY()) landedTicks = 0;
    }
}
