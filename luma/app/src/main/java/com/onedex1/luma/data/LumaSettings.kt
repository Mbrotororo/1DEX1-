package com.onedex1.luma.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.compose.runtime.Immutable
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Everything the user can tune in "Настройки Luma". Values outside their ranges are clamped. */
@Immutable
data class LumaSettings(
    val blur: Float = 0.65f,          // 0..1  → blur strength of the glass backdrop
    val tintAlpha: Float = 0.16f,     // 0..0.6 opacity of the tint layer
    val tintColor: Long = 0xFFFFFFFF, // ARGB
    val edge: Float = 0.75f,          // 0..1 rim/highlight brightness
    val cornerDp: Int = 30,           // 8..44
    val refraction: Boolean = true,   // liquid edge refraction (only effective on API 33+)
    val refractionStrength: Float = 0.55f, // 0..1
    val tiltHighlights: Boolean = true,
    val preset: String = "clear",
    val wallpaper: String = "preset:ocean", // "preset:<id>" or "custom"
    val iconStyle: String = "glass",  // "original" | "glass" | "clear"
    val iconSizeDp: Int = 58,         // 44..72
    val showLabels: Boolean = true,
    val columns: Int = 4,             // 4 or 5
    val greetingName: String = "",
    val showClock: Boolean = true,
    val showSearch: Boolean = true,
    val onboardingDone: Boolean = false,
) {
    companion object {
        const val ICON_STYLE_ORIGINAL = "original"
        const val ICON_STYLE_GLASS = "glass"
        const val ICON_STYLE_CLEAR = "clear"
        val ICON_STYLES: List<String> = listOf(ICON_STYLE_ORIGINAL, ICON_STYLE_GLASS, ICON_STYLE_CLEAR)

        const val WALLPAPER_CUSTOM = "custom"
        const val WALLPAPER_PRESET_PREFIX = "preset:"

        /** [preset] value when the glass parameters no longer match any [GLASS_PRESETS] entry. */
        const val PRESET_CUSTOM = "custom"

        const val TINT_ALPHA_MAX = 0.6f
        const val CORNER_MIN_DP = 8
        const val CORNER_MAX_DP = 44
        const val ICON_SIZE_MIN_DP = 44
        const val ICON_SIZE_MAX_DP = 72
        const val GREETING_NAME_MAX_LENGTH = 32

        /** `"preset:<id>"` wallpaper spec for a procedural wallpaper preset. */
        fun presetWallpaper(id: String): String = WALLPAPER_PRESET_PREFIX + id

        internal val DEFAULT = LumaSettings()
    }
}

/** A one-tap glass look shown as a chip in "Стиль стекла". */
@Immutable
data class GlassPreset(
    val id: String,
    val title: String,
    val tintColor: Long,
    val tintAlpha: Float,
    val blur: Float,
    val edge: Float,
    val wallpaper: String?,
)

val GLASS_PRESETS: List<GlassPreset> = listOf(
    // Same values as the LumaSettings defaults: crystal-clear iOS-style glass.
    GlassPreset(
        id = "clear", title = "Прозрачное",
        tintColor = 0xFFFFFFFF, tintAlpha = 0.16f, blur = 0.65f, edge = 0.75f,
        wallpaper = null,
    ),
    // Thick frosted ice: lots of blur, cold white tint, bright rim.
    GlassPreset(
        id = "frost", title = "Иней",
        tintColor = 0xFFEAF4FF, tintAlpha = 0.32f, blur = 0.92f, edge = 0.85f,
        wallpaper = "preset:aurora",
    ),
    // Dark smoked glass.
    GlassPreset(
        id = "smoke", title = "Дым",
        tintColor = 0xFF1A1D24, tintAlpha = 0.36f, blur = 0.78f, edge = 0.55f,
        wallpaper = "preset:mono",
    ),
    // Violet neon glow.
    GlassPreset(
        id = "neon", title = "Неон",
        tintColor = 0xFFB14DFF, tintAlpha = 0.20f, blur = 0.60f, edge = 1.00f,
        wallpaper = "preset:neon",
    ),
    // Very dark, barely-there cold rim — a nod to the horror videos.
    GlassPreset(
        id = "bunker", title = "Бункер",
        tintColor = 0xFF040807, tintAlpha = 0.45f, blur = 0.85f, edge = 0.42f,
        wallpaper = "preset:bunker",
    ),
    // Deep blue, matches the Luma icon.
    GlassPreset(
        id = "ocean", title = "Океан",
        tintColor = 0xFF2F7BFF, tintAlpha = 0.18f, blur = 0.70f, edge = 0.80f,
        wallpaper = "preset:ocean",
    ),
)

