package ru.onedex.newyear.gui;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.AddressMode;
import com.mojang.blaze3d.textures.FilterMode;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;
import ru.onedex.newyear.NewYearClient;

import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.GlyphVector;
import java.awt.font.TextAttribute;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * Smooth UI text like in modern launchers: Inter glyphs are rasterized with high-quality grayscale
 * anti-aliasing (Java2D) into an atlas for the exact pixel size, sampled with linear filtering
 * (so text stays smooth while panels animate and scale) and laid out with real kerning.
 */
final class GlyphFont {
    private GlyphFont() {}

    private static final String[] FILES = {"inter_medium.ttf", "inter_semibold.ttf", "inter_bold.ttf"};
    private static final Font[] BASE = new Font[3];
    private static boolean failed;

    record Glyph(int u, int v, int w, int h, int xoff, int yoff, float adv) {
    }

    static final class Atlas {
        Identifier id;
        int texW, texH;
        /** Sub-pixel positions per glyph (each glyph is rasterized shifted by 1/phases of a pixel). */
        int phases = 1;
        final Map<Character, Glyph> glyphs = new HashMap<>();
        final Map<Integer, Glyph> shifted = new HashMap<>();
        final Map<Integer, Float> kerning = new HashMap<>();
        float capHeight;
        Font font;
        FontRenderContext frc;
        Glyph fallback;

        Glyph glyph(char c) {
            Glyph g = glyphs.get(c);
            return g != null ? g : fallback;
        }

        /** The glyph rasterized {@code phase / phases} of a pixel to the right. */
        Glyph glyph(char c, int phase) {
            if (phase == 0) return glyph(c);
            Glyph g = shifted.get(c * 8 + phase);
            return g != null ? g : glyph(c);
        }

        float kern(char a, char b) {
            int key = (a << 16) | b;
            Float k = kerning.get(key);
            if (k == null) {
                try {
                    char[] pair = {a, b};
                    GlyphVector gv = font.layoutGlyphVector(frc, pair, 0, 2, Font.LAYOUT_LEFT_TO_RIGHT);
                    float pairAdv = (float) gv.getGlyphPosition(1).getX();
                    Glyph ga = glyphs.get(a);
                    k = ga == null ? 0f : pairAdv - ga.adv;
                } catch (Throwable t) {
                    k = 0f;
                }
                kerning.put(key, k);
            }
            return k;
        }
    }

    private static final Map<Integer, Atlas> ATLASES = new HashMap<>();

    private static String charset() {
        StringBuilder sb = new StringBuilder();
        for (char c = 32; c < 127; c++) sb.append(c);
        for (char c = 0xA0; c <= 0xFF; c++) sb.append(c);
        for (char c = 0x400; c <= 0x45F; c++) sb.append(c);
        sb.append("Ґґ–—‘’“”…•·№●✓✔×←→♪♫");
        return sb.toString();
    }

    private static Font base(int weight) {
        if (BASE[weight] != null || failed) return BASE[weight];
        try {
            Path p = FabricLoader.getInstance().getModContainer("dexnewyear").orElseThrow()
                    .findPath("assets/dexnewyear/font/" + FILES[weight]).orElseThrow();
            try (InputStream in = Files.newInputStream(p)) {
                Map<TextAttribute, Object> attrs = new HashMap<>();
                attrs.put(TextAttribute.KERNING, TextAttribute.KERNING_ON);
                BASE[weight] = Font.createFont(Font.TRUETYPE_FONT, in).deriveFont(attrs);
            }
        } catch (Throwable t) {
            NewYearClient.LOGGER.error("Failed to load UI font", t);
            failed = true;
        }
        return BASE[weight];
    }

    /** Atlas for a weight (0 medium, 1 semibold, 2 bold) at a pixel size, or null if fonts are unavailable. */
    static Atlas get(int weight, int px) {
        int key = weight * 1000 + px;
        Atlas a = ATLASES.get(key);
        if (a != null || failed) return a;
        Font b = base(weight);
        if (b == null) return null;
        a = build(b.deriveFont((float) px), px);
        ATLASES.put(key, a);
        return a;
    }

