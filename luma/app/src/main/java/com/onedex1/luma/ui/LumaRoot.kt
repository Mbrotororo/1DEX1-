package com.onedex1.luma.ui

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.onedex1.luma.BuildConfig
import com.onedex1.luma.LumaApp
import com.onedex1.luma.R
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.LayoutStore
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.ui.components.IconLoader
import com.onedex1.luma.ui.settings.ThumbnailLoader
import com.onedex1.luma.ui.system.SystemActions
import com.onedex1.luma.ui.system.rememberBatteryState
import com.onedex1.luma.ui.system.rememberClockMillis
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Glues the process singletons of [LumaApp] (apps, layout, settings, wallpaper engine) and the
 * system (battery, clock, photo picker, home-role dialog) to the stateless [LumaShell].
 */
@Composable
fun LumaRoot(
    app: LumaApp,
    homeEvents: Flow<HomeEvent>,
    isDefaultHome: StateFlow<Boolean>,
    onDefaultHomeMaybeChanged: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = app.appRepository
    val layout = app.layoutStore
    val settingsStore = app.settingsStore
    val engine = app.wallpaperEngine

    val apps by repository.apps.collectAsStateWithLifecycle()
    val iconsVersion by repository.iconsVersion.collectAsStateWithLifecycle()
    val home by layout.home.collectAsStateWithLifecycle()
    val dock by layout.dock.collectAsStateWithLifecycle()
    val settings by settingsStore.settings.collectAsStateWithLifecycle()
    val defaultHome by isDefaultHome.collectAsStateWithLifecycle()
    val battery by rememberBatteryState()
    val now by rememberClockMillis()

    var hasCustom by remember { mutableStateOf(engine.hasCustom()) }
    var customVersion by remember { mutableIntStateOf(0) }
    var applyingSystem by remember { mutableStateOf(false) }

    // Reconcile the layout with the app list, then the first-run layout (prune may ask for the
    // defaults to be rebuilt after a mass disappearance, so it goes first).
    LaunchedEffect(apps) {
        if (apps.isNotEmpty()) {
            withContext(Dispatchers.Default) {
                layout.prune(apps.mapTo(HashSet(apps.size)) { it.key })
                layout.ensureDefaults(apps)
            }
        }
    }

    // A custom photo selected while its file is missing (e.g. data restored) → back to a preset.
    LaunchedEffect(settings.wallpaper, hasCustom) {
        if (settings.wallpaper == LumaSettings.WALLPAPER_CUSTOM && !hasCustom) {
            settingsStore.update { it.copy(wallpaper = LumaSettings.presetWallpaper("ocean")) }
        }
    }

    // ---- photo picker (no permission needed)
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val ok = try {
                    engine.importCustom(uri)
                } catch (e: Exception) {
                    false
                }
                if (ok) {
                    hasCustom = true
                    customVersion++
                    settingsStore.update { it.copy(wallpaper = LumaSettings.WALLPAPER_CUSTOM) }
                } else {
                    SystemActions.toast(context, R.string.error_photo)
                }
            }
        }
    }

    // ---- "make Luma the home app"
    val roleLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        onDefaultHomeMaybeChanged()
        // Whatever happened (dialog cancelled, "don't ask again", firmware that blocks the role
        // request for third-party launchers, e.g. MIUI): if Luma is still not the home app, show
        // the system "Home app" screen so the button never silently does nothing.
        if (result.resultCode != Activity.RESULT_OK && !SystemActions.isDefaultHome(context)) {
            SystemActions.openHomeSettings(context)
        }
    }

    val iconLoader: IconLoader = remember(repository) { { key, size -> repository.loadIcon(key, size) } }
    val thumbnailLoader: ThumbnailLoader = remember(engine) { { id, w, h -> engine.loadThumbnail(id, w, h) } }

    val actions = remember(repository, layout, settingsStore, engine) {
        object : LumaActions {
            override fun launch(app: AppInfo, sourceBounds: android.graphics.Rect?) = repository.launch(app.key, sourceBounds)
            override fun openAppInfo(app: AppInfo) = repository.openAppInfo(app.key)
            override fun uninstall(app: AppInfo) = repository.uninstall(app.key)
            override fun canUninstall(app: AppInfo): Boolean = repository.canUninstall(app.key)
            override fun addToHome(key: String) = layout.addToHome(key)
            override fun removeFromHome(key: String) = layout.removeFromHome(key)
            override fun addToDock(key: String): Boolean = layout.addToDock(key)
            override fun removeFromDock(key: String) = layout.removeFromDock(key)
            override fun updateSettings(transform: (LumaSettings) -> LumaSettings) = settingsStore.update(transform)
            override fun applyPreset(id: String) = settingsStore.applyPreset(id)

            override fun pickPhoto() {
                try {
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                } catch (e: Exception) {
                    SystemActions.toast(context, R.string.error_photo_picker)
                }
            }

            override fun applySystemWallpaper() {
                if (applyingSystem) return
                applyingSystem = true
                scope.launch {
                    val ok = try {
                        engine.applyAsSystemWallpaper()
                    } catch (e: Exception) {
                        false
                    }
                    applyingSystem = false
                    SystemActions.toast(context, if (ok) R.string.wallpaper_applied else R.string.error_wallpaper_apply)
                }
            }

            override fun requestDefaultHome() {
                if (SystemActions.isDefaultHome(context)) {
                    // Already the home app (e.g. picked with "Always" in the system chooser).
                    onDefaultHomeMaybeChanged()
                    SystemActions.toast(context, R.string.default_is_luma)
                    return
                }
                val intent = SystemActions.homeRoleRequestIntent(context)
                if (intent == null) {
                    SystemActions.openHomeSettings(context)
                    return
                }
                try {
                    roleLauncher.launch(intent)
                } catch (e: Exception) {
                    SystemActions.openHomeSettings(context)
                }
            }

            override fun leaveToPreviousApp() {
                val activity = context as? Activity ?: return
                try {
                    val launchedAsHome = activity.intent?.hasCategory(Intent.CATEGORY_HOME) == true
                    if (!launchedAsHome && !SystemActions.isDefaultHome(activity)) activity.moveTaskToBack(true)
                } catch (e: Exception) {
                    // ignore: Back simply stays on Luma
                }
            }

            override fun openHomeSettings() {
                SystemActions.openHomeSettings(context)
            }

            override fun expandNotifications() {
                SystemActions.expandNotifications(context)
            }

            override fun showMessage(message: Int) = SystemActions.toast(context, message)
        }
    }

    val data = LumaData(
        apps = apps,
        home = home,
        dock = dock.take(LayoutStore.MAX_DOCK),
        settings = settings,
        iconsVersion = iconsVersion,
        nowMillis = now,
        battery = battery,
        isDefaultHome = defaultHome,
        hasCustomWallpaper = hasCustom,
        customWallpaperVersion = customVersion,
        applyingSystemWallpaper = applyingSystem,
        versionName = BuildConfig.VERSION_NAME,
    )

    LumaShell(
        data = data,
        actions = actions,
        engine = engine,
        iconLoader = iconLoader,
        thumbnailLoader = thumbnailLoader,
        homeEvents = homeEvents,
    )
}
