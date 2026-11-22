package com.onedex1.luma.glass

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.view.View
import androidx.annotation.RequiresApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.node.CompositionLocalConsumerModifierNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.GlobalPositionAwareModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.currentValueOf
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlinx.coroutines.delay

// =================================================================================================
// Public API
// =================================================================================================

/**
 * Look of a glass surface.
 * @param tint       tint colour (its alpha multiplies [tintAlpha])
 * @param tintAlpha  0..0.6 strength of the tint. Applied after [saturation]: neutral tints (white,
 *                   ice, black) are mixed in (c + (tint - c) * a: milky frost / smoked glass), strongly
 *                   coloured tints multiply like stained glass (c * (1 - a + 2a*tint) + 0.35a*tint);
 *                   tints in between blend the two by their chroma (see [tintChromaMix]).
 * @param edge       0..1 brightness of rim light, sheen and specular highlight
 * @param refraction 0..1 liquid lens refraction at the rim (Android 13+ only; 0 = off)
 * @param saturation backdrop saturation multiplier
 * @param heavy      sample the heavier-blurred backdrop (sheets, drawer, menus)
 * @param shadow     soft drop shadow under the surface
 */
@Immutable
data class GlassStyle(
    val tint: Color = Color.White,
    val tintAlpha: Float = 0.16f,
    val edge: Float = 0.75f,
    val refraction: Float = 0.55f,     // 0 = off
    val saturation: Float = 1.35f,
    val heavy: Boolean = false,        // use the heavier-blurred backdrop (sheets, drawer)
    val shadow: Boolean = true,
)

/** Default style for every GlassSurface below a GlassRoot (provided by GlassRoot). */
val LocalGlassStyle: ProvidableCompositionLocal<GlassStyle> = compositionLocalOf { GlassStyle() }

/** Smoothed device tilt (x, y in -1..1), see [rememberTilt]. Read `.value` in draw/graphicsLayer lambdas. */
val LocalGlassTilt: ProvidableCompositionLocal<State<Offset>> = staticCompositionLocalOf { ZeroOffsetState }

/** Current wallpaper backdrop (null while loading). */
val LocalGlassBackdrop: ProvidableCompositionLocal<State<Backdrop?>> = staticCompositionLocalOf { NullBackdropState }

/** Top-left of the GlassRoot in screen pixels (window offset included). */
val LocalGlassRootOffset: ProvidableCompositionLocal<State<Offset>> = staticCompositionLocalOf { ZeroOffsetState }

/**
 * Root of the glass world: draws the engine's sharp wallpaper full-size (center-crop), provides
 * [LocalGlassStyle] (= [style]), the backdrop, the tilt and the root offset to every [GlassSurface]
 * inside [content]. Fills the max size it is given (normally the whole window, edge-to-edge).
 *
 * The UI must feed the engine: `engine.setSource(settings.wallpaper)` and `engine.setBlur(settings.blur)`
 * (e.g. in a LaunchedEffect keyed on those values). If nothing was requested after ~0.5 s the default
 * wallpaper is loaded so the glass is never empty.
 */
@Composable
fun GlassRoot(
    engine: WallpaperEngine,
    style: GlassStyle,
    tiltEnabled: Boolean,
    content: @Composable () -> Unit,
) {
    val backdropState = engine.backdrop.collectAsState()
    val tilt = rememberTilt(tiltEnabled)
    val host = remember(backdropState, tilt) { GlassHost(backdropState, tilt) }
    val view = LocalView.current
    LaunchedEffect(engine) {
        delay(ENSURE_LOADED_DELAY_MS)
        engine.ensureLoaded()
    }
    CompositionLocalProvider(
        LocalGlassStyle provides style,
        LocalGlassHost provides host,
        LocalGlassBackdrop provides backdropState,
        LocalGlassTilt provides tilt,
        LocalGlassRootOffset provides host.rootOffset,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .onGloballyPositioned { host.onRootPositioned(it, view) }
                .drawBehind { host.drawWallpaper(this) },
        ) {
            content()
        }
    }
}

