package ru.onedex.newyear.mixin;

import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.math.BlockPos;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.newyear.snow.SnowCover;

/** Breaking or placing a block near the player updates the snow, icicles and decorations right away. */
@Mixin(ClientWorld.class)
public abstract class ClientWorldMixin {
    @Inject(method = "updateListeners", at = @At("TAIL"))
    private void dexnewyear$blockChanged(BlockPos pos, BlockState oldState, BlockState newState, int flags, CallbackInfo ci) {
        if (oldState == newState) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null) return;
        if (Math.abs(pos.getX() - mc.player.getBlockX()) <= 30 && Math.abs(pos.getZ() - mc.player.getBlockZ()) <= 30) {
            SnowCover.markDirty();
        }
    }
}
