package com.onedex1.luma.glass

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.hardware.display.DisplayManager
import android.media.ExifInterface
import android.net.Uri
import android.util.DisplayMetrics
import android.view.Display
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.onedex1.luma.BuildConfig
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.channels.FileChannel
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * One wallpaper state as seen by the glass:
 *  - [sharp]   the wallpaper at screen resolution (portrait), drawn center-cropped by GlassRoot;
 *  - [blurred] a 1/4-scale StackBlurred copy of the SAME image (regular glass);
 *  - [heavy]   a 1/8-scale, much more blurred copy (sheets / drawer);
 *  - [version] increases with every new backdrop (cheap change detection for caches).
 * The blurred copies have exactly the sharp image's aspect, so mapping = uniform scale.
 */
class Backdrop(
    val sharp: ImageBitmap,
    val blurred: ImageBitmap,
    val heavy: ImageBitmap,
    val version: Int,
)

/**
 * Owns Luma's own wallpaper (3rd-party apps cannot reliably read the system wallpaper on modern
 * Android, so Luma draws its own and can optionally push it to the system).
 *
 * All heavy work (procedural render, decode, downscale, StackBlur) runs on Dispatchers.Default / IO;
 * results are published through [backdrop]. Create once (application singleton).
 */
class WallpaperEngine(context: Context) {

