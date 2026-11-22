package com.onedex1.luma.screenshots

import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.github.takahirom.roborazzi.captureRoboImage
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.data.glassPreset
import com.onedex1.luma.glass.WallpaperEngine
import com.onedex1.luma.glass.createLiquidShaderOrNull
import com.onedex1.luma.ui.LumaData
import com.onedex1.luma.ui.LumaShell
import com.onedex1.luma.ui.LumaUiController
import com.onedex1.luma.ui.NoOpLumaActions
import com.onedex1.luma.ui.rememberLumaUiController
import com.onedex1.luma.ui.settings.ThumbnailLoader
import com.onedex1.luma.ui.system.BatteryState
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * JVM screenshots of the real Luma UI (Robolectric native graphics, rendered through the
 * HardwareRenderer so the API 33+ AGSL liquid shader runs like on a phone).
 *
 *   ./gradlew :app:recordRoborazziDebug --tests 'com.onedex1.luma.screenshots.*'
 *
 * PNGs land in app/build/outputs/roborazzi/. Device: Pixel 7 class, ~1080x2400 @ 420 dpi, Russian
 * locale, with a fake 45 dp status bar and 24 dp gesture bar so edge-to-edge insets are realistic.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = LumaScreenshotTest.PIXEL_7_RU)
class LumaScreenshotTest {

    val compose = createAndroidComposeRule<ComponentActivity>()

    /**
     * The compose rule launches a bare ComponentActivity. Instead of shipping ui-test-manifest in the
     * debug APK, register that activity with Robolectric's package manager right before the launch
     * (works for testDebugUnitTest and testReleaseUnitTest alike).
     */
    @get:Rule
    val rules: RuleChain = RuleChain.outerRule(RegisterTestActivity).around(compose)

    private lateinit var controller: LumaUiController

    private val base = LumaSettings(onboardingDone = true)

    // ---------------------------------------------------------------------------------------------
    // Required scenes
    // ---------------------------------------------------------------------------------------------

    @Test
    fun home_default() {
        render(base)
        capture("01_home_default")
    }

    @Test
    fun home_bunker_clear() {
        render(withPreset(base, "bunker").copy(iconStyle = LumaSettings.ICON_STYLE_CLEAR))
        capture("02_home_bunker_clear")
    }

    @Test
    fun drawer_open() {
        render(base, drawerOpen = true)
        capture("03_drawer_open")
    }

    @Test
    fun settings_top_and_scrolled() {
        render(base, settingsOpen = true)
        capture("04_settings_1_top")
        val screenH = compose.activity.window.decorView.height
        var page = 2
        while (page < 10) {
            val scroll = controller.settingsScroll
            if (scroll.value >= scroll.maxValue) break
            compose.runOnIdle { scroll.dispatchRawDelta(screenH * 0.78f) }
            settle(rounds = 2)
            capture("04_settings_${page}_scrolled")
            page++
        }
    }

    @Test
    fun app_context_menu() {
        render(base)
        compose.onNodeWithText("Minecraft").performTouchInput { longClick() }
        settle()
        capture("05_app_context_menu")
    }

    @Test
    fun onboarding() {
        render(base.copy(onboardingDone = false))
        capture("06_onboarding")
    }

    // ---------------------------------------------------------------------------------------------
    // Extra scenes for the design review
    // ---------------------------------------------------------------------------------------------

    @Test
    fun desktop_menu() {
        render(base)
        val lastLabel = compose.onNodeWithText("Госуслуги").fetchSemanticsNode().boundsInRoot
        val search = compose.onAllNodesWithContentDescription("Поиск").onFirst().fetchSemanticsNode().boundsInRoot
        val y = (lastLabel.bottom + search.top) / 2f
        compose.onRoot().performTouchInput { longClick(Offset(centerX, y)) }
        settle()
        capture("07_desktop_menu")
    }

    @Test
    fun drawer_search() {
        render(base, drawerOpen = true)
        compose.onNode(hasSetTextAction()).performTextInput("ка")
        settle()
        capture("08_drawer_search")
    }

