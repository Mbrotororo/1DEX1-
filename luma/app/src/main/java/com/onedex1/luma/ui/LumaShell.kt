package com.onedex1.luma.ui

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.onedex1.luma.R
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.glass.GlassRoot
import com.onedex1.luma.glass.GlassStyle
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.glass.LocalGlassStyle
import com.onedex1.luma.glass.WallpaperEngine
import com.onedex1.luma.ui.components.AppIconVisual
import com.onedex1.luma.ui.components.DrawerScrollConnection
import com.onedex1.luma.ui.components.HomeScrollConnection
import com.onedex1.luma.ui.components.IconLoader
import com.onedex1.luma.ui.components.IconLook
import com.onedex1.luma.ui.components.SheetState
import com.onedex1.luma.ui.components.rememberSheetState
import com.onedex1.luma.ui.drawer.DrawerScreen
import com.onedex1.luma.ui.home.AppPlace
import com.onedex1.luma.ui.home.HomeScreen
import com.onedex1.luma.ui.menu.GlassMenuHost
import com.onedex1.luma.ui.menu.MenuItem
import com.onedex1.luma.ui.menu.MenuRequest
import com.onedex1.luma.ui.menu.pointAnchor
import com.onedex1.luma.ui.onboarding.OnboardingCard
import com.onedex1.luma.ui.settings.SettingsScreen
import com.onedex1.luma.ui.settings.ThumbnailLoader
import com.onedex1.luma.ui.system.BatteryState
import com.onedex1.luma.ui.theme.LumaIcons
import com.onedex1.luma.ui.theme.LumaTheme
import com.onedex1.luma.ui.theme.LumaType
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

/** HOME was pressed. [animate] is false when Luma comes back from another app. */
@Immutable
data class HomeEvent(val animate: Boolean)

/** Everything the shell shows; plain data so screenshot tests can fake it. */
@Immutable
data class LumaData(
    val apps: List<AppInfo> = emptyList(),
    val home: List<String> = emptyList(),
    val dock: List<String> = emptyList(),
    val settings: LumaSettings = LumaSettings(),
    val iconsVersion: Int = 0,
    val nowMillis: Long = 0L,
    val battery: BatteryState? = null,
    val isDefaultHome: Boolean = false,
    val hasCustomWallpaper: Boolean = false,
    val customWallpaperVersion: Int = 0,
    val applyingSystemWallpaper: Boolean = false,
    val versionName: String = "1.0",
)

/** What the shell can ask the outside world to do. Every method has a harmless default. */
interface LumaActions {
    fun launch(app: AppInfo, sourceBounds: android.graphics.Rect?) {}
    fun openAppInfo(app: AppInfo) {}
    fun uninstall(app: AppInfo) {}
    fun canUninstall(app: AppInfo): Boolean = true
    fun addToHome(key: String) {}
    fun removeFromHome(key: String) {}
    fun addToDock(key: String): Boolean = true
    fun removeFromDock(key: String) {}
    fun updateSettings(transform: (LumaSettings) -> LumaSettings) {}
    fun applyPreset(id: String) {}
    fun pickPhoto() {}
    fun applySystemWallpaper() {}
    fun requestDefaultHome() {}
    fun openHomeSettings() {}
    fun expandNotifications() {}
    fun showMessage(@StringRes message: Int) {}

    /** Back on the bare home screen while Luma was opened as a regular app (not as home). */
    fun leaveToPreviousApp() {}
}

object NoOpLumaActions : LumaActions

/** Transient UI state of the shell: drawer, settings, menu, search. */
@Stable
class LumaUiController internal constructor(
    val drawer: SheetState,
    settingsOpenState: MutableState<Boolean>,
    queryState: MutableState<String>,
    val homeGrid: LazyGridState,
    val drawerGrid: LazyGridState,
    val settingsScroll: ScrollState,
) {
    var settingsOpen by settingsOpenState
    var query by queryState
    var menu by mutableStateOf<MenuRequest?>(null)
    var focusSearchToken by mutableIntStateOf(0)
    var scrollToWallpaperToken by mutableIntStateOf(0)

    fun openDrawer(withKeyboard: Boolean) {
        menu = null
        drawer.open()
        if (withKeyboard) focusSearchToken++
    }

    fun openSettings(atWallpaper: Boolean) {
        menu = null
        drawer.close()
        settingsOpen = true
        if (atWallpaper) scrollToWallpaperToken++
    }
}

