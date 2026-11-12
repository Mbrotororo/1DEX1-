package ru.onedex.pvpai.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.GameOptions;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import ru.onedex.pvpai.gui.MenuScreen;

/** Lets the menu control blur strength without touching the player's video settings. */
@Mixin(GameOptions.class)
public abstract class GameOptionsMixin {
    @Inject(method = "getMenuBackgroundBlurrinessValue", at = @At("HEAD"), cancellable = true)
    private void dexpvpai$blur(CallbackInfoReturnable<Integer> cir) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc != null && mc.currentScreen instanceof MenuScreen menu) {
            cir.setReturnValue(menu.blurRadius());
        }
    }
}
