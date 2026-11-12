package ru.onedex.pvpai.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import ru.onedex.pvpai.gui.MenuScreen;

/**
 * While the 1DEX1 menu is open, replace the vanilla full-screen blur with the glass effect:
 * a cheap low-resolution blur shown only under the menu panels.
 */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    private static final Identifier DEXPVPAI_GLASS = Identifier.of("dexpvpai", "menu_glass");

    @ModifyArg(method = "renderBlur", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/gl/ShaderLoader;loadPostEffect(Lnet/minecraft/util/Identifier;Ljava/util/Set;)Lnet/minecraft/client/gl/PostEffectProcessor;"), index = 0)
    private Identifier dexpvpai$glass(Identifier id) {
        return MinecraftClient.getInstance().currentScreen instanceof MenuScreen ? DEXPVPAI_GLASS : id;
    }
}
