package ru.onedex.newyear.mixin;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.TitleBackground;

/** Main menu (and other menus outside a world): New Year picture instead of the panorama, above any resource pack. */
@Mixin(Screen.class)
public abstract class ScreenBackgroundMixin {
    @Shadow
    public int width;
    @Shadow
    public int height;

    @Inject(method = "renderPanoramaBackground", at = @At("HEAD"), cancellable = true)
    private void dexnewyear$background(DrawContext context, float deltaTicks, CallbackInfo ci) {
        if (!NyConfig.INSTANCE.titleBackground) return;
        if (TitleBackground.render(context, width, height)) ci.cancel();
    }
}
