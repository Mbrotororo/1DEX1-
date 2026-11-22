package com.onedex1.luma.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.glass.WallpaperEngine
import com.onedex1.luma.ui.components.IconLoader
import com.onedex1.luma.ui.menu.MenuItem
import com.onedex1.luma.ui.menu.MenuRequest
import com.onedex1.luma.ui.settings.ThumbnailLoader
import com.onedex1.luma.ui.system.BatteryState
import com.onedex1.luma.ui.theme.LumaIcons
import java.util.Calendar

/** Which part of the launcher [LumaPreviewScene] shows. */
enum class PreviewScreen { Home, Drawer, Settings, Onboarding, Menu }

/** Fake data for previews and screenshot tests. */
object PreviewData {
    private val labels = listOf(
        "Настройки" to "com.android.settings",
        "Play Маркет" to "com.android.vending",
        "Фото" to "com.google.android.apps.photos",
        "YouTube" to "com.google.android.youtube",
        "Часы" to "com.google.android.deskclock",
        "Календарь" to "com.google.android.calendar",
        "Карты" to "com.google.android.apps.maps",
        "Gmail" to "com.google.android.gm",
        "Telegram" to "org.telegram.messenger",
        "ВКонтакте" to "com.vkontakte.android",
        "TikTok" to "com.zhiliaoapp.musically",
        "Minecraft" to "com.mojang.minecraftpe",
        "Discord" to "com.discord",
        "Музыка" to "ru.yandex.music",
        "Twitch" to "tv.twitch.android.app",
        "YouTube Studio" to "com.google.android.apps.youtube.creator",
        "Телефон" to "com.google.android.dialer",
        "Сообщения" to "com.google.android.apps.messaging",
        "Chrome" to "com.android.chrome",
        "Камера" to "com.android.camera",
        "Калькулятор" to "com.google.android.calculator",
        "Заметки" to "com.google.android.keep",
        "Погода" to "com.weather.app",
        "Файлы" to "com.google.android.apps.nbu.files",
    )

    val apps: List<AppInfo> = labels.map { (label, pkg) ->
        AppInfo(key = "$pkg/$pkg.Main", packageName = pkg, className = "$pkg.Main", label = label)
    }.sortedBy { it.label.lowercase() }

    val home: List<String> = labels.take(16).map { "${it.second}/${it.second}.Main" }
    val dock: List<String> = labels.drop(16).take(4).map { "${it.second}/${it.second}.Main" }

    /** Saturday, 21 November 2026, 21:47. */
    val fixedTime: Long = Calendar.getInstance().apply {
        set(2026, Calendar.NOVEMBER, 21, 21, 47, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    private val palette = intArrayOf(
        0xFF3D7BFF.toInt(), 0xFFFF5F6D.toInt(), 0xFF34C759.toInt(), 0xFFFF9F0A.toInt(),
        0xFFAF52DE.toInt(), 0xFF00C7BE.toInt(), 0xFFFF375F.toInt(), 0xFF5856D6.toInt(),
        0xFF64D2FF.toInt(), 0xFFFFD60A.toInt(), 0xFF30B0C7.toInt(), 0xFF8E8E93.toInt(),
    )

    /** A colourful squircle with the first letter of the label: stands in for real app icons. */
    fun fakeIcon(key: String, sizePx: Int): ImageBitmap {
        val size = sizePx.coerceAtLeast(8)
        val app = apps.firstOrNull { it.key == key }
        val color = palette[(key.hashCode() and 0x7fffffff) % palette.size]
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader = LinearGradient(0f, 0f, size.toFloat(), size.toFloat(), lighten(color), color, Shader.TileMode.CLAMP)
        val r = size * 0.24f
        c.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), r, r, p)
        p.shader = null
        p.color = 0xFFFFFFFF.toInt()
        p.textAlign = Paint.Align.CENTER
        p.typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        p.textSize = size * 0.46f
        val letter = (app?.label?.firstOrNull() ?: '?').uppercase()
        c.drawText(letter, size / 2f, size / 2f - (p.descent() + p.ascent()) / 2f, p)
        return bmp.asImageBitmap()
    }

