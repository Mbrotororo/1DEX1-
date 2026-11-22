package com.onedex1.luma.glass

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.BlurMaskFilter
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** A built-in procedural wallpaper. [id] is used in settings as "preset:<id>". */
data class WallpaperPreset(val id: String, val title: String)

/**
 * Procedural, resolution independent wallpapers drawn with android.graphics (software canvas):
 * layered soft radial blobs, Apple-style wave "hills" with crest highlights and soft shadows,
 * a vignette and a fine monochrome grain (also kills gradient banding).
 *
 * The composition lives in a fixed 9:19.5 "design rect" that is center-cropped into the requested
 * size, so thumbnails of any aspect look exactly like the full-size wallpaper.
 * The same algorithm/numbers were prototyped and tuned in skia-python (identical Skia primitives).
 *
 * Thread-safe and pure: call from a background thread (a full-screen render takes ~100-250 ms).
 */
object Wallpapers {

    const val DEFAULT_ID: String = "ocean"

    val presets: List<WallpaperPreset> = listOf(
        WallpaperPreset("ocean", "Океан"),
        WallpaperPreset("aurora", "Сияние"),
        WallpaperPreset("sunset", "Закат"),
        WallpaperPreset("neon", "Неон"),
        WallpaperPreset("bunker", "Бункер"),
        WallpaperPreset("mono", "Графит"),
    )

    fun isKnown(id: String): Boolean = SPECS.containsKey(id)

    /** Renders preset [id] (unknown ids fall back to [DEFAULT_ID]) into a new ARGB_8888 bitmap. */
    fun render(id: String, width: Int, height: Int): Bitmap {
        val w = max(1, width)
        val h = max(1, height)
        val spec = SPECS[id] ?: SPECS.getValue(DEFAULT_ID)
        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(0xFF000000.toInt())

        val dw: Float
        val dh: Float
        if (w.toFloat() / h > DESIGN_ASPECT) {
            dw = w.toFloat(); dh = w / DESIGN_ASPECT
        } else {
            dw = h * DESIGN_ASPECT; dh = h.toFloat()
        }
        val ox = (w - dw) / 2f
        val oy = (h - dh) / 2f
        canvas.save()
        canvas.translate(ox, oy)
        for (layer in spec.layers) {
            when (layer) {
                is Linear -> drawLinear(canvas, layer, dw, dh, ox, oy, w, h)
                is Blob -> drawBlob(canvas, layer, dw, dh)
                is Wave -> drawWave(canvas, layer, dw, dh)
                is Hill -> drawHill(canvas, layer, dw, dh)
                is Vignette -> drawVignette(canvas, layer, dw, dh, ox, oy, w, h)
            }
        }
        canvas.restore()
        if (spec.grain > 0f) addGrain(bitmap, spec.grain)
        return bitmap
    }

    // ------------------------------------------------------------------------------------------
    // Layer model
    // ------------------------------------------------------------------------------------------

    private const val DESIGN_ASPECT = 9f / 19.5f
    private const val CURVE_STEPS = 64

    private enum class Blend { Over, Screen }

    private sealed interface Layer

    /** Full-rect linear gradient along [angle] degrees (90 = top to bottom). */
    private class Linear(val angle: Float, val colors: IntArray, val stops: FloatArray) : Layer

    /** Soft gaussian-like radial blob; position as fractions of the design rect, radius in design heights. */
    private class Blob(
        val cx: Float, val cy: Float, val r: Float, val rgb: Int, val alpha: Float,
        val sx: Float, val sy: Float, val rot: Float, val blend: Blend,
    ) : Layer

    /** Sine ribbon of thickness [thick] filled with a vertical gradient ca -> cb, blurred by [blur]. */
    private class Wave(
        val y: Float, val amp: Float, val length: Float, val phase: Float, val thick: Float,
        val ca: Int, val cb: Int, val blur: Float, val blend: Blend, val tilt: Float,
    ) : Layer

