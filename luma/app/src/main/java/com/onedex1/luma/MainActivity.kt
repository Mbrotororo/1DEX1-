package com.onedex1.luma

import android.content.ComponentCallbacks2
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.onedex1.luma.ui.HomeEvent
import com.onedex1.luma.ui.LumaRoot
import com.onedex1.luma.ui.components.IconMemory
import com.onedex1.luma.ui.system.SystemActions
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * The home screen activity (HOME + LAUNCHER). Draws edge-to-edge over Luma's own wallpaper;
 * HOME presses while Luma is in front close whatever is open (drawer, settings, menus).
 */
class MainActivity : ComponentActivity() {

    private val homeEvents = MutableSharedFlow<HomeEvent>(
        extraBufferCapacity = 4,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    private val defaultHome = MutableStateFlow(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
        defaultHome.value = SystemActions.isDefaultHome(this)
        startWallpaperEarly()
        registerComponentCallbacks(iconMemoryTrimmer)
        setContent {
            LumaRoot(
                app = lumaApp,
                homeEvents = homeEvents,
                isDefaultHome = defaultHome,
                onDefaultHomeMaybeChanged = { defaultHome.value = SystemActions.isDefaultHome(this) },
            )
        }
    }

    override fun onDestroy() {
        unregisterComponentCallbacks(iconMemoryTrimmer)
        super.onDestroy()
    }

    /**
     * Starts rendering the wallpaper before the first composition, so a cold start (launchers are
     * killed often) shows the real wallpaper and glass as early as possible instead of the
     * fallback gradient. The LaunchedEffects in LumaShell then find it already requested (no-op).
     */
    private fun startWallpaperEarly() {
        try {
            val app = lumaApp
            val s = app.settingsStore.settings.value
            app.wallpaperEngine.setBlur(s.blur) // blur first, so the first publish already uses it
            app.wallpaperEngine.setSource(s.wallpaper)
        } catch (e: Exception) {
            // GlassRoot loads a wallpaper anyway
        }
    }

    private val iconMemoryTrimmer = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) = IconMemory.trim(level)
        override fun onConfigurationChanged(newConfig: Configuration) = Unit

        @Deprecated("Deprecated in Java")
        override fun onLowMemory() = IconMemory.trim(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }

    override fun onResume() {
        super.onResume()
        defaultHome.value = SystemActions.isDefaultHome(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent) // "opened as home or as an app" follows the latest launch (Back handling)
        if (Intent.ACTION_MAIN == intent.action && intent.hasCategory(Intent.CATEGORY_HOME)) {
            // Same check as Launcher3: HOME pressed while Luma is already the visible app.
            val alreadyOnHome = hasWindowFocus() &&
                (intent.flags and Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT) != Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT
            homeEvents.tryEmit(HomeEvent(animate = alreadyOnHome))
        }
    }
}