    private val appContext: Context = context.applicationContext
    // Background failures (OOM on a huge photo, broken file...) must never crash the launcher:
    // the previous backdrop simply stays on screen.
    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, _ -> },
    )
    private val workLock = Mutex()
    private val versionCounter = AtomicInteger(0)

    /** Built-in procedural presets (id, Russian title). */
    val presets: List<WallpaperPreset> = Wallpapers.presets

    private val _backdrop = MutableStateFlow<Backdrop?>(null)

    /** Current backdrop; null until the first wallpaper is ready. */
    val backdrop: StateFlow<Backdrop?> = _backdrop.asStateFlow()

    @Volatile private var requestedSpec: String? = null
    @Volatile private var loadedSpec: String? = null
    @Volatile private var loadedCustomStamp: Long = -1L
    @Volatile private var blurAmount: Float = DEFAULT_BLUR
    @Volatile private var blurredFor: Float = -1f
    @Volatile private var sharpBitmap: Bitmap? = null

    private var sourceJob: Job? = null
    private var blurJob: Job? = null
    private val jobLock = Any()

    private val thumbCache = object : android.util.LruCache<String, Bitmap>(THUMB_CACHE_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    private val customFile: File get() = File(appContext.filesDir, CUSTOM_FILE_NAME)

    /**
     * Selects the wallpaper: "preset:<id>" or "custom". Cheap to call repeatedly with the same value
     * (no-op when already loaded/loading). Work happens asynchronously on Dispatchers.Default.
     */
    fun setSource(spec: String) {
        setSourceInternal(spec, force = false)
    }

    private fun setSourceInternal(spec: String, force: Boolean) {
        val normalized = normalizeSpec(spec)
        synchronized(jobLock) {
            val sameAsRequested = normalized == requestedSpec
            val upToDate = normalized == loadedSpec &&
                (normalized != SPEC_CUSTOM || loadedCustomStamp == customStamp())
            if (!force && sameAsRequested && (upToDate || sourceJob?.isActive == true)) return
            requestedSpec = normalized
            sourceJob?.cancel()
            sourceJob = scope.launch {
                workLock.withLock {
                    currentCoroutineContext().ensureActive()
                    val (w, h) = screenSize()
                    val stamp = customStamp()
                    val sharp = loadSharp(normalized, w, h)
                    currentCoroutineContext().ensureActive()
                    sharpBitmap = sharp
                    loadedSpec = normalized
                    loadedCustomStamp = if (normalized == SPEC_CUSTOM) stamp else -1L
                    publish(sharp, blurAmount)
                }
            }
        }
    }

    /**
     * Sets the blur strength 0..1 (LumaSettings.blur). Debounced; recomputes only the small blurred
     * copies (the sharp wallpaper is reused).
     */
    fun setBlur(amount: Float) {
        val a = if (amount.isNaN()) DEFAULT_BLUR else amount.coerceIn(0f, 1f)
        synchronized(jobLock) {
            if (a == blurAmount && (blurJob?.isActive == true || a == blurredFor)) return
            blurAmount = a
            blurJob?.cancel()
            blurJob = scope.launch {
                delay(BLUR_DEBOUNCE_MS)
                workLock.withLock {
                    currentCoroutineContext().ensureActive()
                    val sharp = sharpBitmap ?: return@withLock
                    if (blurredFor == blurAmount) return@withLock
                    publish(sharp, blurAmount)
                }
            }
        }
    }

    /**
     * Loads the default wallpaper if nobody called [setSource] yet. GlassRoot calls this after a short
     * grace period so the glass never stays empty even if the UI forgets to pick a wallpaper.
     */
    fun ensureLoaded() {
        if (requestedSpec == null) setSource("$SPEC_PRESET_PREFIX${Wallpapers.DEFAULT_ID}")
    }

    /**
     * Copies the picked image into filesDir/custom_wallpaper.jpg: EXIF-rotated, center-cropped and
     * downsampled to the screen size. Returns false on any error. If "custom" is the current source
     * it is reloaded automatically.
     */
    suspend fun importCustom(uri: Uri): Boolean = withContext(Dispatchers.IO) {
        try {
            val (tw, th) = screenSize()
            val resolver = appContext.contentResolver
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            val boundsStream = resolver.openInputStream(uri) ?: return@withContext false
            boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext false

            val orientation = try {
                resolver.openInputStream(uri)?.use {
                    ExifInterface(it).getAttributeInt(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_NORMAL,
                    )
                } ?: ExifInterface.ORIENTATION_NORMAL
            } catch (t: Throwable) {
                ExifInterface.ORIENTATION_NORMAL
            }
            val swapped = orientation == ExifInterface.ORIENTATION_ROTATE_90 ||
                orientation == ExifInterface.ORIENTATION_ROTATE_270 ||
                orientation == ExifInterface.ORIENTATION_TRANSPOSE ||
                orientation == ExifInterface.ORIENTATION_TRANSVERSE
            val srcW = if (swapped) bounds.outHeight else bounds.outWidth
            val srcH = if (swapped) bounds.outWidth else bounds.outHeight

            var sample = 1
            while (srcW / (sample * 2) >= tw && srcH / (sample * 2) >= th) sample *= 2
            val opts = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
                ?: return@withContext false
            val oriented = applyExifOrientation(decoded, orientation)
            val cropped = centerCropBitmap(oriented, tw, th)
            if (oriented !== decoded) oriented.recycle()
            decoded.recycle()

            val target = customFile
            val tmp = File(appContext.filesDir, "$CUSTOM_FILE_NAME.tmp")
            FileOutputStream(tmp).use { out ->
                if (!cropped.compress(Bitmap.CompressFormat.JPEG, 92, out)) return@withContext false
            }
            cropped.recycle()
            if (target.exists()) target.delete()
            if (!tmp.renameTo(target)) {
                tmp.copyTo(target, overwrite = true)
                tmp.delete()
            }
            synchronized(thumbCache) { thumbCache.evictAll() }
            if (requestedSpec == SPEC_CUSTOM) setSourceInternal(SPEC_CUSTOM, force = true)
            true
        } catch (t: Throwable) {
            false
        }
    }

    /** True when a custom photo has been imported. */
    fun hasCustom(): Boolean = customFile.isFile

    /** Sets the current sharp wallpaper as the system wallpaper (home + lock). Needs SET_WALLPAPER. */
    suspend fun applyAsSystemWallpaper(): Boolean = withContext(Dispatchers.IO) {
        try {
            val bmp = sharpBitmap ?: run {
                val (w, h) = screenSize()
                loadSharp(requestedSpec ?: "$SPEC_PRESET_PREFIX${Wallpapers.DEFAULT_ID}", w, h)
            }
            WallpaperManager.getInstance(appContext).setBitmap(bmp)
            true
        } catch (t: Throwable) {
            false
        }
    }

    /**
     * Thumbnail of a preset id ("ocean", ...; also accepts "preset:ocean" and "custom") at w x h.
     * Synchronous and cached (LRU); rendering a 200x430 thumbnail takes a few ms -- prefer calling it
     * off the main thread (see [loadThumbnail]).
     */
    fun thumbnail(presetId: String, w: Int, h: Int): Bitmap {
        val id = presetId.removePrefix(SPEC_PRESET_PREFIX)
        val tw = max(1, w)
        val th = max(1, h)
        val key = "$id:$tw:$th"
        synchronized(thumbCache) { thumbCache.get(key) }?.let { return it }
        val bmp = try {
            if (id == SPEC_CUSTOM) {
                decodeCustom(tw, th) ?: Wallpapers.render(Wallpapers.DEFAULT_ID, tw, th)
            } else {
                Wallpapers.render(id, tw, th)
            }
        } catch (t: Throwable) {
            Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888).apply { eraseColor(FALLBACK_COLOR) }
        }
        synchronized(thumbCache) { thumbCache.put(key, bmp) }
        return bmp
    }

    /** Coroutine-friendly [thumbnail] (runs on Dispatchers.Default). */
    suspend fun loadThumbnail(presetId: String, w: Int, h: Int): ImageBitmap =
        withContext(Dispatchers.Default) { thumbnail(presetId, w, h).asImageBitmap() }

    // ------------------------------------------------------------------------------------------

    private suspend fun publish(sharp: Bitmap, amount: Float) {
        val sw = sharp.width
        val sh = sharp.height
        val (nDiv, nRadius, hDiv, hRadius) = blurLevels(amount)
        val small = sharp.progressiveDownscale(
            max(1, (sw / nDiv.toFloat()).roundToInt()),
            max(1, (sh / nDiv.toFloat()).roundToInt()),
        )
        currentCoroutineContext().ensureActive()
        val blurred = StackBlur.blur(small, nRadius)
        val tiny = small.progressiveDownscale(
            max(1, (sw / hDiv.toFloat()).roundToInt()),
            max(1, (sh / hDiv.toFloat()).roundToInt()),
        )
        val heavy = StackBlur.blur(tiny, hRadius)
        if (tiny !== small) tiny.recycle()
        if (small !== sharp) small.recycle()
        currentCoroutineContext().ensureActive()
        blurredFor = amount
        // Bitmaps handed to the UI are never recycled by us (the RenderThread may still use them).
        _backdrop.value = Backdrop(
            sharp = sharp.asImageBitmap(),
            blurred = blurred.asImageBitmap(),
            heavy = heavy.asImageBitmap(),
            version = versionCounter.incrementAndGet(),
        )
    }

    private fun loadSharp(spec: String, w: Int, h: Int): Bitmap {
        if (spec == SPEC_CUSTOM) {
            decodeCustom(w, h)?.let { return it }
            return Wallpapers.render(Wallpapers.DEFAULT_ID, w, h)
        }
        return loadPreset(spec.removePrefix(SPEC_PRESET_PREFIX), w, h)
    }

    /**
     * Procedural preset at screen size. The last rendered preset is kept as raw pixels in cacheDir,
     * so a process restart (launchers are killed often) reads ~10 MB instead of re-rendering
     * (gradients + per-pixel grain, 100-250 ms). Only one file is kept; any failure just renders.
     */
    private fun loadPreset(id: String, w: Int, h: Int): Bitmap {
        val file = File(appContext.cacheDir, "wp_${id}_${w}x${h}_v${BuildConfig.VERSION_CODE}_$PRESET_CACHE_VERSION.raw")
        val bytes = w.toLong() * h * 4
        if (file.isFile && file.length() == bytes) {
            try {
                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                RandomAccessFile(file, "r").use { raf ->
                    bmp.copyPixelsFromBuffer(raf.channel.map(FileChannel.MapMode.READ_ONLY, 0, bytes))
                }
                return bmp
            } catch (t: Throwable) {
                file.delete()
            }
        }
        val bmp = Wallpapers.render(id, w, h)
        // Written in the background (the bitmap is only read, never recycled), so the first
        // publish is not delayed by the disk write.
        scope.launch(Dispatchers.IO) {
            try {
                appContext.cacheDir.listFiles { f -> f.name.startsWith("wp_") && f.name.endsWith(".raw") }
                    ?.forEach { it.delete() }
                val tmp = File(appContext.cacheDir, file.name + ".tmp")
                RandomAccessFile(tmp, "rw").use { raf ->
                    raf.setLength(bytes)
                    bmp.copyPixelsToBuffer(raf.channel.map(FileChannel.MapMode.READ_WRITE, 0, bytes))
                }
                if (!tmp.renameTo(file)) tmp.delete()
            } catch (t: Throwable) {
                // cache is optional
            }
        }
        return bmp
    }

    private fun decodeCustom(w: Int, h: Int): Bitmap? {
        val file = customFile
        if (!file.isFile) return null
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= w && bounds.outHeight / (sample * 2) >= h) sample *= 2
            val opts = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val decoded = BitmapFactory.decodeFile(file.absolutePath, opts) ?: return null
            if (decoded.width == w && decoded.height == h && decoded.config == Bitmap.Config.ARGB_8888) {
                decoded
            } else {
                centerCropBitmap(decoded, w, h).also { decoded.recycle() }
            }
        } catch (t: Throwable) {
            null
        }
    }

    private fun customStamp(): Long {
        val f = customFile
        return if (f.isFile) f.lastModified() xor f.length() else 0L
    }

    private fun normalizeSpec(spec: String): String {
        val s = spec.trim()
        if (s == SPEC_CUSTOM) return SPEC_CUSTOM
        val id = s.removePrefix(SPEC_PRESET_PREFIX)
        return SPEC_PRESET_PREFIX + (if (Wallpapers.isKnown(id)) id else Wallpapers.DEFAULT_ID)
    }

    /** Real screen size in portrait orientation, long side capped at [MAX_LONG_SIDE]. */
    private fun screenSize(): Pair<Int, Int> {
        var w = 0
        var h = 0
        try {
            val dm = appContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val display = dm?.getDisplay(Display.DEFAULT_DISPLAY)
            if (display != null) {
                val metrics = DisplayMetrics()
                @Suppress("DEPRECATION")
                display.getRealMetrics(metrics)
                w = metrics.widthPixels
                h = metrics.heightPixels
            }
        } catch (t: Throwable) {
            // fall back below
        }
        if (w <= 0 || h <= 0) {
            val m = appContext.resources.displayMetrics
            w = m.widthPixels
            h = m.heightPixels
        }
        if (w <= 0 || h <= 0) {
            w = 1080
            h = 2400
        }
        var pw = min(w, h)
        var ph = max(w, h)
        if (ph > MAX_LONG_SIDE) {
            val s = MAX_LONG_SIDE / ph.toFloat()
            pw = max(1, (pw * s).roundToInt())
            ph = MAX_LONG_SIDE
        }
        return pw to ph
    }

    private data class BlurLevels(val normalDiv: Int, val normalRadius: Int, val heavyDiv: Int, val heavyRadius: Int)

    private fun blurLevels(amount: Float): BlurLevels {
        val a = amount.coerceIn(0f, 1f)
        return BlurLevels(
            normalDiv = 4,
            normalRadius = (1f + a * 11f).roundToInt(),
            heavyDiv = 8,
            heavyRadius = (6f + a * 18f).roundToInt(),
        )
    }

    private fun applyExifOrientation(src: Bitmap, orientation: Int): Bitmap {
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                m.setRotate(90f); m.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> m.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                m.setRotate(-90f); m.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> m.setRotate(-90f)
            else -> return src
        }
        return try {
            Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
        } catch (t: Throwable) {
            src
        }
    }

    companion object {
        const val SPEC_CUSTOM: String = "custom"
        const val SPEC_PRESET_PREFIX: String = "preset:"
        const val CUSTOM_FILE_NAME: String = "custom_wallpaper.jpg"
        const val DEFAULT_BLUR: Float = 0.65f

        private const val BLUR_DEBOUNCE_MS = 90L
        private const val MAX_LONG_SIDE = 2400
        private const val THUMB_CACHE_BYTES = 6 * 1024 * 1024
        private const val FALLBACK_COLOR = 0xFF0A2A8A.toInt()
        private const val PRESET_CACHE_VERSION = 1
    }
}