    /** Region below a sine crest down to the bottom, vertical gradient ctop -> cbot over [span]. */
    private class Hill(
        val y: Float, val amp: Float, val length: Float, val phase: Float,
        val ctop: Int, val cbot: Int, val span: Float, val blur: Float, val blend: Blend, val tilt: Float,
    ) : Layer

    private class Vignette(val strength: Float, val rgb: Int) : Layer

    private class Spec(val grain: Float, val layers: List<Layer>)

    private fun argb(rgb: Int, alpha: Float): Int =
        ((alpha.coerceIn(0f, 1f) * 255f).roundToInt() shl 24) or (rgb and 0xFFFFFF)

    private fun linear(angle: Float, colors: IntArray, stops: FloatArray): Layer = Linear(angle, colors, stops)

    private fun blob(
        cx: Float, cy: Float, r: Float, rgb: Int, alpha: Float,
        sx: Float = 1f, sy: Float = 1f, rot: Float = 0f, blend: Blend = Blend.Over,
    ): Layer = Blob(cx, cy, r, rgb, alpha, sx, sy, rot, blend)

    private fun wave(
        y: Float, amp: Float, length: Float, phase: Float, thick: Float, ca: Int, cb: Int, blur: Float,
        blend: Blend = Blend.Screen, tilt: Float = 0f,
    ): Layer = Wave(y, amp, length, phase, thick, ca, cb, blur, blend, tilt)

    private fun hill(
        y: Float, amp: Float, length: Float, phase: Float, ctop: Int, cbot: Int, span: Float, blur: Float,
        blend: Blend = Blend.Over, tilt: Float = 0f,
    ): Layer = Hill(y, amp, length, phase, ctop, cbot, span, blur, blend, tilt)

    private fun vignette(strength: Float, rgb: Int = 0x000000): Layer = Vignette(strength, rgb)

    // Gaussian-like falloff shared by every blob.
    private val BLOB_STOPS = floatArrayOf(0f, 0.12f, 0.25f, 0.38f, 0.5f, 0.62f, 0.75f, 0.88f, 1f)
    private val BLOB_ALPHA = FloatArray(BLOB_STOPS.size) { i ->
        val s = BLOB_STOPS[i]
        if (i == BLOB_STOPS.size - 1) 0f else (exp(-4.2f * s * s) * (1f - s.pow(6)))
    }

    private val Over = Blend.Over
    private val Screen = Blend.Screen

    // ------------------------------------------------------------------------------------------
    // Presets (generated from the tuned prototype -- keep in sync with proto/wall.py)
    // ------------------------------------------------------------------------------------------

