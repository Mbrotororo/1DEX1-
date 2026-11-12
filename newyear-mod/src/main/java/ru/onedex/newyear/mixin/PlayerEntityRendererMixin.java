package ru.onedex.newyear.mixin;

import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.state.PlayerEntityRenderState;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.render.Garland;

/** Blinking garland above the player's nickname; the nickname is lifted above the Santa hat. */
@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerEntityRendererMixin {
    @Inject(method = "updateRenderState(Lnet/minecraft/entity/PlayerLikeEntity;Lnet/minecraft/client/render/entity/state/PlayerEntityRenderState;F)V", at = @At("TAIL"))
    private void dexnewyear$liftLabel(net.minecraft.entity.PlayerLikeEntity entity, PlayerEntityRenderState state, float tickProgress, CallbackInfo ci) {
        if (state.nameLabelPos != null && ru.onedex.newyear.render.SantaHatFeature.shows(state)) {
            state.nameLabelPos = state.nameLabelPos.add(0, state.equippedHeadStack.isEmpty() ? 0.42 : 0.5, 0);
        }
    }

    @Inject(method = "renderLabelIfPresent(Lnet/minecraft/client/render/entity/state/PlayerEntityRenderState;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/command/OrderedRenderCommandQueue;Lnet/minecraft/client/render/state/CameraRenderState;)V", at = @At("TAIL"))
    private void dexnewyear$garland(PlayerEntityRenderState state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState camera, CallbackInfo ci) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.garlands || state.displayName == null || state.nameLabelPos == null) return;
        matrices.push();
        // just above the nickname
        int y = (state.extraEars ? -10 : 0) - 10;
        queue.submitLabel(matrices, state.nameLabelPos, y, Garland.text(state.id), !state.sneaking, state.light, state.squaredDistanceToCamera, camera);
        matrices.pop();
    }
}