@Composable
fun rememberLumaUiController(
    initialDrawerOpen: Boolean = false,
    initialSettingsOpen: Boolean = false,
    initialQuery: String = "",
): LumaUiController {
    val drawer = rememberSheetState(if (initialDrawerOpen) 1f else 0f)
    val settingsOpen = rememberSaveable { mutableStateOf(initialSettingsOpen) }
    val query = rememberSaveable { mutableStateOf(initialQuery) }
    val homeGrid = rememberLazyGridState()
    val drawerGrid = rememberLazyGridState()
    val settingsScroll = rememberScrollState()
    return remember { LumaUiController(drawer, settingsOpen, query, homeGrid, drawerGrid, settingsScroll) }
}

/** Builds the glass look from the settings. */
fun glassStyleOf(settings: LumaSettings): GlassStyle = GlassStyle(
    tint = Color(settings.tintColor.toInt()),
    tintAlpha = settings.tintAlpha,
    edge = settings.edge,
    refraction = if (settings.refraction) settings.refractionStrength else 0f,
    // A gentle boost keeps the glass clear; 1.35 (the GlassStyle default) reads as coloured plastic.
    saturation = LUMA_GLASS_SATURATION,
)

/** Backdrop saturation of Luma's glass. */
const val LUMA_GLASS_SATURATION = 1.16f

/**
 * The whole launcher UI on top of the wallpaper: home, drawer, settings, onboarding and menus.
 * Data comes in through [data], everything the user does goes out through [actions].
 */
@Composable
fun LumaShell(
    data: LumaData,
    actions: LumaActions,
    engine: WallpaperEngine,
    iconLoader: IconLoader,
    thumbnailLoader: ThumbnailLoader,
    controller: LumaUiController = rememberLumaUiController(),
    homeEvents: Flow<HomeEvent>? = null,
) {
    val settings = data.settings
    LaunchedEffect(engine, settings.wallpaper) { engine.setSource(settings.wallpaper) }
    LaunchedEffect(engine, settings.blur) { engine.setBlur(settings.blur) }
    val style = remember(settings.tintColor, settings.tintAlpha, settings.edge, settings.refraction, settings.refractionStrength) {
        glassStyleOf(settings)
    }
    GlassRoot(engine = engine, style = style, tiltEnabled = settings.tiltHighlights) {
        LumaTheme {
            ShellContent(data, actions, engine, iconLoader, thumbnailLoader, controller, homeEvents, style)
        }
    }
}

private fun Modifier.blockTouches(): Modifier = pointerInput(Unit) {
    awaitPointerEventScope {
        while (true) {
            val event = awaitPointerEvent()
            event.changes.forEach { it.consume() }
        }
    }
}