    private val SPECS: Map<String, Spec> by lazy {
        mapOf(
            "ocean" to Spec(
                grain = 2.2f,
                layers = listOf(
                    linear(90.0f, intArrayOf(0xFF010838.toInt(), 0xFF021660.toInt(), 0xFF0636B4.toInt(), 0xFF03208A.toInt(), 0xFF010A40.toInt()), floatArrayOf(0.0f, 0.25f, 0.5f, 0.75f, 1.0f)),
                    blob(0.5f, 0.4f, 0.55f, 0x0D55F0, 0.95f, sx = 1.2f, sy = 0.95f, rot = 0.0f, blend = Over),
                    blob(0.58f, 0.36f, 0.3f, 0x3A8CFF, 0.7f, sx = 1.3f, sy = 0.8f, rot = 0.0f, blend = Screen),
                    blob(0.95f, 0.1f, 0.34f, 0x6A4DFF, 0.55f, sx = 1.0f, sy = 1.2f, rot = 0.0f, blend = Screen),
                    blob(0.04f, 0.06f, 0.3f, 0x020B4A, 0.85f, sx = 1.0f, sy = 1.0f, rot = 0.0f, blend = Over),
                    hill(0.47f, 0.035f, 1.55f, 3.6f, 0xD92F86FF.toInt(), 0x000B45D8, 0.16f, 0.006f, blend = Over, tilt = 0.1f),
                    wave(0.47f, 0.035f, 1.55f, 3.6f, 0.01f, 0xA6A8ECFF.toInt(), 0x005FC8FF, 0.003f, blend = Screen, tilt = 0.1f),
                    hill(0.572f, 0.04f, 1.25f, 0.7f, 0x8C000634.toInt(), 0x00000634, 0.05f, 0.016f, blend = Over, tilt = -0.12f),
                    hill(0.58f, 0.04f, 1.25f, 0.7f, 0xFF2470FF.toInt(), 0xFF0838C8.toInt(), 0.18f, 0.003f, blend = Over, tilt = -0.12f),
                    wave(0.58f, 0.04f, 1.25f, 0.7f, 0.012f, 0xD98AE2FF.toInt(), 0x003FA0FF, 0.003f, blend = Screen, tilt = -0.12f),
                    hill(0.692f, 0.035f, 1.05f, 2.4f, 0x8C000634.toInt(), 0x00000634, 0.05f, 0.016f, blend = Over, tilt = 0.07f),
                    hill(0.7f, 0.035f, 1.05f, 2.4f, 0xFF1258F0.toInt(), 0xFF04238C.toInt(), 0.2f, 0.003f, blend = Over, tilt = 0.07f),
                    wave(0.7f, 0.035f, 1.05f, 2.4f, 0.01f, 0xCC5AD6FF.toInt(), 0x002B8CFF, 0.003f, blend = Screen, tilt = 0.07f),
                    hill(0.822f, 0.03f, 1.4f, 4.4f, 0x8C000634.toInt(), 0x00000634, 0.05f, 0.016f, blend = Over, tilt = -0.05f),
                    hill(0.83f, 0.03f, 1.4f, 4.4f, 0xFF0838B0.toInt(), 0xFF020F4E.toInt(), 0.17f, 0.003f, blend = Over, tilt = -0.05f),
                    wave(0.83f, 0.03f, 1.4f, 4.4f, 0.008f, 0xB238BCFF.toInt(), 0x002B8CFF, 0.003f, blend = Screen, tilt = -0.05f),
                    blob(0.12f, 0.66f, 0.36f, 0x00C8FF, 0.32f, sx = 1.4f, sy = 0.7f, rot = -10.0f, blend = Screen),
                    blob(0.95f, 0.62f, 0.34f, 0x7A5CFF, 0.3f, sx = 1.0f, sy = 1.0f, rot = 0.0f, blend = Screen),
                    blob(0.5f, 1.0f, 0.3f, 0x00D8FF, 0.45f, sx = 1.9f, sy = 0.4f, rot = 0.0f, blend = Screen),
                    vignette(0.55f, 0x00031A),
                ),
            ),
            "aurora" to Spec(
                grain = 2.2f,
                layers = listOf(
                    linear(90.0f, intArrayOf(0xFF02040E.toInt(), 0xFF04102A.toInt(), 0xFF062238.toInt(), 0xFF031820.toInt(), 0xFF02080C.toInt()), floatArrayOf(0.0f, 0.3f, 0.55f, 0.8f, 1.0f)),
                    blob(0.8f, 0.16f, 0.42f, 0x7A3CFF, 0.55f, sx = 1.2f, sy = 0.9f, rot = 0.0f, blend = Screen),
                    blob(0.18f, 0.3f, 0.34f, 0xC23CFF, 0.3f, sx = 1.0f, sy = 1.0f, rot = 0.0f, blend = Screen),
                    wave(0.34f, 0.07f, 1.4f, 1.2f, 0.16f, 0x002BFFA8, 0xD92BFFA8.toInt(), 0.03f, blend = Screen, tilt = 0.18f),
                    wave(0.4f, 0.05f, 0.9f, 3.1f, 0.07f, 0x007DFFD4, 0x8CB8FFE6.toInt(), 0.01f, blend = Screen, tilt = 0.14f),
                    wave(0.5f, 0.06f, 1.7f, 0.2f, 0.12f, 0x0014D2FF, 0x8C14C8FF.toInt(), 0.028f, blend = Screen, tilt = -0.05f),
                    blob(0.4f, 0.46f, 0.38f, 0x10FF9A, 0.3f, sx = 1.6f, sy = 0.6f, rot = 12.0f, blend = Screen),
                    blob(0.5f, 1.02f, 0.42f, 0x06343A, 0.9f, sx = 1.6f, sy = 0.6f, rot = 0.0f, blend = Over),
                    wave(0.8f, 0.025f, 1.3f, 1.7f, 0.05f, 0x401BA67A, 0x000A3A40, 0.014f, blend = Screen, tilt = 0.0f),
                    vignette(0.6f, 0x000000),
                ),
            ),
            "sunset" to Spec(
                grain = 2.0f,
                layers = listOf(
                    linear(90.0f, intArrayOf(0xFF1E0A46.toInt(), 0xFF5A1A7A.toInt(), 0xFFC23C78.toInt(), 0xFFFF7A4A.toInt(), 0xFFFFB45E.toInt(), 0xFF8A2E5C.toInt()), floatArrayOf(0.0f, 0.22f, 0.45f, 0.63f, 0.76f, 1.0f)),
                    blob(0.62f, 0.66f, 0.3f, 0xFFD27A, 0.85f, sx = 1.3f, sy = 0.9f, rot = 0.0f, blend = Screen),
                    blob(0.62f, 0.66f, 0.12f, 0xFFF1C2, 0.75f, sx = 1.0f, sy = 1.0f, rot = 0.0f, blend = Screen),
                    blob(0.12f, 0.3f, 0.4f, 0xFF3C8E, 0.45f, sx = 1.1f, sy = 1.3f, rot = 0.0f, blend = Screen),
                    blob(0.95f, 0.12f, 0.38f, 0x3C1E9E, 0.75f, sx = 1.0f, sy = 1.0f, rot = 0.0f, blend = Over),
                    wave(0.74f, 0.03f, 1.3f, 0.8f, 0.06f, 0x8CFFC28A.toInt(), 0x00FF6A5A, 0.012f, blend = Screen, tilt = -0.08f),
                    wave(0.8f, 0.025f, 0.95f, 2.6f, 0.12f, 0x006A1E6E, 0xD93A0E4E.toInt(), 0.016f, blend = Over, tilt = 0.05f),
                    wave(0.87f, 0.03f, 1.5f, 4.2f, 0.2f, 0x002A0A3E, 0xF21A0630.toInt(), 0.018f, blend = Over, tilt = -0.04f),
                    vignette(0.35f, 0x12031E),
                ),
            ),
            "neon" to Spec(
                grain = 2.4f,
                layers = listOf(
                    linear(90.0f, intArrayOf(0xFF07021A.toInt(), 0xFF120530.toInt(), 0xFF0A0322.toInt(), 0xFF03010C.toInt()), floatArrayOf(0.0f, 0.4f, 0.75f, 1.0f)),
                    blob(0.12f, 0.26f, 0.4f, 0xFF1F8E, 0.75f, sx = 1.0f, sy = 1.25f, rot = 0.0f, blend = Screen),
                    blob(0.9f, 0.56f, 0.42f, 0x00E5FF, 0.65f, sx = 1.0f, sy = 1.3f, rot = 0.0f, blend = Screen),
                    blob(0.42f, 0.86f, 0.36f, 0x8A2BFF, 0.7f, sx = 1.4f, sy = 0.8f, rot = 0.0f, blend = Screen),
                    wave(0.44f, 0.06f, 1.1f, 0.4f, 0.012f, 0xF2FF4FD8.toInt(), 0x00FF4FD8, 0.004f, blend = Screen, tilt = 0.2f),
                    wave(0.47f, 0.06f, 1.1f, 0.9f, 0.04f, 0x73FF2FA0, 0x00FF2FA0, 0.022f, blend = Screen, tilt = 0.2f),
                    wave(0.6f, 0.05f, 1.3f, 2.9f, 0.012f, 0xF25BF6FF.toInt(), 0x005BF6FF, 0.004f, blend = Screen, tilt = -0.16f),
                    wave(0.63f, 0.05f, 1.3f, 3.4f, 0.04f, 0x7318C8FF, 0x0018C8FF, 0.022f, blend = Screen, tilt = -0.16f),
                    vignette(0.55f, 0x000000),
                ),
            ),
            "bunker" to Spec(
                grain = 3.2f,
                layers = listOf(
                    linear(90.0f, intArrayOf(0xFF030606.toInt(), 0xFF050B0A.toInt(), 0xFF07110F.toInt(), 0xFF040807.toInt(), 0xFF020303.toInt()), floatArrayOf(0.0f, 0.3f, 0.6f, 0.85f, 1.0f)),
                    blob(0.52f, -0.02f, 0.5f, 0x2E6E64, 0.42f, sx = 0.55f, sy = 1.3f, rot = 0.0f, blend = Screen),
                    blob(0.52f, 0.02f, 0.16f, 0x9FE8D6, 0.22f, sx = 0.8f, sy = 0.8f, rot = 0.0f, blend = Screen),
                    blob(0.28f, 0.6f, 0.45f, 0x1B544A, 0.4f, sx = 1.6f, sy = 0.55f, rot = -8.0f, blend = Screen),
                    blob(0.82f, 0.34f, 0.32f, 0x123C46, 0.4f, sx = 1.2f, sy = 0.8f, rot = 0.0f, blend = Screen),
                    hill(0.62f, 0.02f, 1.7f, 1.0f, 0x8C1E4F47.toInt(), 0x000A1A18, 0.12f, 0.02f, blend = Over, tilt = 0.04f),
                    wave(0.62f, 0.02f, 1.7f, 1.0f, 0.01f, 0x385FB5A0, 0x002B6A5E, 0.006f, blend = Screen, tilt = 0.04f),
                    hill(0.76f, 0.025f, 1.2f, 3.0f, 0xFF0B1614.toInt(), 0xFF030505.toInt(), 0.14f, 0.01f, blend = Over, tilt = -0.05f),
                    wave(0.76f, 0.025f, 1.2f, 3.0f, 0.008f, 0x2E4FA894, 0x002B6A5E, 0.005f, blend = Screen, tilt = -0.05f),
                    blob(0.7f, 0.88f, 0.3f, 0x174A40, 0.25f, sx = 1.6f, sy = 0.5f, rot = 0.0f, blend = Screen),
                    vignette(0.85f, 0x000000),
                ),
            ),
            "mono" to Spec(
                grain = 2.0f,
                layers = listOf(
                    linear(90.0f, intArrayOf(0xFF16181D.toInt(), 0xFF2A2D35.toInt(), 0xFF22252B.toInt(), 0xFF0E0F12.toInt()), floatArrayOf(0.0f, 0.35f, 0.65f, 1.0f)),
                    blob(0.78f, 0.2f, 0.42f, 0x9AA3B5, 0.32f, sx = 1.1f, sy = 1.2f, rot = 0.0f, blend = Screen),
                    blob(0.15f, 0.48f, 0.36f, 0x5E6A80, 0.28f, sx = 1.4f, sy = 0.8f, rot = 0.0f, blend = Screen),
                    hill(0.52f, 0.04f, 1.35f, 0.9f, 0xCC6E7686.toInt(), 0x003A3F49, 0.14f, 0.006f, blend = Over, tilt = 0.1f),
                    wave(0.52f, 0.04f, 1.35f, 0.9f, 0.01f, 0x8CE8EEF8.toInt(), 0x00FFFFFF, 0.003f, blend = Screen, tilt = 0.1f),
                    hill(0.632f, 0.04f, 1.05f, 2.2f, 0x73000000, 0x00000000, 0.05f, 0.016f, blend = Over, tilt = -0.08f),
                    hill(0.64f, 0.04f, 1.05f, 2.2f, 0xFF3C414B.toInt(), 0xFF23262C.toInt(), 0.18f, 0.003f, blend = Over, tilt = -0.08f),
                    wave(0.64f, 0.04f, 1.05f, 2.2f, 0.01f, 0x8CC9D2E0.toInt(), 0x00FFFFFF, 0.003f, blend = Screen, tilt = -0.08f),
                    hill(0.772f, 0.035f, 1.6f, 4.1f, 0x73000000, 0x00000000, 0.05f, 0.016f, blend = Over, tilt = 0.05f),
                    hill(0.78f, 0.035f, 1.6f, 4.1f, 0xFF1E2126.toInt(), 0xFF0E0F12.toInt(), 0.17f, 0.003f, blend = Over, tilt = 0.05f),
                    wave(0.78f, 0.035f, 1.6f, 4.1f, 0.008f, 0x739AA6B8, 0x00FFFFFF, 0.003f, blend = Screen, tilt = 0.05f),
                    vignette(0.5f, 0x000000),
                ),
            ),
        )
    }

