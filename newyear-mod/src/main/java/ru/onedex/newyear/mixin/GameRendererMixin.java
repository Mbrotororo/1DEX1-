package ru.onedex.newyear.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import ru.onedex.newyear.gui.NyMenuScreen;

/** Glass panels in the New Year menu: blur only under the panels. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    private static final Identifier DEXNEWYEAR_GLASS = Identifier.of("dexnewyear", "menu_glass");

    @ModifyArg(method = "renderBlur", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/gl/ShaderLoader;loadPostEffect(Lnet/minecraft/util/Identifier;Ljava/util/Set;)Lnet/minecraft/client/gl/PostEffectProcessor;"), index = 0)
    private Identifier dexnewyear$glass(Identifier id) {
        return MinecraftClient.getInstance().currentScreen instanceof NyMenuScreen ? DEXNEWYEAR_GLASS : id;
    }
}