/**
 * A piece of Liquid Glass: soft shadow, the blurred wallpaper region exactly behind it (lens
 * refraction + rim light via AGSL on Android 13+, colour-matrix path below), tint, sheen, specular
 * highlight, then [content], then a crisp directional rim on top.
 *
 * Size it with [modifier]. [cornerRadius] is clamped to min(w, h) / 2 (=> capsule when large).
 * Content is NOT clipped (cheaper); add `Modifier.clip(RoundedCornerShape(..))` to scrolling content.
 * Position changes from layout/scroll/offset{} only redraw (no recomposition). Ancestor layer
 * transforms (graphicsLayer translation and uniform scale, e.g. press squish or a menu pop) are
 * followed as well: the glass measures its window-space scale and samples the matching region.
 * Must be inside a [GlassRoot] (outside it a plain translucent fill is drawn). Works inside
 * Popup/Dialog windows too (screen coordinates are used).
 *
 * The glass and its content each get their own render layer: position / tilt / backdrop changes
 * re-record only the glass itself, never the content or the enclosing layer (e.g. a scrolling
 * column of glass cards just moves its layers).
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 28.dp,         // clamp to min(w,h)/2 → capsule when big
    style: GlassStyle = LocalGlassStyle.current,
    content: @Composable BoxScope.() -> Unit = {},
) {
    Box(
        modifier = modifier
            .graphicsLayer { }            // own RenderNode for the glass: its invalidations stop here
            .liquidGlass(cornerRadius, style)
            .graphicsLayer { },           // content in a separate RenderNode, drawn by reference
        content = content,
    )
}

/**
 * Modifier form of [GlassSurface] (same drawing) for custom layouts. When [style] is null the
 * nearest [LocalGlassStyle] is used (read in the draw phase).
 */
fun Modifier.liquidGlass(cornerRadius: Dp = 28.dp, style: GlassStyle? = null): Modifier =
    this then LiquidGlassElement(cornerRadius, style)

// =================================================================================================
// Constants (mirrored 1:1 in the preview harness proto/glass.py)
// =================================================================================================

private const val ENSURE_LOADED_DELAY_MS = 500L
private const val LIGHT_X = -0.6f            // light comes from the top-left
private const val LIGHT_Y = -0.8f
private const val BAND_DP = 14f              // refracting rim band
private const val RIM_DP = 3f                // thin specular rim (shader)
private const val SHADOW_BLUR_DP = 22f
private const val SHADOW_DY_DP = 8f
private const val SHADOW_ALPHA = 0.22f
private const val SHADOW_LAYERS = 6          // pre-P approximation
private const val TILT_LIGHT_X = 0.55f
private const val TILT_LIGHT_Y = 0.45f

private object ZeroOffsetState : State<Offset> {
    override val value: Offset get() = Offset.Zero
}

private object NullBackdropState : State<Backdrop?> {
    override val value: Backdrop? get() = null
}

internal val LocalGlassHost: ProvidableCompositionLocal<GlassHost?> = staticCompositionLocalOf { null }

/**
 * How "stained-glass" a tint is: 0 for neutral tints (white, ice, smoke, black: mixed in), 1 for
 * strongly coloured ones (multiplied). Same formula as the AGSL shader.
 */