    // ------------------------------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------------------------------

    private fun paint(blend: Blend): Paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
        if (blend == Blend.Screen) xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
    }

    private fun drawLinear(c: Canvas, l: Linear, dw: Float, dh: Float, ox: Float, oy: Float, w: Int, h: Int) {
        val rad = l.angle * (PI.toFloat() / 180f)
        val dx = cos(rad)
        val dy = sin(rad)
        val half = (abs(dx) * dw + abs(dy) * dh) / 2f
        val cx = dw / 2f
        val cy = dh / 2f
        val p = paint(Blend.Over)
        p.shader = LinearGradient(
            cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half,
            l.colors, l.stops, Shader.TileMode.CLAMP,
        )
        c.drawRect(-ox, -oy, -ox + w, -oy + h, p)
    }

    private fun drawBlob(c: Canvas, b: Blob, dw: Float, dh: Float) {
        if (b.alpha <= 0f) return
        val cx = b.cx * dw
        val cy = b.cy * dh
        val r = b.r * dh
        if (r < 0.5f) return
        val base = argb(b.rgb, b.alpha)
        val baseA = (base ushr 24) and 0xFF
        val colors = IntArray(BLOB_STOPS.size) { i ->
            ((baseA * BLOB_ALPHA[i]).roundToInt().coerceIn(0, 255) shl 24) or (base and 0xFFFFFF)
        }
        val shader = RadialGradient(cx, cy, r, colors, BLOB_STOPS, Shader.TileMode.CLAMP)
        val m = Matrix()
        m.setScale(b.sx, b.sy, cx, cy)
        m.postRotate(b.rot, cx, cy)
        shader.setLocalMatrix(m)
        val p = paint(b.blend)
        p.shader = shader
        val ext = r * max(b.sx, b.sy)
        c.drawRect(cx - ext, cy - ext, cx + ext, cy + ext, p)
    }

    private fun crestY(x: Float, yb: Float, a: Float, lw: Float, phase: Float, tilt: Float, dw: Float): Float {
        val t = 2f * PI.toFloat() * x / lw + phase
        return yb + a * sin(t) + tilt * (x - dw / 2f)
    }

    private fun blurFilter(radius: Float): BlurMaskFilter? =
        if (radius > 0.5f) BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL) else null

    private fun drawWave(c: Canvas, l: Wave, dw: Float, dh: Float) {
        val yb = l.y * dh
        val a = l.amp * dh
        val lw = l.length * dw
        val th = l.thick * dh
        val pad = l.blur * dh * 3f + 4f
        val x0 = -pad
        val x1 = dw + pad
        val path = Path()
        for (i in 0..CURVE_STEPS) {
            val x = x0 + (x1 - x0) * i / CURVE_STEPS
            val y = crestY(x, yb, a, lw, l.phase, l.tilt, dw)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        for (i in CURVE_STEPS downTo 0) {
            val x = x0 + (x1 - x0) * i / CURVE_STEPS
            val t = 2f * PI.toFloat() * x / lw + l.phase
            val y = crestY(x, yb, a, lw, l.phase, l.tilt, dw) + th * (0.75f + 0.25f * sin(t * 0.5f + 1.3f))
            path.lineTo(x, y)
        }
        path.close()
        val ext = abs(l.tilt) * dw / 2f
        val p = paint(l.blend)
        p.shader = LinearGradient(0f, yb - a - ext, 0f, yb + a + th + ext, l.ca, l.cb, Shader.TileMode.CLAMP)
        p.maskFilter = blurFilter(l.blur * dh)
        c.drawPath(path, p)
    }

    private fun drawHill(c: Canvas, l: Hill, dw: Float, dh: Float) {
        val yb = l.y * dh
        val a = l.amp * dh
        val lw = l.length * dw
        val pad = l.blur * dh * 3f + 4f
        val x0 = -pad
        val x1 = dw + pad
        val path = Path()
        for (i in 0..CURVE_STEPS) {
            val x = x0 + (x1 - x0) * i / CURVE_STEPS
            val y = crestY(x, yb, a, lw, l.phase, l.tilt, dw)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.lineTo(x1, dh + pad)
        path.lineTo(x0, dh + pad)
        path.close()
        val p = paint(l.blend)
        p.shader = LinearGradient(0f, yb - a, 0f, yb + l.span * dh, l.ctop, l.cbot, Shader.TileMode.CLAMP)
        p.maskFilter = blurFilter(l.blur * dh)
        c.drawPath(path, p)
    }

    private fun drawVignette(c: Canvas, v: Vignette, dw: Float, dh: Float, ox: Float, oy: Float, w: Int, h: Int) {
        val cx = dw / 2f
        val cy = dh * 0.46f
        val r = hypot(dw, dh) * 0.62f
        val colors = intArrayOf(
            argb(v.rgb, 0f), argb(v.rgb, 0f), argb(v.rgb, v.strength * 0.35f), argb(v.rgb, v.strength),
        )
        val p = paint(Blend.Over)
        p.shader = RadialGradient(cx, cy, r, colors, floatArrayOf(0f, 0.45f, 0.75f, 1f), Shader.TileMode.CLAMP)
        c.drawRect(-ox, -oy, -ox + w, -oy + h, p)
    }

    /** Monochrome triangular-distributed grain of +-[amount] levels; also dithers gradient banding. */
    private fun addGrain(bitmap: Bitmap, amount: Float) {
        val w = bitmap.width
        val h = bitmap.height
        val row = IntArray(w)
        var seed = 0x2545F491
        val scale = amount / 16777216f
        for (y in 0 until h) {
            bitmap.getPixels(row, 0, w, 0, y, w, 1)
            for (x in 0 until w) {
                // xorshift32, two uniforms -> triangular noise in [-amount, amount]
                seed = seed xor (seed shl 13); seed = seed xor (seed ushr 17); seed = seed xor (seed shl 5)
                val u1 = (seed ushr 8)
                seed = seed xor (seed shl 13); seed = seed xor (seed ushr 17); seed = seed xor (seed shl 5)
                val u2 = (seed ushr 8)
                val n = (u1 + u2 - 16777216) * scale + 0.5f
                val c = row[x]
                val r = ((c shr 16 and 0xFF) + n).toInt().coerceIn(0, 255)
                val g = ((c shr 8 and 0xFF) + n).toInt().coerceIn(0, 255)
                val b = ((c and 0xFF) + n).toInt().coerceIn(0, 255)
                row[x] = (c and -0x1000000) or (r shl 16) or (g shl 8) or b
            }
            bitmap.setPixels(row, 0, w, 0, y, w, 1)
        }
    }
}
