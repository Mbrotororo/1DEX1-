package ru.onedex.bot.mixin;

import net.minecraft.client.input.Input;
import net.minecraft.client.input.KeyboardInput;
import net.minecraft.util.PlayerInput;
import net.minecraft.util.math.Vec2f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.bot.bot.Move;

/** While the bot drives, its buttons replace the keyboard (the player can let go of everything). */
@Mixin(KeyboardInput.class)
public abstract class KeyboardInputMixin extends Input {
    @Inject(method = "tick", at = @At("TAIL"))
    private void dexbot$override(CallbackInfo ci) {
        PlayerInput p = Move.override();
        if (p == null) return;
        this.playerInput = p;
        float f = p.forward() == p.backward() ? 0 : (p.forward() ? 1 : -1);
        float s = p.left() == p.right() ? 0 : (p.left() ? 1 : -1);
        this.movementVector = new Vec2f(s, f).normalize();
    }
}
