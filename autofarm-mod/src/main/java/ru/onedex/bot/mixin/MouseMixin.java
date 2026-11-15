package ru.onedex.bot.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.Mouse;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.bot.bot.Move;

/** Every frame, right where the mouse turns the head: the bot turns it there too (smooth, frame by frame). */
@Mixin(Mouse.class)
public class MouseMixin {
    @Inject(method = "tick", at = @At("TAIL"))
    private void dexbot$turnHead(CallbackInfo ci) {
        Move.frame(MinecraftClient.getInstance());
    }
}
