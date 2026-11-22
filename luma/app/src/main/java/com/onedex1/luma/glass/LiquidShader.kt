package com.onedex1.luma.glass

import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * AGSL source of the Liquid Glass backdrop shader.
 *
 * Coordinate space: the shader is evaluated in GlassRoot coordinates (px). The caller translates the
 * canvas by -origin and draws the rounded rect at [origin, origin + size], so `fragCoord` is a root
 * coordinate and `backdrop` (a BitmapShader whose local matrix maps the blurred bitmap onto the
 * center-cropped root) can be sampled directly.
 *
 * Uniforms (all must be set on every draw):
 *  - origin      float2  top-left of the surface in root px
 *  - size        float2  surface size px
 *  - radius      float   corner radius px (already clamped to min(w,h)/2)
 *  - band        float   width of the refracting rim band px (<= radius)
 *  - refraction  float   0..1 strength of the lens displacement
 *  - lightDir    float2  unit vector pointing TOWARDS the light, screen space (y down)
 *  - edge        float   0..1 rim light brightness
 *  - saturation  float   backdrop saturation multiplier (1 = unchanged)
 *  - rimWidth    float   width of the thin specular rim px
 *  - tint        float4  tint rgb (0..1) + tint alpha, applied after the saturation: neutral tints mix in
 *                        (c + (rgb - c) * a), strongly coloured ones multiply (c * (1 - a + 2a*rgb) + 0.35a*rgb),
 *                        blended by the tint's chroma (smoothstep 0.25..0.6) -- see tintChromaMix()
 *
 * Lens profile: inside the rim band the sample is pulled inwards by shift = R * band * 0.5 * t^2
 * (t = 1 at the rim, 0 at the inner edge of the band). The sampled depth e + shift has slope
 * 1 - R*t >= 0, so the image never folds back (no mirrored copies) for any strength R in 0..1.
 *
 * This exact text is compiled by skia-python (SkSL) in the preview harness; it is written in the
 * common subset of AGSL and SkSL: explicit float/half conversions, no arrays, no loops; child results are
 * stored in variables before swizzling. It also compiles on Android's own Skia (Robolectric native
 * graphics, API 35). Pre-release Skia snapshots only knew `sample(child, p)` instead of `child.eval(p)`;
 * [createLiquidShaderOrNull] falls back to [LIQUID_GLASS_AGSL_LEGACY] if the main source is rejected.
 * NOTE: never put a dollar sign in this raw string (Kotlin template).
 */
internal const val LIQUID_GLASS_AGSL: String = """
uniform shader backdrop;
uniform float2 origin;
uniform float2 size;
uniform float radius;
uniform float band;
uniform float refraction;
uniform float2 lightDir;
uniform float edge;
uniform float saturation;
uniform float rimWidth;
uniform float4 tint;

float sdRoundRect(float2 p, float2 b, float r) {
    float2 q = abs(p) - b + float2(r, r);
    return min(max(q.x, q.y), 0.0) + length(max(q, float2(0.0, 0.0))) - r;
}

float2 sdNormal(float2 p, float2 b, float r) {
    float2 q = abs(p) - b + float2(r, r);
    float2 n = float2(0.0, 1.0);
    if (q.x > 0.0 && q.y > 0.0) {
        n = normalize(q);
    } else if (q.x > q.y) {
        n = float2(1.0, 0.0);
    }
    float sx = p.x < 0.0 ? -1.0 : 1.0;
    float sy = p.y < 0.0 ? -1.0 : 1.0;
    return float2(n.x * sx, n.y * sy);
}

half4 main(float2 fragCoord) {
    float2 halfSize = size * 0.5;
    float2 p = fragCoord - origin - halfSize;
    float d = sdRoundRect(p, halfSize, radius);
    float e = max(-d, 0.0);
    float2 n = sdNormal(p, halfSize, radius);

    float bw = max(band, 1.0);
    float t = clamp(1.0 - e / bw, 0.0, 1.0);
    float shift = refraction * bw * 0.5 * t * t;

    float3 c = float3(0.0, 0.0, 0.0);
    if (shift > 0.05) {
        float2 dir = -n * shift;
        float ca = 0.06 * refraction;
        half4 sr = backdrop.eval(fragCoord + dir * (1.0 + ca));
        half4 sg = backdrop.eval(fragCoord + dir);
        half4 sb = backdrop.eval(fragCoord + dir * (1.0 - ca));
        c = float3(float(sr.r), float(sg.g), float(sb.b));
    } else {
        half4 s0 = backdrop.eval(fragCoord);
        c = float3(float(s0.r), float(s0.g), float(s0.b));
    }

    float lum = dot(c, float3(0.2126, 0.7152, 0.0722));
    c = clamp(mix(float3(lum, lum, lum), c, saturation), 0.0, 1.0);
    float chroma = max(tint.r, max(tint.g, tint.b)) - min(tint.r, min(tint.g, tint.b));
    float stained = smoothstep(0.25, 0.6, chroma);
    float3 mixed = c + (tint.rgb - c) * tint.a;
    float3 multiplied = c * (1.0 - tint.a + tint.a * 2.0 * tint.rgb) + tint.rgb * (tint.a * 0.35);
    c = clamp(mix(mixed, multiplied, stained), 0.0, 1.0);

    float ndl = dot(n, lightDir);
    float lit = max(ndl, 0.0);
    float unlit = max(-ndl, 0.0);
    float rimT = clamp(1.0 - e / max(rimWidth, 0.5), 0.0, 1.0);
    float lit2 = lit * lit;
    float unlit2 = unlit * unlit;
    float rim = rimT * rimT * (1.0 * lit2 * lit2 + 0.55 * unlit2 * unlit2 + 0.10);
    float glow = t * t * (0.30 * lit2 + 0.14 * unlit2 + 0.05) * (0.35 + 0.65 * refraction);
    float light = clamp(edge * (rim + glow), 0.0, 1.0);
    c = c + (float3(1.0, 1.0, 1.0) - c) * light;

    float grain = fract(52.9829189 * fract(dot(fragCoord, float2(0.06711056, 0.00583715))));
    c = c + (grain - 0.5) / 255.0;
    return half4(half3(c), 1.0);
}
"""

