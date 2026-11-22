package com.onedex1.luma.ui.components

import android.content.ComponentCallbacks2
import android.graphics.Bitmap
import android.util.LruCache
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.glass.LocalGlassStyle
import com.onedex1.luma.ui.theme.LumaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/** Loads the icon of an app key rendered at `sizePx`×`sizePx` (null if the app is gone). */
typealias IconLoader = suspend (key: String, sizePx: Int) -> ImageBitmap?

/** How app icons look; derived from [LumaSettings]. */
@Immutable
data class IconLook(
    val style: String = LumaSettings.ICON_STYLE_GLASS,
    val cornerDp: Int = 30,
    val iconsVersion: Int = 0,
) {
    companion object {
        fun from(settings: LumaSettings, iconsVersion: Int) =
            IconLook(settings.iconStyle, settings.cornerDp, iconsVersion)
    }
}

/**
 * Small UI-side memory of recently shown icons so that a re-composed tile (drawer opened
 * again, grid scrolled back, activity re-created) shows its icon in the very first frame instead
 * of fading in. Every icon is also kept under a version-less "latest" key: after an icon-version
 * bump a fresh tile shows the previous bitmap until the new one is loaded.
 */
internal object IconMemory {
    private val cache = object : LruCache<String, ImageBitmap>(10 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }

    fun get(key: String): ImageBitmap? = cache.get(key)
    fun put(key: String, value: ImageBitmap) {
        cache.put(key, value)
    }

    /** Memory pressure (ComponentCallbacks2 level): drop what the tiles can reload. */
    fun trim(level: Int) {
        @Suppress("DEPRECATION")
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> cache.evictAll()
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE ||
                level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> cache.trimToSize(cache.maxSize() / 2)
        }
    }
}

/** How long a tile that already shows an icon waits before reloading it at a new size / version. */
private const val ICON_RELOAD_DELAY_MS = 150L

@Composable
fun rememberAppIcon(key: String, sizePx: Int, version: Int, loader: IconLoader): State<ImageBitmap?> =
    rememberAppIcon(key, sizePx, version, loader, clear = false)

/**
 * [clear] = the iOS 26 "clear" variant (plate removed, glyph in frosted white), derived from the
 * loaded icon off the main thread and remembered separately.
 */