    /** What Android 8-12 (no RuntimeShader) and the shader-failure fallback draw. */
    @Test
    fun home_plain_path() {
        render(base.copy(refraction = false))
        capture("09_home_plain_fallback")
    }

    @Test
    fun home_ocean_original_5_columns() {
        render(
            withPreset(base, "ocean").copy(
                iconStyle = LumaSettings.ICON_STYLE_ORIGINAL,
                columns = 5,
                greetingName = "Дима",
            ),
        )
        capture("10_home_ocean_original_5col")
    }

    @Test
    fun home_frost_no_labels() {
        render(withPreset(base, "frost").copy(showLabels = false, cornerDp = 40))
        capture("11_home_frost_nolabels")
    }

    @Test
    fun home_neon() {
        render(withPreset(base, "neon"))
        capture("12_home_neon")
    }

    /**
     * Alignment check: almost no blur and no tint, so the wave lines of the wallpaper must continue
     * straight through every glass surface (clock, tiles, search pill, dock) without a jump.
     */
    @Test
    fun glass_alignment_check() {
        render(base.copy(blur = 0f, tintAlpha = 0f, refraction = false, preset = LumaSettings.PRESET_CUSTOM))
        capture("13_alignment_blur0")
    }

    /**
     * Strict alignment check on a test-pattern photo wallpaper (diagonal stripes): blur 0, no tint,
     * no rim. Stripes must run straight through every glass edge. Then the same with the liquid
     * refraction on, to see the lens effect at the rim.
     */
    @Test
    fun glass_alignment_stripes() {
        writeStripeWallpaper()
        val s = base.copy(
            wallpaper = LumaSettings.WALLPAPER_CUSTOM, blur = 0f, tintAlpha = 0f, edge = 0f,
            refraction = false, preset = LumaSettings.PRESET_CUSTOM,
        )
        render(s)
        capture("13b_alignment_stripes_plain")
    }

    @Test
    fun glass_refraction_stripes() {
        writeStripeWallpaper()
        val s = base.copy(
            wallpaper = LumaSettings.WALLPAPER_CUSTOM, blur = 0f, tintAlpha = 0f, edge = 0.75f,
            refraction = true, refractionStrength = 1f, preset = LumaSettings.PRESET_CUSTOM,
        )
        render(s)
        capture("13c_refraction_stripes")
    }