/** The preset with this [id], or `null`. */
fun glassPreset(id: String): GlassPreset? = GLASS_PRESETS.firstOrNull { it.id == id }

/** `true` if the glass parameters of [settings] are exactly this preset's. */
fun GlassPreset.matches(settings: LumaSettings): Boolean =
    settings.tintColor == tintColor &&
        settings.tintAlpha == tintAlpha &&
        settings.blur == blur &&
        settings.edge == edge

/**
 * Persists [LumaSettings] in SharedPreferences and exposes them as a [StateFlow].
 * Thread-safe; every update is written immediately (asynchronously, via `apply()`).
 */
class SettingsStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val lock = Any()

    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<LumaSettings> = _settings.asStateFlow()

    /**
     * Applies [transform] to the current settings, clamps the result to valid ranges and
     * persists it. If the glass parameters are changed by hand (without changing
     * [LumaSettings.preset]) so that they no longer match the selected preset, the preset
     * becomes [LumaSettings.PRESET_CUSTOM] and no preset chip is highlighted any more.
     */
    fun update(transform: (LumaSettings) -> LumaSettings) {
        synchronized(lock) {
            val old = _settings.value
            var new = transform(old).sanitized()
            if (new.preset == old.preset) {
                val selected = glassPreset(new.preset)
                if (selected != null && !selected.matches(new)) {
                    new = new.copy(preset = LumaSettings.PRESET_CUSTOM)
                }
            }
            if (new == old) return
            _settings.value = new
            write(new)
        }
    }

    /**
     * Applies a [GLASS_PRESETS] entry: tint, blur and rim, plus its wallpaper — unless the
     * user has chosen their own photo, which is never replaced by a preset.
     */
    fun applyPreset(id: String) {
        val preset = glassPreset(id) ?: return
        update { current ->
            current.copy(
                preset = preset.id,
                tintColor = preset.tintColor,
                tintAlpha = preset.tintAlpha,
                blur = preset.blur,
                edge = preset.edge,
                wallpaper = if (preset.wallpaper != null && current.wallpaper != LumaSettings.WALLPAPER_CUSTOM) {
                    preset.wallpaper
                } else {
                    current.wallpaper
                },
            )
        }
    }

    // ------------------------------------------------------------------ persistence

    private fun read(): LumaSettings {
        val d = LumaSettings.DEFAULT
        return try {
            LumaSettings(
                blur = prefs.float(K_BLUR, d.blur),
                tintAlpha = prefs.float(K_TINT_ALPHA, d.tintAlpha),
                tintColor = prefs.long(K_TINT_COLOR, d.tintColor),
                edge = prefs.float(K_EDGE, d.edge),
                cornerDp = prefs.int(K_CORNER, d.cornerDp),
                refraction = prefs.bool(K_REFRACTION, d.refraction),
                refractionStrength = prefs.float(K_REFRACTION_STRENGTH, d.refractionStrength),
                tiltHighlights = prefs.bool(K_TILT, d.tiltHighlights),
                preset = prefs.string(K_PRESET, d.preset),
                wallpaper = prefs.string(K_WALLPAPER, d.wallpaper),
                iconStyle = prefs.string(K_ICON_STYLE, d.iconStyle),
                iconSizeDp = prefs.int(K_ICON_SIZE, d.iconSizeDp),
                showLabels = prefs.bool(K_SHOW_LABELS, d.showLabels),
                columns = prefs.int(K_COLUMNS, d.columns),
                greetingName = prefs.string(K_GREETING_NAME, d.greetingName),
                showClock = prefs.bool(K_SHOW_CLOCK, d.showClock),
                showSearch = prefs.bool(K_SHOW_SEARCH, d.showSearch),
                onboardingDone = prefs.bool(K_ONBOARDING_DONE, d.onboardingDone),
            ).sanitized()
        } catch (e: Exception) {
            Log.w(TAG, "Settings unreadable, using defaults", e)
            d
        }
    }

    private fun write(s: LumaSettings) {
        prefs.edit {
            putInt(K_VERSION, SCHEMA_VERSION)
            putFloat(K_BLUR, s.blur)
            putFloat(K_TINT_ALPHA, s.tintAlpha)
            putLong(K_TINT_COLOR, s.tintColor)
            putFloat(K_EDGE, s.edge)
            putInt(K_CORNER, s.cornerDp)
            putBoolean(K_REFRACTION, s.refraction)
            putFloat(K_REFRACTION_STRENGTH, s.refractionStrength)
            putBoolean(K_TILT, s.tiltHighlights)
            putString(K_PRESET, s.preset)
            putString(K_WALLPAPER, s.wallpaper)
            putString(K_ICON_STYLE, s.iconStyle)
            putInt(K_ICON_SIZE, s.iconSizeDp)
            putBoolean(K_SHOW_LABELS, s.showLabels)
            putInt(K_COLUMNS, s.columns)
            putString(K_GREETING_NAME, s.greetingName)
            putBoolean(K_SHOW_CLOCK, s.showClock)
            putBoolean(K_SHOW_SEARCH, s.showSearch)
            putBoolean(K_ONBOARDING_DONE, s.onboardingDone)
        }
    }

    private companion object {
        const val TAG = "LumaSettings"
        const val PREFS = "luma_settings"
        const val SCHEMA_VERSION = 1

        const val K_VERSION = "version"
        const val K_BLUR = "blur"
        const val K_TINT_ALPHA = "tint_alpha"
        const val K_TINT_COLOR = "tint_color"
        const val K_EDGE = "edge"
        const val K_CORNER = "corner_dp"
        const val K_REFRACTION = "refraction"
        const val K_REFRACTION_STRENGTH = "refraction_strength"
        const val K_TILT = "tilt_highlights"
        const val K_PRESET = "preset"
        const val K_WALLPAPER = "wallpaper"
        const val K_ICON_STYLE = "icon_style"
        const val K_ICON_SIZE = "icon_size_dp"
        const val K_SHOW_LABELS = "show_labels"
        const val K_COLUMNS = "columns"
        const val K_GREETING_NAME = "greeting_name"
        const val K_SHOW_CLOCK = "show_clock"
        const val K_SHOW_SEARCH = "show_search"
        const val K_ONBOARDING_DONE = "onboarding_done"

        // Typed reads that survive a value of the wrong type (e.g. after a downgrade).
        fun SharedPreferences.float(key: String, def: Float): Float =
            try { getFloat(key, def) } catch (e: ClassCastException) { def }

        fun SharedPreferences.long(key: String, def: Long): Long =
            try { getLong(key, def) } catch (e: ClassCastException) { def }

        fun SharedPreferences.int(key: String, def: Int): Int =
            try { getInt(key, def) } catch (e: ClassCastException) { def }

        fun SharedPreferences.bool(key: String, def: Boolean): Boolean =
            try { getBoolean(key, def) } catch (e: ClassCastException) { def }

        fun SharedPreferences.string(key: String, def: String): String =
            try { getString(key, def) ?: def } catch (e: ClassCastException) { def }
    }
}

