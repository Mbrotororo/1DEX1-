package ru.onedex.newyear.gui;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.AddressMode;
import com.mojang.blaze3d.textures.FilterMode;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;

import java.io.InputStream;

/** The cozy New Year picture used as the main menu background (drawn instead of the panorama). */
public final class TitleBackground {
    private TitleBackground() {}

    private static final Identifier SOURCE = Identifier.of("dexnewyear", "textures/gui/title_bg.png");
    private static final Identifier ID = Identifier.of("dexnewyear", "dyn/title_bg");
    private static int w, h;
    private static boolean failed;
    private static final long start = System.nanoTime();

    private static boolean ensure() {
        if (w > 0) return true;
        if (failed) return false;
        try (InputStream in = MinecraftClient.getInstance().getResourceManager().getResource(SOURCE).orElseThrow().getInputStream()) {
            NativeImage img = NativeImage.read(in);
            w = img.getWidth();
            h = img.getHeight();
            NativeImageBackedTexture tex = new NativeImageBackedTexture(() -> "dexnewyear title", img) {
                {
                    // smooth scaling instead of pixelated
                    this.sampler = RenderSystem.getSamplerCache().get(AddressMode.CLAMP_TO_EDGE, AddressMode.CLAMP_TO_EDGE, FilterMode.LINEAR, FilterMode.LINEAR, false);
                }
            };
            MinecraftClient.getInstance().getTextureManager().registerTexture(ID, tex);
            return true;
        } catch (Exception e) {
            failed = true;
            return false;
        }
    }

    public static boolean render(DrawContext ctx, int width, int height) {
        if (!ensure()) return false;
        // cover the screen, keep aspect ratio; a very slow drift makes it feel alive
        float t = (System.nanoTime() - start) / 1e9f;
        float zoom = 1.04f + 0.02f * (float) Math.sin(t * 0.07f);
        float scale = Math.max(width / (float) w, height / (float) h) * zoom;
        float dw = w * scale, dh = h * scale;
        float x = (width - dw) / 2f + (float) Math.sin(t * 0.05f) * width * 0.01f;
        float y = (height - dh) / 2f;
        ctx.getMatrices().pushMatrix();
        ctx.getMatrices().translate(x, y);
        ctx.getMatrices().scale(dw / w, dh / h);
        ctx.drawTexture(RenderPipelines.GUI_TEXTURED, ID, 0, 0, 0, 0, w, h, w, h, w, h, 0xFFFFFFFF);
        ctx.getMatrices().popMatrix();
        // warm glow from the fireplace that breathes a little
        float glow = 0.06f + 0.03f * (float) Math.sin(t * 2.3f) * (float) Math.sin(t * 1.7f);
        R2D.begin(ctx);
        R2D.gradientV(0, height * 0.45f, width, height * 0.55f, 0x00FF8A2A, R2D.withAlpha(0xFFFF8A2A, glow));
        return true;
    }
}
