package ru.onedex.pvpai.mixin;

import net.minecraft.entity.LivingEntity;
import net.minecraft.util.Hand;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.pvpai.analysis.Brain;

@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin {
    @Inject(method = "swingHand(Lnet/minecraft/util/Hand;Z)V", at = @At("HEAD"))
    private void dexpvpai$swing(Hand hand, boolean fromServerPlayer, CallbackInfo ci) {
        LivingEntity self = (LivingEntity) (Object) this;
        if (hand != Hand.MAIN_HAND || !self.getEntityWorld().isClient()) return;
        try {
            Brain.INSTANCE.onSwing(self);
        } catch (Throwable ignored) {
        }
    }
}