/** Clamps every field into its documented range; unknown enum-like strings fall back to defaults. */
internal fun LumaSettings.sanitized(): LumaSettings {
    val d = LumaSettings.DEFAULT
    fun Float.unit(def: Float, max: Float = 1f) = if (isNaN()) def else coerceIn(0f, max)
    val validWallpaper = wallpaper == LumaSettings.WALLPAPER_CUSTOM ||
        (wallpaper.startsWith(LumaSettings.WALLPAPER_PRESET_PREFIX) &&
            wallpaper.length > LumaSettings.WALLPAPER_PRESET_PREFIX.length)
    return copy(
        blur = blur.unit(d.blur),
        tintAlpha = tintAlpha.unit(d.tintAlpha, LumaSettings.TINT_ALPHA_MAX),
        tintColor = tintColor and 0xFFFFFFFFL,
        edge = edge.unit(d.edge),
        cornerDp = cornerDp.coerceIn(LumaSettings.CORNER_MIN_DP, LumaSettings.CORNER_MAX_DP),
        refractionStrength = refractionStrength.unit(d.refractionStrength),
        preset = preset.ifBlank { LumaSettings.PRESET_CUSTOM },
        wallpaper = if (validWallpaper) wallpaper else d.wallpaper,
        iconStyle = if (iconStyle in LumaSettings.ICON_STYLES) iconStyle else d.iconStyle,
        iconSizeDp = iconSizeDp.coerceIn(LumaSettings.ICON_SIZE_MIN_DP, LumaSettings.ICON_SIZE_MAX_DP),
        columns = if (columns >= 5) 5 else 4,
        // Not trimmed: the user may be typing a space between two words right now.
        greetingName = greetingName.replace('\n', ' ').take(LumaSettings.GREETING_NAME_MAX_LENGTH),
    )
}