    private fun lighten(color: Int): Int {
        val r = ((color shr 16) and 0xFF) + (255 - ((color shr 16) and 0xFF)) / 3
        val g = ((color shr 8) and 0xFF) + (255 - ((color shr 8) and 0xFF)) / 3
        val b = (color and 0xFF) + (255 - (color and 0xFF)) / 3
        return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }

    val iconLoader: IconLoader = { key, size -> fakeIcon(key, size) }
}

/**
 * Renders the launcher from fake data — for screenshot tests and Android Studio previews.
 * Pass your own [engine] to control when the wallpaper is ready (it loads asynchronously).
 */
@Composable
fun LumaPreviewScene(
    screen: PreviewScreen = PreviewScreen.Home,
    settings: LumaSettings = LumaSettings(onboardingDone = screen != PreviewScreen.Onboarding),
    apps: List<AppInfo> = PreviewData.apps,
    home: List<String> = PreviewData.home,
    dock: List<String> = PreviewData.dock,
    nowMillis: Long = PreviewData.fixedTime,
    battery: BatteryState? = BatteryState(level = 82, charging = false),
    engine: WallpaperEngine? = null,
    iconLoader: IconLoader = PreviewData.iconLoader,
) {
    val context = LocalContext.current
    val wallpaperEngine = engine ?: remember { WallpaperEngine(context) }
    val thumbnailLoader: ThumbnailLoader = remember(wallpaperEngine) { { id, w, h -> wallpaperEngine.loadThumbnail(id, w, h) } }
    val settingsForScreen = if (screen == PreviewScreen.Onboarding) settings.copy(onboardingDone = false) else settings
    val controller = rememberLumaUiController(
        initialDrawerOpen = screen == PreviewScreen.Drawer,
        initialSettingsOpen = screen == PreviewScreen.Settings,
    )
    LaunchedEffect(screen) {
        if (screen != PreviewScreen.Menu) return@LaunchedEffect
        val target = apps.firstOrNull { it.key == home.firstOrNull() }
        controller.menu = MenuRequest(
            anchor = androidx.compose.ui.geometry.Rect(60f, 600f, 220f, 760f),
            title = target?.label,
            items = listOf(
                MenuItem("remove_home", "Убрать с экрана", LumaIcons.MinusCircle),
                MenuItem("add_dock", "В док", LumaIcons.DockIn),
                MenuItem("info", "О приложении", LumaIcons.Info),
                MenuItem("uninstall", "Удалить", LumaIcons.Trash, destructive = true),
            ),
            app = target,
        )
    }
    LumaShell(
        data = LumaData(
            apps = apps,
            home = home,
            dock = dock,
            settings = settingsForScreen,
            nowMillis = nowMillis,
            battery = battery,
            isDefaultHome = false,
            versionName = "1.0",
        ),
        actions = NoOpLumaActions,
        engine = wallpaperEngine,
        iconLoader = iconLoader,
        thumbnailLoader = thumbnailLoader,
        controller = controller,
    )
}

@Preview(name = "Домой", widthDp = 393, heightDp = 852, showBackground = true, backgroundColor = 0xFF020A3C)
@Composable
private fun HomePreview() = LumaPreviewScene(PreviewScreen.Home)

@Preview(name = "Приложения", widthDp = 393, heightDp = 852, showBackground = true, backgroundColor = 0xFF020A3C)
@Composable
private fun DrawerPreview() = LumaPreviewScene(PreviewScreen.Drawer)

@Preview(name = "Настройки", widthDp = 393, heightDp = 852, showBackground = true, backgroundColor = 0xFF020A3C)
@Composable
private fun SettingsPreview() = LumaPreviewScene(PreviewScreen.Settings)

@Preview(name = "Знакомство", widthDp = 393, heightDp = 852, showBackground = true, backgroundColor = 0xFF020A3C)
@Composable
private fun OnboardingPreview() = LumaPreviewScene(PreviewScreen.Onboarding)
