package ru.onedex.newyear.render;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.render.entity.state.PlayerEntityRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import ru.onedex.newyear.config.NyConfig;

/** Renders a Santa hat on players (only on this client). */
public class SantaHatFeature extends FeatureRenderer<PlayerEntityRenderState, PlayerEntityModel> {
    private static final Identifier TEXTURE = Identifier.of("dexnewyear", "textures/entity/santa_hat.png");
    private final SantaHatModel normal = new SantaHatModel(false);
    private final SantaHatModel overHelmet = new SantaHatModel(true);

    public SantaHatFeature(FeatureRendererContext<PlayerEntityRenderState, PlayerEntityModel> context) {
        super(context);
    }

    /** Whether a hat is drawn for this player. */
    public static boolean shows(PlayerEntityRenderState state) {
        NyConfig c = NyConfig.INSTANCE;
        if (!c.hats || state.invisible) return false;
        MinecraftClient mc = MinecraftClient.getInstance();
        boolean me = mc.player != null && state.id == mc.player.getId();
        return me ? c.hatOnMe : c.hatOnOthers;
    }

    @Override
    public void render(MatrixStack matrices, OrderedRenderCommandQueue queue, int light, PlayerEntityRenderState state, float limbAngle, float limbDistance) {
        if (!shows(state)) return;
        SantaHatModel model = state.equippedHeadStack.isEmpty() ? normal : overHelmet;
        queue.submitModel(model, state, matrices, RenderLayers.entityCutoutNoCull(TEXTURE), light, OverlayTexture.DEFAULT_UV, state.outlineColor, null);
    }
}