/**
 * Thin wrapper around an API 33 [RuntimeShader] running [LIQUID_GLASS_AGSL].
 * Obtain it with [createLiquidShaderOrNull]. A single instance may be shared by every GlassSurface of
 * a GlassRoot: each draw sets ALL uniforms right before recording, and the recorded native shader is
 * an immutable snapshot of those uniforms, so later updates never leak into earlier draws.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class LiquidShader internal constructor(val shader: RuntimeShader) {

    private var boundInput: Shader? = null

    /** Binds the child backdrop shader (only when it changed) and sets every uniform. */
    fun update(
        input: Shader,
        originX: Float,
        originY: Float,
        width: Float,
        height: Float,
        radius: Float,
        band: Float,
        refraction: Float,
        lightX: Float,
        lightY: Float,
        edge: Float,
        saturation: Float,
        rimWidth: Float,
        tintR: Float,
        tintG: Float,
        tintB: Float,
        tintAlpha: Float,
    ) {
        if (input !== boundInput) {
            shader.setInputShader("backdrop", input)
            boundInput = input
        }
        shader.setFloatUniform("origin", originX, originY)
        shader.setFloatUniform("size", width, height)
        shader.setFloatUniform("radius", radius)
        shader.setFloatUniform("band", band)
        shader.setFloatUniform("refraction", refraction)
        shader.setFloatUniform("lightDir", lightX, lightY)
        shader.setFloatUniform("edge", edge)
        shader.setFloatUniform("saturation", saturation)
        shader.setFloatUniform("rimWidth", rimWidth)
        shader.setFloatUniform("tint", tintR, tintG, tintB, tintAlpha)
    }
}

/** Same shader with the legacy child-sampling syntax `sample(child, coord)` (old Skia snapshots). */
internal val LIQUID_GLASS_AGSL_LEGACY: String by lazy {
    LIQUID_GLASS_AGSL.replace("backdrop.eval(", "sample(backdrop, ")
}

/**
 * Compiles the liquid glass shader. Returns null below Android 13 or on any failure (driver, SkSL
 * compile error, OEM quirk) -- callers then use the plain (bitmap + color matrix) path.
 */
internal fun createLiquidShaderOrNull(): LiquidShader? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
    return compileLiquid(LIQUID_GLASS_AGSL) ?: compileLiquid(LIQUID_GLASS_AGSL_LEGACY)
}

private fun compileLiquid(source: String): LiquidShader? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
    return try {
        LiquidShader(RuntimeShader(source))
    } catch (t: Throwable) {
        null
    }
}

/** True when this device can run the liquid refraction shader (Android 13+). */
val isLiquidRefractionSupported: Boolean
    get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