internal fun tintChromaMix(r: Float, g: Float, b: Float): Float {
    val chroma = max(r, max(g, b)) - min(r, min(g, b))
    val t = ((chroma - 0.25f) / 0.35f).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

private fun white(alpha: Float): Int = ((alpha.coerceIn(0f, 1f) * 255f).roundToInt() shl 24) or 0xFFFFFF

/** Screen position of the top-left of [view]'s window (0,0 for a full-screen activity). */
internal fun windowOriginOnScreen(view: View, tmp: IntArray): Offset {
    val root = view.rootView ?: view
    root.getLocationOnScreen(tmp)
    val sx = tmp[0]
    val sy = tmp[1]
    root.getLocationInWindow(tmp)
    return Offset((sx - tmp[0]).toFloat(), (sy - tmp[1]).toFloat())
}

// =================================================================================================
// Host: shared state + caches of one GlassRoot (main thread only)
// =================================================================================================

@Stable
internal class GlassHost(
    val backdrop: State<Backdrop?>,
    val tilt: State<Offset>,
) {
    /** Root top-left in screen px. */
    val rootOffset: MutableState<Offset> = mutableStateOf(Offset.Zero)

    /** Root size in px. */
    val rootSize: MutableState<IntSize> = mutableStateOf(IntSize.Zero)

    private val loc = IntArray(2)

    fun onRootPositioned(coordinates: LayoutCoordinates, view: View) {
        if (!coordinates.isAttached) return
        val size = coordinates.size
        if (rootSize.value != size) rootSize.value = size
        val offset = coordinates.positionInWindow() + windowOriginOnScreen(view, loc)
        if (rootOffset.value != offset) rootOffset.value = offset
    }

    // ---- backdrop bitmap shaders (shared by all surfaces; rebuilt on new backdrop / root size) ----

    private var cacheVersion = Int.MIN_VALUE
    private var cacheW = -1
    private var cacheH = -1
    private var blurredShader: BitmapShader? = null
    private var heavyShader: BitmapShader? = null

    /**
     * BitmapShader of the blurred (or heavy) copy whose local matrix maps it onto the root exactly
     * like the sharp wallpaper is drawn (center-crop): bitmap px -> sharp px (uniform scale of the
     * downscaled copy) -> root px (crop scale + centring offset).
     */
    fun backdropShader(bd: Backdrop, heavy: Boolean, rootW: Int, rootH: Int): Shader? {
        if (bd.version != cacheVersion || rootW != cacheW || rootH != cacheH) {
            blurredShader = null
            heavyShader = null
            try {
                val sw = bd.sharp.width
                val sh = bd.sharp.height
                blurredShader = buildShader(bd.blurred.asAndroidBitmap(), sw, sh, rootW, rootH)
                heavyShader = buildShader(bd.heavy.asAndroidBitmap(), sw, sh, rootW, rootH)
            } catch (t: Throwable) {
                // leave null -> fallback fill
            }
            cacheVersion = bd.version
            cacheW = rootW
            cacheH = rootH
        }
        return if (heavy) heavyShader else blurredShader
    }

    private fun buildShader(bitmap: Bitmap, sharpW: Int, sharpH: Int, rootW: Int, rootH: Int): BitmapShader {
        val s = max(rootW / sharpW.toFloat(), rootH / sharpH.toFloat())
        val ox = (rootW - sharpW * s) / 2f
        val oy = (rootH - sharpH * s) / 2f
        val shader = BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val m = Matrix()
        m.setScale(sharpW * s / bitmap.width, sharpH * s / bitmap.height)
        m.postTranslate(ox, oy)
        shader.setLocalMatrix(m)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Required when used as a RuntimeShader child: there is no Paint to take FILTER_BITMAP from.
            setLinearFilter(shader)
        }
        return shader
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun setLinearFilter(shader: BitmapShader) {
        shader.filterMode = BitmapShader.FILTER_MODE_LINEAR
    }

    // ---- shared liquid shader (Android 13+) ----

    private var liquid: Any? = null
    private var liquidFailed = false

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun liquidShader(): LiquidShader? {
        if (liquidFailed) return null
        (liquid as? LiquidShader)?.let { return it }
        val created = createLiquidShaderOrNull()
        if (created == null) {
            liquidFailed = true
            return null
        }
        liquid = created
        return created
    }

    fun disableLiquid() {
        liquidFailed = true
        liquid = null
    }

    // ---- wallpaper ----

    private val wallpaperPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
    private val wallpaperDst = RectF()
    private val fallbackBrush = Brush.verticalGradient(
        listOf(Color(0xFF010838), Color(0xFF0636B4), Color(0xFF010A40)),
    )

    fun drawWallpaper(scope: DrawScope) {
        val bd = backdrop.value
        val w = scope.size.width
        val h = scope.size.height
        if (w <= 0f || h <= 0f) return
        if (bd == null) {
            scope.drawRect(fallbackBrush)
            return
        }
        val bmp = bd.sharp.asAndroidBitmap()
        val s = max(w / bmp.width, h / bmp.height)
        val dw = bmp.width * s
        val dh = bmp.height * s
        wallpaperDst.set((w - dw) / 2f, (h - dh) / 2f, (w + dw) / 2f, (h + dh) / 2f)
        scope.drawContext.canvas.nativeCanvas.drawBitmap(bmp, null, wallpaperDst, wallpaperPaint)
    }
}

// =================================================================================================
// Modifier node
// =================================================================================================

private data class LiquidGlassElement(
    val cornerRadius: Dp,
    val style: GlassStyle?,
) : ModifierNodeElement<LiquidGlassNode>() {
    override fun create(): LiquidGlassNode = LiquidGlassNode(cornerRadius, style)

    override fun update(node: LiquidGlassNode) {
        node.cornerRadius = cornerRadius
        node.explicitStyle = style
    }
}

private class LiquidGlassNode(
    var cornerRadius: Dp,
    var explicitStyle: GlassStyle?,
) : Modifier.Node(),
    DrawModifierNode,
    GlobalPositionAwareModifierNode,
    CompositionLocalConsumerModifierNode {

    private var coordinates: LayoutCoordinates? = null
    private var lastWindowPos: Offset = Offset.Unspecified
    private var lastWindowScale: Float = 1f
    private val loc = IntArray(2)

    private val backdropPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
    private val liquidPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val sheenPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private val specPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var shadowBlurPx = -1f

    private val rect = RectF()
    private val matrix = Matrix()

    // Unit-space gradients (geometry via local matrix, strength via paint alpha) -> never re-created.
    private val sheenShader = LinearGradient(
        0f, 0f, 0f, 1f,
        intArrayOf(white(0.09f), white(0.025f), white(0f), white(0.025f)),
        floatArrayOf(0f, 0.42f, 0.72f, 1f),
        Shader.TileMode.CLAMP,
    )
    private val specShader = RadialGradient(
        0f, 0f, 1f,
        intArrayOf(white(0.08f), white(0.035f), white(0f)),
        floatArrayOf(0f, 0.45f, 1f),
        Shader.TileMode.CLAMP,
    )
    private val rimShader = LinearGradient(
        -1f, 0f, 1f, 0f,
        intArrayOf(white(0.85f), white(0.10f), white(0.04f), white(0.40f)),
        floatArrayOf(0f, 0.40f, 0.62f, 1f),
        Shader.TileMode.CLAMP,
    )

    // Colour-matrix cache for the plain path.
    private var cmFilter: ColorMatrixColorFilter? = null
    private var cmSaturation = Float.NaN
    private var cmAlpha = Float.NaN
    private var cmTint = 0

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        this.coordinates = coordinates
        if (!coordinates.isAttached) return
        val p = coordinates.positionInWindow()
        val s = windowScale(coordinates, p)
        if (p != lastWindowPos || s != lastWindowScale) {
            lastWindowPos = p
            lastWindowScale = s
            invalidateDraw()
        }
    }

    override fun onDetach() {
        coordinates = null
        lastWindowPos = Offset.Unspecified
        lastWindowScale = 1f
    }

    /** Uniform window-space scale of this node (ancestor graphicsLayer scale), 1 when unscaled. */
    private fun windowScale(coords: LayoutCoordinates, p0: Offset): Float {
        val w = coords.size.width.toFloat()
        if (w < 1f) return 1f
        val p1 = try {
            coords.localToWindow(Offset(w, 0f))
        } catch (e: IllegalStateException) {
            return 1f
        }
        val s = (p1.x - p0.x) / w
        return if (s.isFinite() && s > 1e-3f) s else 1f
    }

    override fun ContentDrawScope.draw() {
        val w = size.width
        val h = size.height
        if (w < 1f || h < 1f) {
            drawContent()
            return
        }
        val style = explicitStyle ?: currentValueOf(LocalGlassStyle)
        val host = currentValueOf(LocalGlassHost)
        val dens = density
        val radius = min(cornerRadius.toPx(), min(w, h) / 2f).coerceAtLeast(0f)
        val tilt = host?.tilt?.value ?: Offset.Zero
        val edge = style.edge.coerceIn(0f, 1f)

        var lx = LIGHT_X + TILT_LIGHT_X * tilt.x
        var ly = LIGHT_Y + TILT_LIGHT_Y * tilt.y
        val len = sqrt(lx * lx + ly * ly)
        if (len > 1e-4f) {
            lx /= len; ly /= len
        } else {
            lx = LIGHT_X; ly = LIGHT_Y
        }

        val canvas = drawContext.canvas.nativeCanvas

        // 1) soft drop shadow (only under an opaque backdrop, never through the translucent fallback)
        if (style.shadow && host?.backdrop?.value != null) drawShadow(canvas, w, h, radius, dens)

        // 2) backdrop: liquid shader / plain colour-matrix / fallback fill
        val mode = if (host != null) drawBackdrop(canvas, host, style, w, h, radius, lx, ly, edge, dens) else MODE_NONE
        if (mode == MODE_NONE) drawFallback(canvas, style, w, h, radius)

        if (edge > 0f) {
            val a = (edge * 255f).roundToInt().coerceIn(0, 255)
            // 3) sheen: brighter top, faint bottom bounce
            matrix.setScale(1f, h)
            sheenShader.setLocalMatrix(matrix)
            sheenPaint.shader = sheenShader
            sheenPaint.alpha = a
            canvas.drawRoundRect(0f, 0f, w, h, radius, radius, sheenPaint)
            // 4) specular bloom, follows the light (same direction as the rim): at rest
            //    (lx, ly) = (-0.6, -0.8) it sits at (0.28w, 0.10h)
            val sx = w * (0.5f + 0.367f * lx)
            val sy = h * (0.5f + 0.5f * ly)
            val srx = max(w * 0.42f, radius).coerceAtLeast(1f)
            val sry = max(h * 0.55f, radius * 0.8f).coerceAtLeast(1f)
            matrix.setScale(srx, sry)
            matrix.postTranslate(sx, sy)
            specShader.setLocalMatrix(matrix)
            specPaint.shader = specShader
            specPaint.alpha = a
            canvas.drawRoundRect(0f, 0f, w, h, radius, radius, specPaint)
        }

        // 5) content
        drawContent()

        // 6) crisp directional rim on top
        if (edge > 0f) {
            val liquid = mode == MODE_LIQUID
            val sw = (if (liquid) 0.9f else 1.2f) * dens
            val k = if (liquid) 0.75f else 1f
            val ext = (abs(lx) * w / 2f + abs(ly) * h / 2f).coerceAtLeast(1f)
            matrix.setScale(ext, ext)
            matrix.postRotate(Math.toDegrees(atan2(-ly, -lx).toDouble()).toFloat())
            matrix.postTranslate(w / 2f, h / 2f)
            rimShader.setLocalMatrix(matrix)
            rimPaint.shader = rimShader
            rimPaint.strokeWidth = sw
            rimPaint.alpha = (edge * k * 255f).roundToInt().coerceIn(0, 255)
            val inset = sw / 2f
            val rr = max(radius - inset, 0f)
            canvas.drawRoundRect(inset, inset, w - inset, h - inset, rr, rr, rimPaint)
        }
    }

    private fun drawShadow(canvas: Canvas, w: Float, h: Float, r: Float, dens: Float) {
        val blur = SHADOW_BLUR_DP * dens
        val dy = SHADOW_DY_DP * dens
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (shadowBlurPx != blur) {
                shadowPaint.maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
                shadowBlurPx = blur
            }
            shadowPaint.color = (SHADOW_ALPHA * 255f).roundToInt() shl 24
            canvas.drawRoundRect(0f, dy, w, h + dy, r, r, shadowPaint)
        } else {
            // BlurMaskFilter is not hardware accelerated before Android 9: stacked translucent
            // rounded rects give a linear falloff of the same reach.
            shadowPaint.maskFilter = null
            val layerAlpha = (SHADOW_ALPHA * 255f * 1.1f / SHADOW_LAYERS).roundToInt().coerceIn(1, 255)
            shadowPaint.color = layerAlpha shl 24
            for (i in 1..SHADOW_LAYERS) {
                val spread = blur * 0.6f * i / SHADOW_LAYERS
                val rr = r + spread
                canvas.drawRoundRect(-spread, dy - spread, w + spread, h + dy + spread, rr, rr, shadowPaint)
            }
        }
    }

    /** Returns MODE_LIQUID / MODE_PLAIN, or MODE_NONE when there is nothing to sample yet. */
    private fun drawBackdrop(
        canvas: Canvas,
        host: GlassHost,
        style: GlassStyle,
        w: Float,
        h: Float,
        r: Float,
        lx: Float,
        ly: Float,
        edge: Float,
        dens: Float,
    ): Int {
        val bd = host.backdrop.value ?: return MODE_NONE
        val rootSize = host.rootSize.value
        if (rootSize.width <= 0 || rootSize.height <= 0) return MODE_NONE
        val coords = coordinates ?: return MODE_NONE
        if (!coords.isAttached) return MODE_NONE
        val shader = host.backdropShader(bd, style.heavy, rootSize.width, rootSize.height) ?: return MODE_NONE

        // Surface origin in GlassRoot coordinates (screen space on both sides -> popups work too).
        // positionInWindow() includes ancestor layer transforms; a uniform ancestor scale s means the
        // surface covers s*w x s*h root px, so the canvas is scaled by 1/s and the region drawn in root
        // units (the backdrop then stays locked to the wallpaper during press squish / menu pop).
        val view = currentValueOf(LocalView)
        val p0 = coords.positionInWindow()
        val s = windowScale(coords, p0)
        val pos = p0 + windowOriginOnScreen(view, loc)
        val root = host.rootOffset.value
        val ox = pos.x - root.x
        val oy = pos.y - root.y
        val sw = w * s
        val sh = h * s
        val sr = r * s

        canvas.save()
        if (s != 1f) canvas.scale(1f / s, 1f / s)
        canvas.translate(-ox, -oy)
        rect.set(ox, oy, ox + sw, oy + sh)
        var mode = MODE_NONE
        // RuntimeShader only works on hardware canvases (software Canvas throws
        // "Software rendering doesn't support RuntimeShader"), e.g. View.drawToBitmap -> plain path.
        if (style.refraction > 0.001f &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            canvas.isHardwareAccelerated
        ) {
            if (drawLiquid(canvas, host, shader, style, ox, oy, sw, sh, sr, lx, ly, edge, dens * s)) mode = MODE_LIQUID
        }
        if (mode == MODE_NONE) {
            backdropPaint.shader = shader
            backdropPaint.colorFilter = colorFilterFor(style)
            canvas.drawRoundRect(rect, sr, sr, backdropPaint)
            mode = MODE_PLAIN
        }
        canvas.restore()
        return mode
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun drawLiquid(
        canvas: Canvas,
        host: GlassHost,
        input: Shader,
        style: GlassStyle,
        ox: Float,
        oy: Float,
        w: Float,
        h: Float,
        r: Float,
        lx: Float,
        ly: Float,
        edge: Float,
        dens: Float,
    ): Boolean {
        val liquid = host.liquidShader() ?: return false
        return try {
            val band = max(1f, min(BAND_DP * dens, min(r, min(w, h) * 0.2f)))
            val tint = style.tint
            liquid.update(
                input = input,
                originX = ox,
                originY = oy,
                width = w,
                height = h,
                radius = r,
                band = band,
                refraction = style.refraction.coerceIn(0f, 1f),
                lightX = lx,
                lightY = ly,
                edge = edge,
                saturation = style.saturation.coerceIn(0f, 3f),
                rimWidth = RIM_DP * dens,
                tintR = tint.red,
                tintG = tint.green,
                tintB = tint.blue,
                tintAlpha = (style.tintAlpha * tint.alpha).coerceIn(0f, 1f),
            )
            liquidPaint.shader = liquid.shader
            canvas.drawRoundRect(rect, r, r, liquidPaint)
            true
        } catch (t: Throwable) {
            host.disableLiquid()
            liquidPaint.shader = null
            false
        }
    }

    /**
     * Plain path, identical to the shader: saturation first, then the tint
     * (k = [tintChromaMix]: mix(c + (tint - c) * a, c * (1 - a + 2a*tint) + 0.35a*tint, k)),
     * i.e. c' = D * sat(c) + o per channel, as one ColorMatrix (cached).
     */
    private fun colorFilterFor(style: GlassStyle): ColorMatrixColorFilter {
        val a = (style.tintAlpha * style.tint.alpha).coerceIn(0f, 1f)
        val s = style.saturation.coerceIn(0f, 3f)
        val tintArgb = style.tint.toArgb()
        cmFilter?.let { if (cmSaturation == s && cmAlpha == a && cmTint == tintArgb) return it }
        val tr = style.tint.red
        val tg = style.tint.green
        val tb = style.tint.blue
        val k = tintChromaMix(tr, tg, tb)
        val d0 = 1f - a + k * 2f * a * tr
        val d1 = 1f - a + k * 2f * a * tg
        val d2 = 1f - a + k * 2f * a * tb
        val o = a * ((1f - k) + k * 0.35f) * 255f
        val lr = 0.2126f * (1f - s)
        val lg = 0.7152f * (1f - s)
        val lb = 0.0722f * (1f - s)
        val m = floatArrayOf(
            d0 * (lr + s), d0 * lg, d0 * lb, 0f, o * tr,
            d1 * lr, d1 * (lg + s), d1 * lb, 0f, o * tg,
            d2 * lr, d2 * lg, d2 * (lb + s), 0f, o * tb,
            0f, 0f, 0f, 1f, 0f,
        )
        val filter = ColorMatrixColorFilter(m)
        cmFilter = filter
        cmSaturation = s
        cmAlpha = a
        cmTint = tintArgb
        return filter
    }

    private fun drawFallback(canvas: Canvas, style: GlassStyle, w: Float, h: Float, r: Float) {
        val a = (0.22f + style.tintAlpha * 0.6f).coerceIn(0f, 0.85f)
        fillPaint.color = style.tint.copy(alpha = a).toArgb()
        canvas.drawRoundRect(0f, 0f, w, h, r, r, fillPaint)
    }

    private companion object {
        const val MODE_NONE = 0
        const val MODE_PLAIN = 1
        const val MODE_LIQUID = 2
    }
}
