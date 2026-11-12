package ru.onedex.newyear.mixin;

import net.minecraft.client.color.world.BiomeColors;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.BlockRenderView;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import ru.onedex.newyear.WinterFilter;

/** Winter filter: grass and leaves look covered with snow. */
@Mixin(BiomeColors.class)
public abstract class BiomeColorsMixin {
    @Inject(method = "getGrassColor", at = @At("RETURN"), cancellable = true)
    private static void dexnewyear$grass(BlockRenderView world, BlockPos pos, CallbackInfoReturnable<Integer> cir) {
        if (WinterFilter.snowyColors()) cir.setReturnValue(WinterFilter.snowy(cir.getReturnValue(), 0.9f));
    }

    @Inject(method = "getFoliageColor", at = @At("RETURN"), cancellable = true)
    private static void dexnewyear$foliage(BlockRenderView world, BlockPos pos, CallbackInfoReturnable<Integer> cir) {
        if (WinterFilter.snowyColors()) cir.setReturnValue(WinterFilter.snowy(cir.getReturnValue(), 0.62f));
    }
}