@Composable
internal fun rememberAppIcon(
    key: String,
    sizePx: Int,
    version: Int,
    loader: IconLoader,
    clear: Boolean,
): State<ImageBitmap?> {
    val variant = if (clear) "|clear" else ""
    val cacheKey = "$key|$sizePx|$version$variant"
    val latestKey = "$key|$sizePx$variant"
    return produceState(
        initialValue = IconMemory.get(cacheKey) ?: IconMemory.get(latestKey),
        cacheKey,
        loader,
    ) {
        val cached = IconMemory.get(cacheKey)
        if (cached != null) {
            value = cached
            return@produceState
        }
        // Already showing a bitmap (size or version changed, e.g. the size slider is being
        // dragged): wait a moment, so superseded sizes are cancelled before they are rendered.
        if (value != null) delay(ICON_RELOAD_DELAY_MS)
        val loaded = try {
            val raw = loader(key, sizePx)
            if (raw != null && clear) withContext(Dispatchers.Default) { clearIconOf(raw) } else raw
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (loaded != null) {
            IconMemory.put(cacheKey, loaded)
            IconMemory.put(latestKey, loaded)
            value = loaded
        }
    }
}

/**
 * iOS 26 style clear icon from a regular launcher icon: the icon's plate (the background colour
 * sampled on a ring inside the mask) becomes fully transparent and everything that stands out from
 * it -- the glyph -- becomes frosted white. Works for adaptive icons with any mask; icons without an
 * opaque plate become a soft white silhouette. Never throws (returns [src] on failure).
 */
internal fun clearIconOf(src: ImageBitmap): ImageBitmap = try {
    val original = src.asAndroidBitmap()
    val bmp = if (original.config == Bitmap.Config.HARDWARE) original.copy(Bitmap.Config.ARGB_8888, false) else original
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)

    // Plate colour: median of the opaque pixels on a ring at 38 % of the size around the centre.
    val samples = 72
    val rs = IntArray(samples)
    val gs = IntArray(samples)
    val bs = IntArray(samples)
    var n = 0
    val cx = (w - 1) / 2f
    val cy = (h - 1) / 2f
    val radius = min(w, h) * 0.38f
    for (i in 0 until samples) {
        val a = 2.0 * Math.PI * i / samples
        val x = (cx + radius * cos(a)).roundToInt().coerceIn(0, w - 1)
        val y = (cy + radius * sin(a)).roundToInt().coerceIn(0, h - 1)
        val c = px[y * w + x]
        if ((c ushr 24) >= 216) {
            rs[n] = (c shr 16) and 0xFF
            gs[n] = (c shr 8) and 0xFF
            bs[n] = c and 0xFF
            n++
        }
    }
    val hasPlate = n >= samples * 0.6f
    val pr = if (hasPlate) median(rs, n) else 0
    val pg = if (hasPlate) median(gs, n) else 0
    val pb = if (hasPlate) median(bs, n) else 0

    val out = IntArray(w * h)
    var coverage = 0f
    var plateArea = 0f
    for (i in px.indices) {
        val c = px[i]
        val a = (c ushr 24) / 255f
        if (a <= 0f) continue
        plateArea += a
        val glyph = if (hasPlate) {
            val d = max(
                abs(((c shr 16) and 0xFF) - pr),
                max(abs(((c shr 8) and 0xFF) - pg), abs((c and 0xFF) - pb)),
            ) / 255f
            smooth01((d - 0.14f) / 0.26f)
        } else {
            val lum = (0.2126f * ((c shr 16) and 0xFF) + 0.7152f * ((c shr 8) and 0xFF) + 0.0722f * (c and 0xFF)) / 255f
            0.45f + 0.55f * lum
        }
        val alpha = a * glyph
        coverage += alpha
        out[i] = ((alpha * 0.94f * 255f).roundToInt().coerceIn(0, 255) shl 24) or 0xFFFFFF
    }
    if (hasPlate && plateArea > 0f && coverage < plateArea * 0.03f) {
        // Glyph indistinguishable from its plate: show the icon shape as a faint white silhouette.
        for (i in px.indices) {
            val a = (px[i] ushr 24) / 255f
            out[i] = ((a * 0.5f * 255f).roundToInt().coerceIn(0, 255) shl 24) or 0xFFFFFF
        }
    }
    val result = Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888)
    result.prepareToDraw()
    result.asImageBitmap()
} catch (t: Throwable) {
    src
}

private fun median(values: IntArray, count: Int): Int {
    val copy = values.copyOf(count)
    copy.sort()
    return copy[count / 2]
}

