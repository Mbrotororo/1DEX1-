package ru.onedex.newyear.mixin;

import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.BlockPos;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.newyear.snow.SnowCover;

/** Walking through the visual snow drifts plays the crunchy snow step sound instead of the block sound. */
@Mixin(Entity.class)
public abstract class EntityStepMixin {
    @Inject(method = "playStepSounds", at = @At("HEAD"), cancellable = true)
    private void dexnewyear$snowStep(BlockPos pos, BlockState state, CallbackInfo ci) {
        dexnewyear$replace(ci);
    }

    @Inject(method = "playCombinationStepSounds", at = @At("HEAD"), cancellable = true)
    private void dexnewyear$snowStep2(BlockState primary, BlockState secondary, CallbackInfo ci) {
        dexnewyear$replace(ci);
    }

    private void dexnewyear$replace(CallbackInfo ci) {
        Object self = this;
        if (!(self instanceof ClientPlayerEntity p) || p != MinecraftClient.getInstance().player) return;
        if (!SnowCover.playerOnSnow(p)) return;
        SnowCover.playStep(p);
        ci.cancel();
    }
}
