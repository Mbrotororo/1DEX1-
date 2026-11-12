package ru.onedex.pvpai.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import ru.onedex.pvpai.gui.MenuScreen;

/** While the 1DEX1 menu is open, use a cheap low-resolution blur instead of the vanilla full-screen one. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    private static final Identifier DEXPVPAI_BLUR = Identifier.of("dexpvpai", "menu_blur");
    private static final Identifier DEXPVPAI_BLUR_FADE = Identifier.of("dexpvpai", "menu_blur_fade");

    @ModifyArg(method = "renderBlur", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/gl/ShaderLoader;loadPostEffect(Lnet/minecraft/util/Identifier;Ljava/util/Set;)Lnet/minecraft/client/gl/PostEffectProcessor;"), index = 0)
    private Identifier dexpvpai$cheapBlur(Identifier id) {
        if (MinecraftClient.getInstance().currentScreen instanceof MenuScreen menu) {
            // fade variant only while opening/closing, the cheaper one when fully open
            return menu.blurRadius() >= 10 ? DEXPVPAI_BLUR : DEXPVPAI_BLUR_FADE;
        }
        return id;
    }
}
