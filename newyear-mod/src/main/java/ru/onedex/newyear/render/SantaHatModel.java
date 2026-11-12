package ru.onedex.newyear.render;

import net.minecraft.client.model.Dilation;
import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.entity.model.EntityModelPartNames;
import net.minecraft.client.render.entity.model.PlayerEntityModel;

/** Santa hat attached to the player's head (same approach as vanilla deadmau5 ears). */
public class SantaHatModel extends PlayerEntityModel {
    public SantaHatModel(boolean overHelmet) {
        super(data(overHelmet).createModel(), false);
    }

    private static TexturedModelData data(boolean overHelmet) {
        ModelData md = PlayerEntityModel.getTexturedModelData(Dilation.NONE, false);
        ModelPartData root = md.getRoot().resetChildrenParts();
        ModelPartData head = root.getChild(EntityModelPartNames.HEAD);
        // over a helmet the hat sits higher and is a bit bigger
        float lift = overHelmet ? -1.4f : 0f;
        float grow = overHelmet ? 1.05f : 0f;
        head.addChild("ny_brim", ModelPartBuilder.create().uv(0, 0)
                .cuboid(-4.5f, -9.0f, -4.5f, 9, 2, 9, new Dilation(0.3f + grow)), ModelTransform.origin(0, lift, 0));
        ModelPartData c1 = head.addChild("ny_cone1", ModelPartBuilder.create().uv(0, 12)
                .cuboid(-4f, -3f, -4f, 8, 3, 8, new Dilation(0.05f + grow * 0.8f)), ModelTransform.of(0, -9f + lift - grow, 0.3f, -0.1f, 0, 0));
        // the tip flops backwards like a real Santa hat
        ModelPartData c2 = c1.addChild("ny_cone2", ModelPartBuilder.create().uv(0, 24)
                .cuboid(-3f, -2.5f, -3f, 6, 3, 6, new Dilation(grow * 0.6f)), ModelTransform.of(0, -2.6f - grow * 0.6f, 0.5f, -0.55f, 0, 0));
        ModelPartData c3 = c2.addChild("ny_cone3", ModelPartBuilder.create().uv(0, 34)
                .cuboid(-2f, -2.5f, -2f, 4, 3, 4, new Dilation(grow * 0.4f)), ModelTransform.of(0, -2.2f - grow * 0.4f, 0.4f, -0.7f, 0, 0));
        ModelPartData c4 = c3.addChild("ny_cone4", ModelPartBuilder.create().uv(0, 42)
                .cuboid(-1f, -2.5f, -1f, 2, 3, 2, new Dilation(grow * 0.25f)), ModelTransform.of(0, -2.2f, 0.3f, -0.75f, 0, 0));
        c4.addChild("ny_pompom", ModelPartBuilder.create().uv(40, 0)
                .cuboid(-1.5f, -2.0f, -1.5f, 3, 3, 3, new Dilation(0.25f + grow * 0.2f)), ModelTransform.origin(0, -2.6f, 0));
        return TexturedModelData.of(md, 64, 64);
    }
}