    private fun writeStripeWallpaper() {
        val app = RuntimeEnvironment.getApplication()
        val dm = app.resources.displayMetrics
        val w = minOf(dm.widthPixels, dm.heightPixels)
        val h = maxOf(dm.widthPixels, dm.heightPixels)
        val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        c.drawColor(0xFF10204A.toInt())
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = 14f }
        var i = -h
        var k = 0
        while (i < w + h) {
            p.color = if (k % 2 == 0) 0xFFFFD54F.toInt() else 0xFF4FC3F7.toInt()
            c.drawLine(i.toFloat(), 0f, (i + h).toFloat(), h.toFloat(), p)
            i += 70
            k++
        }
        java.io.File(app.filesDir, WallpaperEngine.CUSTOM_FILE_NAME).outputStream().use {
            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, it)
        }
    }

    /** Android 12: no RuntimeShader at all -> plain path everywhere, "Android 13+" note in settings. */
    @Test
    @Config(sdk = [31])
    fun android12_home() {
        render(base)
        capture("14_android12_home")
    }

    @Test
    @Config(sdk = [31])
    fun android12_settings_glass_section() {
        render(base, settingsOpen = true)
        val screenH = compose.activity.window.decorView.height
        compose.runOnIdle { controller.settingsScroll.dispatchRawDelta(screenH * 0.78f) }
        settle(rounds = 2)
        capture("15_android12_settings_refraction_note")
    }

    /** Sanity check: the AGSL source compiles on Robolectric's Skia (otherwise the fallback is used). */
    @Test
    fun liquid_shader_compiles_or_falls_back() {
        val shader = createLiquidShaderOrNull()
        println("Luma liquid shader on Robolectric: ${if (shader != null) "compiled (RuntimeShader path)" else "unavailable (plain path)"}")
        // Either outcome is fine for the app; this only must not throw.
        assertTrue(true)
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private fun withPreset(settings: LumaSettings, id: String): LumaSettings {
        val p = glassPreset(id) ?: error("no preset $id")
        return settings.copy(
            preset = p.id,
            tintColor = p.tintColor,
            tintAlpha = p.tintAlpha,
            blur = p.blur,
            edge = p.edge,
            wallpaper = p.wallpaper ?: settings.wallpaper,
        )
    }

    /** Engine with the wallpaper and blur already computed, so the first frame is final. */
    private fun engineFor(settings: LumaSettings): WallpaperEngine {
        val engine = WallpaperEngine(RuntimeEnvironment.getApplication())
        engine.setBlur(settings.blur)
        engine.setSource(settings.wallpaper)
        runBlocking { withTimeout(90_000) { engine.backdrop.first { it != null } } }
        return engine
    }

    private fun render(settings: LumaSettings, drawerOpen: Boolean = false, settingsOpen: Boolean = false) {
        val engine = engineFor(settings)
        compose.runOnUiThread {
            compose.activity.enableEdgeToEdge(
                statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
                navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            )
        }
        compose.setContent {
            val c = rememberLumaUiController(initialDrawerOpen = drawerOpen, initialSettingsOpen = settingsOpen)
            controller = c
            val thumbs: ThumbnailLoader = remember(engine) { { id, w, h -> engine.loadThumbnail(id, w, h) } }
            LumaShell(
                data = LumaData(
                    apps = FakeLauncherData.apps,
                    home = FakeLauncherData.home,
                    dock = FakeLauncherData.dock,
                    settings = settings,
                    nowMillis = FakeLauncherData.fixedTime,
                    battery = BatteryState(level = 82, charging = false),
                    isDefaultHome = false,
                    versionName = "1.0",
                ),
                actions = NoOpLumaActions,
                engine = engine,
                iconLoader = FakeLauncherData.iconLoader,
                thumbnailLoader = thumbs,
                controller = c,
            )
        }
        settle(rounds = 1)
        applyFakeSystemBars()
        settle()
    }

    /** Robolectric has no system bars: hand the Compose view Pixel-like edge-to-edge insets. */
    private fun applyFakeSystemBars() {
        compose.runOnUiThread {
            val content = compose.activity.findViewById<ViewGroup>(android.R.id.content)
            val insets = WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, STATUS_BAR_PX, 0, 0))
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, NAV_BAR_PX))
                .setVisible(WindowInsetsCompat.Type.statusBars(), true)
                .setVisible(WindowInsetsCompat.Type.navigationBars(), true)
                .build()
            ViewCompat.dispatchApplyWindowInsets(content.getChildAt(0) ?: content, insets)
        }
    }

    /** Let animations, icon loads and async thumbnails (Dispatchers.Default) land. */
    private fun settle(rounds: Int = 3) {
        compose.waitForIdle()
        repeat(rounds) {
            Thread.sleep(300)
            compose.mainClock.advanceTimeBy(800)
            compose.waitForIdle()
        }
    }

    private fun capture(name: String) {
        compose.onRoot().captureRoboImage("build/outputs/roborazzi/$name.png")
    }

    companion object {
        /** Pixel 7: 411x914 dp @ 420 dpi = ~1080x2400 px, Russian locale. */
        const val PIXEL_7_RU = "ru-rRU-w411dp-h914dp-normal-long-notround-port-notnight-420dpi-finger-keyshidden-nonav"
        const val STATUS_BAR_PX = 118 // 45 dp (punch-hole status bar)
        const val NAV_BAR_PX = 63 // 24 dp gesture handle area
    }
}

/** Makes `androidx.activity.ComponentActivity` resolvable for ActivityScenario under Robolectric. */
private object RegisterTestActivity : ExternalResource() {
    override fun before() {
        val app = RuntimeEnvironment.getApplication()
        val component = ComponentName(app.packageName, ComponentActivity::class.java.name)
        val pm = shadowOf(app.packageManager)
        pm.addActivityIfNotPresent(component)
        pm.addIntentFilterForActivity(
            component,
            IntentFilter(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) },
        )
    }
}