private fun smooth01(x: Float): Float {
    val t = x.coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

/** Corner radius of an icon tile, following the panel radius from the settings. */
fun iconTileRadius(size: Dp, cornerDp: Int): Dp {
    val k = 0.16f + 0.20f * ((cornerDp - LumaSettings.CORNER_MIN_DP).toFloat() /
        (LumaSettings.CORNER_MAX_DP - LumaSettings.CORNER_MIN_DP)).coerceIn(0f, 1f)
    return size * k
}

/**
 * Just the icon: original (system icon as is), glass (icon at 72 % on a glass squircle) or
 * clear (desaturated, brightened icon on a glass squircle, like iOS 26 clear icons).
 */
@Composable
fun AppIconVisual(
    appKey: String,
    size: Dp,
    look: IconLook,
    iconLoader: IconLoader,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    when (look.style) {
        LumaSettings.ICON_STYLE_ORIGINAL -> {
            val px = with(density) { size.roundToPx() }.coerceAtLeast(1)
            val image by rememberAppIcon(appKey, px, look.iconsVersion, iconLoader)
            IconImage(image, modifier.size(size), null)
        }
        else -> {
            val clear = look.style == LumaSettings.ICON_STYLE_CLEAR
            // Clear icons lose their plate, so the glyph is drawn larger to keep its weight.
            val inner = size * (if (clear) 0.86f else 0.72f)
            val px = with(density) { inner.roundToPx() }.coerceAtLeast(1)
            val image by rememberAppIcon(appKey, px, look.iconsVersion, iconLoader, clear)
            val radius = iconTileRadius(size, look.cornerDp)
            val shape = RoundedCornerShape(radius)
            val base = LocalGlassStyle.current
            val tileStyle = remember(base, clear) {
                if (clear) {
                    base.copy(shadow = false, tintAlpha = (base.tintAlpha + 0.06f).coerceAtMost(0.6f))
                } else {
                    base.copy(shadow = false)
                }
            }
            GlassSurface(
                modifier = modifier
                    .size(size)
                    .then(
                        // Tiles that sit on another glass platter (dock) get no drop shadow.
                        if (base.shadow) {
                            Modifier.shadow(
                                elevation = 7.dp,
                                shape = shape,
                                clip = false,
                                ambientColor = Color.Black.copy(alpha = 0.22f),
                                spotColor = Color.Black.copy(alpha = 0.32f),
                            )
                        } else {
                            Modifier
                        },
                    ),
                cornerRadius = radius,
                style = tileStyle,
            ) {
                IconImage(
                    image,
                    Modifier
                        .align(Alignment.Center)
                        .size(inner),
                    null,
                    placeholder = !clear,
                )
            }
        }
    }
}

@Composable
private fun IconImage(image: ImageBitmap?, modifier: Modifier, filter: ColorFilter?, placeholder: Boolean = true) {
    val alpha by animateFloatAsState(if (image != null) 1f else 0f, tween(160), label = "iconFade")
    if (image != null) {
        Image(
            bitmap = image,
            contentDescription = null,
            modifier = modifier.alpha(alpha),
            colorFilter = filter,
            filterQuality = FilterQuality.Medium,
        )
    } else if (placeholder) {
        Box(modifier.clip(RoundedCornerShape(28)).background(Color.White.copy(alpha = 0.10f)))
    }
}

/** Keeps the latest coordinates of a tile without causing recompositions. */
class TileCoordinates {
    var coordinates: LayoutCoordinates? = null

    fun boundsInRoot(): Rect? = coordinates?.takeIf { it.isAttached }?.boundsInRoot()

    fun boundsInWindowRect(): android.graphics.Rect? = coordinates?.takeIf { it.isAttached }?.boundsInWindow()?.let {
        android.graphics.Rect(it.left.roundToInt(), it.top.roundToInt(), it.right.roundToInt(), it.bottom.roundToInt())
    }
}

/**
 * An app on the grid / in the dock / in the drawer: squishy icon with optional label.
 * [onClick] gets the icon bounds in window coordinates (launch animation source),
 * [onLongClick] the bounds in root coordinates (to anchor the glass menu).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun AppTile(
    app: AppInfo,
    iconSize: Dp,
    showLabel: Boolean,
    look: IconLook,
    iconLoader: IconLoader,
    onClick: (android.graphics.Rect?) -> Unit,
    onLongClick: (Rect) -> Unit,
    modifier: Modifier = Modifier,
    labelWidth: Dp = iconSize + 22.dp,
) {
    val interaction = remember { MutableInteractionSource() }
    val coords = remember { TileCoordinates() }
    Column(
        modifier = modifier
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClickLabel = app.label,
                onLongClick = { onLongClick(coords.boundsInRoot() ?: Rect.Zero) },
                onClick = { onClick(coords.boundsInWindowRect()) },
            )
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AppIconVisual(
            appKey = app.key,
            size = iconSize,
            look = look,
            iconLoader = iconLoader,
            modifier = Modifier
                .onGloballyPositioned { coords.coordinates = it }
                .pressScale(interaction, 0.9f),
        )
        if (showLabel) {
            Spacer(Modifier.height(7.dp))
            Text(
                text = app.label,
                // Narrow cells (5 columns): one step smaller so more of the name fits.
                style = if (labelWidth < 78.dp) SmallIconLabel else LumaType.iconLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(labelWidth),
            )
        }
    }
}

private val SmallIconLabel = LumaType.iconLabel.copy(fontSize = 11.sp, lineHeight = 14.sp)

/**
 * Icon size that fits a grid cell of [cellWidth]: at most 72 % of the cell, so neighbouring icons
 * keep a comfortable gap (5 columns scale the icons down instead of letting them touch).
 */
fun fittedIconSize(requested: Dp, cellWidth: Dp): Dp =
    min(requested, min(cellWidth * 0.72f, cellWidth - 10.dp)).coerceAtLeast(36.dp)