    private static Atlas build(Font font, int px) {
        Atlas atlas = new Atlas();
        atlas.font = font;
        atlas.frc = new FontRenderContext(null, RenderingHints.VALUE_TEXT_ANTIALIAS_ON, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        // Glyphs are placed with quarter-pixel precision: snapping every letter to whole pixels
        // breaks the spacing of small text (e.g. "Ye ar" instead of "Year").
        atlas.phases = px <= 48 ? 4 : 1;
        String chars = charset();
        int n = chars.length() * atlas.phases;
        int pad = 2;
        // measure
        Rectangle[] bounds = new Rectangle[n];
        GlyphVector[] gvs = new GlyphVector[n];
        long area = 0;
        for (int i = 0; i < n; i++) {
            char c = chars.charAt(i / atlas.phases);
            float frac = (i % atlas.phases) / (float) atlas.phases;
            GlyphVector gv = font.createGlyphVector(atlas.frc, String.valueOf(c));
            Rectangle r = gv.getPixelBounds(atlas.frc, frac, 0);
            gvs[i] = gv;
            bounds[i] = r;
            area += (long) (Math.max(1, r.width) + pad) * (Math.max(1, r.height) + pad);
        }
        int texW = Math.max(64, Integer.highestOneBit((int) Math.ceil(Math.sqrt(area * 1.15)) - 1) << 1);
        int x = pad, y = pad, rowH = 0;
        int[][] pos = new int[n][2];
        for (int i = 0; i < n; i++) {
            Rectangle r = bounds[i];
            int w = Math.max(1, r.width), h = Math.max(1, r.height);
            if (x + w + pad > texW) {
                x = pad;
                y += rowH + pad;
                rowH = 0;
            }
            pos[i][0] = x;
            pos[i][1] = y;
            x += w + pad;
            rowH = Math.max(rowH, h);
        }
        int texH = Math.max(16, Integer.highestOneBit(y + rowH + pad - 1) << 1);
        // rasterize
        BufferedImage img = new BufferedImage(texW, texH, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.setColor(java.awt.Color.WHITE);
        for (int i = 0; i < n; i++) {
            char c = chars.charAt(i / atlas.phases);
            int phase = i % atlas.phases;
            float frac = phase / (float) atlas.phases;
            Rectangle r = bounds[i];
            g.drawGlyphVector(gvs[i], pos[i][0] - r.x + frac, pos[i][1] - r.y);
            float adv = gvs[i].getGlyphMetrics(0).getAdvanceX();
            Glyph gl = new Glyph(pos[i][0], pos[i][1], r.width, r.height, r.x, r.y, adv);
            if (phase == 0) atlas.glyphs.put(c, gl);
            else atlas.shifted.put(c * 8 + phase, gl);
        }
        g.dispose();
        atlas.fallback = atlas.glyphs.get('?');
        Rectangle cap = font.createGlyphVector(atlas.frc, "H").getPixelBounds(atlas.frc, 0, 0);
        atlas.capHeight = -cap.y;
        // upload: white glyphs, coverage in alpha (with a slight boost so thin strokes stay solid)
        NativeImage ni = new NativeImage(texW, texH, false);
        for (int yy = 0; yy < texH; yy++) {
            for (int xx = 0; xx < texW; xx++) {
                int a = (img.getRGB(xx, yy) >>> 24) & 255;
                if (a > 0) a = Math.min(255, Math.round((float) Math.pow(a / 255f, 0.86) * 255));
                ni.setColorArgb(xx, yy, (a << 24) | 0xFFFFFF);
            }
        }
        atlas.texW = texW;
        atlas.texH = texH;
        atlas.id = Identifier.of("dexnewyear", "dyn/font_" + px + "_" + System.identityHashCode(atlas));
        final String name = "dexnewyear font " + px;
        NativeImageBackedTexture tex = new NativeImageBackedTexture(() -> name, ni) {
            {
                this.sampler = RenderSystem.getSamplerCache().get(AddressMode.CLAMP_TO_EDGE, AddressMode.CLAMP_TO_EDGE, FilterMode.LINEAR, FilterMode.LINEAR, false);
            }
        };
        MinecraftClient.getInstance().getTextureManager().registerTexture(atlas.id, tex);
        return atlas;
    }
}
