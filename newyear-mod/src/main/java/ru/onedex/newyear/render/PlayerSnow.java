package ru.onedex.newyear.render;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.model.Dilation;
import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.EntityModelPartNames;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.render.entity.state.PlayerEntityRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.Identifier;
import ru.onedex.newyear.config.NyConfig;

import java.util.HashMap;
import java.util.Map;

/** Players standing in the snowfall slowly get a white layer of snow on head and shoulders; running shakes it off. */
public final class PlayerSnow {
    private PlayerSnow() {}

    private static final Map<Integer, Float> amount = new HashMap<>();
    private static final Map<Integer, double[]> lastPos = new HashMap<>();

    public static float amount(int id) {
        return amount.getOrDefault(id, 0f);
    }

    public static void tick(MinecraftClient mc) {
        NyConfig c = NyConfig.INSTANCE;
        if (mc.world == null || mc.isPaused()) return;
        if (!c.playerSnow) {
            amount.clear();
            return;
        }
        for (AbstractClientPlayerEntity p : mc.world.getPlayers()) {
            int id = p.getId();
            double[] lp = lastPos.computeIfAbsent(id, k -> new double[]{p.getX(), p.getY(), p.getZ()});
            double dx = p.getX() - lp[0], dy = p.getY() - lp[1], dz = p.getZ() - lp[2];
            lp[0] = p.getX();
            lp[1] = p.getY();
            lp[2] = p.getZ();
            double speed = Math.sqrt(dx * dx + dz * dz);
            float a = amount.getOrDefault(id, 0f);
            boolean outside = mc.world.isSkyVisible(p.getBlockPos().up());
            float before = a;
            if (p.isSubmergedInWater() || p.isOnFire()) a = 0;
            else if (speed > 0.24 || dy > 0.25 || speed > 2) a -= 0.05f;      // running / jumping shakes the snow off
            else if (outside && c.snowfall) a += 1f / (20 * 45);             // ~45 s to be fully covered
            else a -= 1f / (20 * 30);                                        // melting under a roof
            a = Math.max(0, Math.min(1, a));
            if (before - a > 0.03f && before > 0.15f) {
                for (int i = 0; i < 4; i++) {
                    mc.world.addParticleClient(ParticleTypes.SNOWFLAKE, p.getX() + (p.getRandom().nextDouble() - 0.5) * 0.6,
                            p.getY() + 1.3 + p.getRandom().nextDouble() * 0.5, p.getZ() + (p.getRandom().nextDouble() - 0.5) * 0.6, 0, -0.05, 0);
                }
            }
            if (a <= 0) amount.remove(id);
            else amount.put(id, a);
        }
        if (amount.size() > 200) amount.clear();
    }

    /** Thin snow layers on the head and shoulders, moving with the model (sits on top of armor when worn). */
    public static class Model extends PlayerEntityModel {
        public Model(boolean head, boolean headArmor, boolean chestArmor) {
            super(data(head, headArmor, chestArmor).createModel(), false);
        }

        private static TexturedModelData data(boolean head, boolean headArmor, boolean chestArmor) {
            ModelData md = PlayerEntityModel.getTexturedModelData(Dilation.NONE, false);
            ModelPartData root = md.getRoot().resetChildrenParts();
            if (head) {
                root.getChild(EntityModelPartNames.HEAD).addChild("ny_snow_head", ModelPartBuilder.create().uv(0, 0)
                        .cuboid(-4f, headArmor ? -9.3f : -8.6f, -4f, 8, 1, 8, new Dilation(headArmor ? 1.15f : 0.55f)), ModelTransform.NONE);
            }
            float bd = chestArmor ? 1.15f : 0.3f, ad = chestArmor ? 1.2f : 0.4f;
            float by = chestArmor ? -1.3f : -0.6f, ay = chestArmor ? -3.3f : -2.6f;
            root.getChild(EntityModelPartNames.BODY).addChild("ny_snow_body", ModelPartBuilder.create().uv(0, 16)
                    .cuboid(-4f, by, -2f, 8, 1, 4, new Dilation(bd)), ModelTransform.NONE);
            root.getChild(EntityModelPartNames.RIGHT_ARM).addChild("ny_snow_rarm", ModelPartBuilder.create().uv(0, 32)
                    .cuboid(-3f, ay, -2f, 4, 1, 4, new Dilation(ad)), ModelTransform.NONE);
            root.getChild(EntityModelPartNames.LEFT_ARM).addChild("ny_snow_larm", ModelPartBuilder.create().uv(16, 32)
                    .cuboid(-1f, ay, -2f, 4, 1, 4, new Dilation(ad)), ModelTransform.NONE);
            return TexturedModelData.of(md, 64, 64);
        }
    }

    public static class Feature extends FeatureRenderer<PlayerEntityRenderState, PlayerEntityModel> {
        private static final Identifier TEXTURE = Identifier.of("dexnewyear", "textures/entity/player_snow.png");
        private final Model[] models = new Model[8];

        public Feature(FeatureRendererContext<PlayerEntityRenderState, PlayerEntityModel> context) {
            super(context);
        }

        private Model model(boolean head, boolean headArmor, boolean chestArmor) {
            int k = (head ? 4 : 0) | (headArmor ? 2 : 0) | (chestArmor ? 1 : 0);
            if (models[k] == null) models[k] = new Model(head, headArmor, chestArmor);
            return models[k];
        }

        @Override
        public void render(MatrixStack matrices, OrderedRenderCommandQueue queue, int light, PlayerEntityRenderState state, float limbAngle, float limbDistance) {
            if (!NyConfig.INSTANCE.playerSnow || state.invisible) return;
            float a = amount(state.id);
            if (a < 0.03f) return;
            int alpha = Math.round(Math.min(1f, a * 1.3f) * 235);
            int tint = (alpha << 24) | 0xFFFFFF;
            Model m = model(!SantaHatFeature.shows(state), !state.equippedHeadStack.isEmpty(), !state.equippedChestStack.isEmpty());
            queue.submitModel(m, state, matrices, RenderLayers.entityTranslucent(TEXTURE), light, OverlayTexture.DEFAULT_UV, tint, null, state.outlineColor, null);
        }
    }
}
