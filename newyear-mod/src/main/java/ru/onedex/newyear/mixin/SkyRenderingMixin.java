package ru.onedex.newyear.mixin;

import net.minecraft.client.render.Camera;
import net.minecraft.client.render.SkyRendering;
import net.minecraft.client.render.state.SkyRenderState;
import net.minecraft.client.world.ClientWorld;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.newyear.config.NyConfig;

/** Starry New Year sky: brighter stars at night. */
@Mixin(SkyRendering.class)
public abstract class SkyRenderingMixin {
    @Inject(method = "updateRenderState", at = @At("TAIL"))
    private void dexnewyear$stars(ClientWorld world, float tickProgress, Camera camera, SkyRenderState state, CallbackInfo ci) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.starrySky || state.starBrightness <= 0f) return;
        state.starBrightness = Math.min(1f, state.starBrightness * (1f + 2.2f * c.starBoost));
    }
}