@Composable
private fun ShellContent(
    data: LumaData,
    actions: LumaActions,
    engine: WallpaperEngine,
    iconLoader: IconLoader,
    thumbnailLoader: ThumbnailLoader,
    controller: LumaUiController,
    homeEvents: Flow<HomeEvent>?,
    style: GlassStyle,
) {
    val settings = data.settings
    val density = LocalDensity.current
    val resources = LocalContext.current.resources
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val drawer = controller.drawer
    val currentActions by rememberUpdatedState(actions)
    val searchFocus = remember { FocusRequester() }
    val look = IconLook.from(settings, data.iconsVersion)
    val corner = settings.cornerDp.dp

    // ---- settings open / close animation
    val settingsProgress = remember { Animatable(if (controller.settingsOpen) 1f else 0f) }
    LaunchedEffect(controller.settingsOpen) {
        val open = controller.settingsOpen
        if (open) {
            controller.menu = null
        } else {
            focusManager.clearFocus()
        }
        settingsProgress.animateTo(
            if (open) 1f else 0f,
            spring(dampingRatio = if (open) 0.86f else 1f, stiffness = if (open) 360f else 520f),
        )
    }
    val settingsVisible by remember { derivedStateOf { controller.settingsOpen || settingsProgress.value > 0.001f } }
    val drawerVisible by remember { derivedStateOf { drawer.progress > 0f } }

    // ---- onboarding
    val onboardingAlpha by animateFloatAsState(
        if (!settings.onboardingDone) 1f else 0f,
        spring(dampingRatio = 1f, stiffness = 300f),
        label = "onboarding",
    )
    val onboardingVisible by remember { derivedStateOf { onboardingAlpha > 0.001f } }

    // ---- gestures
    val pullDownPx = with(density) { 46.dp.toPx() }
    val homeConnection = remember(drawer) {
        HomeScrollConnection(drawer, pullDownPx) { currentActions.expandNotifications() }
    }
    val drawerConnection = remember(drawer) { DrawerScrollConnection(drawer) }

    // ---- drawer side effects: keyboard, reset when closed
    LaunchedEffect(drawer) {
        snapshotFlow { drawer.progress < 0.6f }.distinctUntilChanged().collect { closing ->
            if (closing) {
                keyboard?.hide()
                focusManager.clearFocus()
            }
        }
    }
    LaunchedEffect(drawer) {
        snapshotFlow { drawer.progress == 0f }.distinctUntilChanged().collect { closed ->
            if (closed) {
                controller.query = ""
                if (controller.drawerGrid.firstVisibleItemIndex > 0 || controller.drawerGrid.firstVisibleItemScrollOffset > 0) {
                    controller.drawerGrid.scrollToItem(0)
                }
            }
        }
    }
    LaunchedEffect(controller.focusSearchToken) {
        if (controller.focusSearchToken == 0) return@LaunchedEffect
        repeat(12) {
            delay(40)
            val ok = try {
                searchFocus.requestFocus()
                true
            } catch (e: IllegalStateException) {
                false
            }
            if (ok) {
                keyboard?.show()
                return@LaunchedEffect
            }
        }
    }

    // ---- HOME button
    LaunchedEffect(homeEvents) {
        homeEvents?.collect { event ->
            val hadOverlay = controller.menu != null || controller.settingsOpen || drawer.progress > 0f
            controller.menu = null
            keyboard?.hide()
            focusManager.clearFocus()
            controller.settingsOpen = false
            if (event.animate) {
                drawer.close()
            } else {
                drawer.snapTo(0f)
                settingsProgress.snapTo(0f)
                controller.query = ""
            }
            if (!hadOverlay) {
                launch { controller.homeGrid.animateScrollToItem(0) }
            }
        }
    }

    // ---- leaving Luma (an app was opened): reset the drawer and menus
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, drawer) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                controller.menu = null
                if (drawer.progress > 0f) {
                    drawer.snapTo(0f)
                    controller.query = ""
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // ---- Back closes whatever is open. As the home app it never leaves the home screen; opened
    // as a regular app (from the installer / another launcher) it goes back to where it came from.
    BackHandler(enabled = true) {
        when {
            controller.menu != null -> controller.menu = null
            controller.settingsOpen -> controller.settingsOpen = false
            drawer.progress > 0f -> drawer.close()
            !settings.onboardingDone -> currentActions.updateSettings { it.copy(onboardingDone = true) }
            data.isDefaultHome -> scope.launch { controller.homeGrid.animateScrollToItem(0) }
            else -> {
                scope.launch { controller.homeGrid.animateScrollToItem(0) }
                currentActions.leaveToPreviousApp()
            }
        }
    }

    // ---- menus
    fun appMenu(app: AppInfo, bounds: Rect, place: AppPlace): MenuRequest {
        val onHome = app.key in data.home
        val inDock = app.key in data.dock
        val items = buildList {
            if (onHome) {
                add(MenuItem(ID_REMOVE_HOME, resources.getString(R.string.menu_remove_from_home), LumaIcons.MinusCircle))
            } else {
                add(MenuItem(ID_ADD_HOME, resources.getString(R.string.menu_add_to_home), LumaIcons.Home))
            }
            if (inDock) {
                add(MenuItem(ID_REMOVE_DOCK, resources.getString(R.string.menu_remove_from_dock), LumaIcons.DockOut))
            } else {
                add(MenuItem(ID_ADD_DOCK, resources.getString(R.string.menu_add_to_dock), LumaIcons.DockIn))
            }
            add(MenuItem(ID_INFO, resources.getString(R.string.menu_app_info), LumaIcons.Info))
            if (currentActions.canUninstall(app)) {
                add(MenuItem(ID_UNINSTALL, resources.getString(R.string.menu_uninstall), LumaIcons.Trash, destructive = true))
            }
        }
        val sizeDp = with(density) { bounds.width.toDp() }
        val labelShown = when (place) {
            AppPlace.Drawer -> true
            AppPlace.Home -> settings.showLabels
            AppPlace.Dock -> false
        }
        // The anchor is the icon; the menu must also clear the label under it.
        val clearBelow = if (labelShown) with(density) { 7.dp.toPx() + LumaType.iconLabel.lineHeight.toPx() } else 0f
        return MenuRequest(
            anchor = bounds,
            title = app.label,
            items = items,
            app = app,
            clearBelow = clearBelow,
            lifted = if (bounds.width > 1f && bounds.height > 1f) {
                { AppIconVisual(app.key, sizeDp, look, iconLoader) }
            } else {
                null
            },
        )
    }

    fun desktopMenu(at: Offset): MenuRequest = MenuRequest(
        anchor = pointAnchor(at),
        title = null,
        items = listOf(
            MenuItem(ID_WALLPAPER, resources.getString(R.string.menu_wallpaper), LumaIcons.Photo),
            MenuItem(ID_SETTINGS, resources.getString(R.string.menu_settings), LumaIcons.Sliders),
        ),
    )

    fun onMenuItem(request: MenuRequest, item: MenuItem) {
        val app = request.app
        controller.menu = null
        when (item.id) {
            ID_REMOVE_HOME -> app?.let { currentActions.removeFromHome(it.key) }
            ID_ADD_HOME -> app?.let { currentActions.addToHome(it.key) }
            ID_ADD_DOCK -> app?.let { if (!currentActions.addToDock(it.key)) currentActions.showMessage(R.string.dock_full) }
            ID_REMOVE_DOCK -> app?.let { currentActions.removeFromDock(it.key) }
            ID_INFO -> app?.let { currentActions.openAppInfo(it) }
            ID_UNINSTALL -> app?.let { currentActions.uninstall(it) }
            ID_WALLPAPER -> controller.openSettings(atWallpaper = true)
            ID_SETTINGS -> controller.openSettings(atWallpaper = false)
        }
    }

    val byKey = remember(data.apps) { data.apps.associateBy { it.key } }
    val previewApps = remember(byKey, data.home, data.dock) {
        (data.home + data.dock).mapNotNull { byKey[it] }.take(5).ifEmpty { data.apps.take(5) }
    }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .onSizeChanged { drawer.travelPx = it.height.toFloat() },
    ) {
        val screenHeight = maxHeight

        // ---------------- Home
        HomeScreen(
            apps = data.apps,
            home = data.home,
            dock = data.dock,
            settings = settings,
            iconLoader = iconLoader,
            iconsVersion = data.iconsVersion,
            nowMillis = data.nowMillis,
            battery = data.battery,
            gridState = controller.homeGrid,
            scrollConnection = homeConnection,
            onVerticalDrag = { homeConnection.onDrag(it) },
            onVerticalDragStopped = { homeConnection.onDragStopped(it) },
            onAppClick = { app, bounds -> currentActions.launch(app, bounds) },
            onAppLongClick = { app, bounds, place -> controller.menu = appMenu(app, bounds, place) },
            onEmptyLongClick = { at -> controller.menu = desktopMenu(at) },
            onSearchClick = { controller.openDrawer(withKeyboard = true) },
            modifier = Modifier.graphicsLayer {
                val p = max(drawer.progress, settingsProgress.value)
                alpha = (1f - p * 1.15f).coerceIn(0f, 1f)
                val s = 1f - 0.07f * p
                scaleX = s
                scaleY = s
            },
        )

        // ---------------- Drawer: full-screen heavy glass sheet
        if (drawerVisible) {
            val extra = 64.dp
            val sheetCorner = corner + 12.dp
            val sheetStyle = remember(style) { style.copy(heavy = true, shadow = false) }
            // Tiles inside the sheet are glass on frosted glass: they sample the same heavy backdrop.
            val innerStyle = remember(style) { style.copy(heavy = true) }
            Box(
                Modifier
                    .fillMaxSize()
                    .offset {
                        // Fully open, the rounded top corners slide above the screen edge, so no
                        // wallpaper wedges show next to the status bar.
                        val p = drawer.progress
                        IntOffset(0, ((1f - p) * drawer.travelPx - p * sheetCorner.toPx()).roundToInt())
                    },
            ) {
                GlassSurface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .wrapContentHeight(align = Alignment.Top, unbounded = true)
                        .height(screenHeight + extra + sheetCorner)
                        .blockTouches(),
                    cornerRadius = sheetCorner,
                    style = sheetStyle,
                ) {
                    CompositionLocalProvider(LocalGlassStyle provides innerStyle) {
                        DrawerScreen(
                            apps = data.apps,
                            settings = settings,
                            iconLoader = iconLoader,
                            iconsVersion = data.iconsVersion,
                            query = controller.query,
                            onQueryChange = { controller.query = it },
                            onAppClick = { app, bounds -> currentActions.launch(app, bounds) },
                            onAppLongClick = { app, bounds -> controller.menu = appMenu(app, bounds, AppPlace.Drawer) },
                            gridState = controller.drawerGrid,
                            focusRequester = searchFocus,
                            scrollConnection = drawerConnection,
                            onHeaderDrag = { drawer.dragBy(it) },
                            onHeaderDragStopped = { drawer.settle(it) },
                            modifier = Modifier
                                .padding(top = sheetCorner)
                                .fillMaxWidth()
                                .height(screenHeight),
                        )
                    }
                }
            }
        }

        // ---------------- Settings
        if (settingsVisible) {
            SettingsScreen(
                settings = settings,
                wallpapers = engine.presets,
                hasCustomWallpaper = data.hasCustomWallpaper,
                customWallpaperVersion = data.customWallpaperVersion,
                thumbnailLoader = thumbnailLoader,
                previewApps = previewApps,
                iconLoader = iconLoader,
                iconsVersion = data.iconsVersion,
                nowMillis = data.nowMillis,
                isDefaultHome = data.isDefaultHome,
                versionName = data.versionName,
                applyingSystemWallpaper = data.applyingSystemWallpaper,
                onUpdate = { currentActions.updateSettings(it) },
                onApplyPreset = { currentActions.applyPreset(it) },
                onPickPhoto = { currentActions.pickPhoto() },
                onApplySystemWallpaper = { currentActions.applySystemWallpaper() },
                onMakeDefault = { currentActions.requestDefaultHome() },
                onOpenHomeSettings = { currentActions.openHomeSettings() },
                onClose = { controller.settingsOpen = false },
                scrollState = controller.settingsScroll,
                scrollToWallpaperToken = controller.scrollToWallpaperToken,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = settingsProgress.value.coerceIn(0f, 1f) }
                    .offset { IntOffset(0, ((1f - settingsProgress.value) * 56.dp.toPx()).roundToInt()) }
                    .blockTouches(),
            )
        }

        // ---------------- Onboarding
        if (onboardingVisible) {
            Box(
                Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = onboardingAlpha }
                    .background(Color.Black.copy(alpha = 0.32f))
                    .blockTouches(),
                contentAlignment = Alignment.Center,
            ) {
                OnboardingCard(
                    cornerRadius = corner,
                    onMakeDefault = {
                        currentActions.updateSettings { it.copy(onboardingDone = true) }
                        currentActions.requestDefaultHome()
                    },
                    onLater = { currentActions.updateSettings { it.copy(onboardingDone = true) } },
                    modifier = Modifier
                        .padding(horizontal = 22.dp)
                        .offset { IntOffset(0, ((1f - onboardingAlpha) * 40.dp.toPx()).roundToInt()) },
                )
            }
        }

        // ---------------- Context menus
        GlassMenuHost(
            request = controller.menu,
            cornerRadius = corner,
            onItemClick = { request, item -> onMenuItem(request, item) },
            onDismiss = { controller.menu = null },
        )
    }
}

private const val ID_REMOVE_HOME = "remove_home"
private const val ID_ADD_HOME = "add_home"
private const val ID_ADD_DOCK = "add_dock"
private const val ID_REMOVE_DOCK = "remove_dock"
private const val ID_INFO = "info"
private const val ID_UNINSTALL = "uninstall"
private const val ID_WALLPAPER = "wallpaper"
private const val ID_SETTINGS = "settings"
