package com.onedex1.luma.ui.home

import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.onedex1.luma.R
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.glass.LocalGlassStyle
import com.onedex1.luma.ui.components.AppTile
import com.onedex1.luma.ui.components.IconLoader
import com.onedex1.luma.ui.components.IconLook
import com.onedex1.luma.ui.components.fittedIconSize
import com.onedex1.luma.ui.components.springClickable
import com.onedex1.luma.ui.system.BatteryState
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaIcons
import com.onedex1.luma.ui.theme.LumaType

/** Where a long-pressed app lives. */
enum class AppPlace { Home, Dock, Drawer }

/**
 * The home screen: glass clock, app grid, search pill and floating glass dock. Stateless — it
 * only shows the given data and reports what the user does.
 *
 * @param scrollConnection grid gestures (drawer on pull-up, notification shade on pull-down)
 * @param onVerticalDrag / onVerticalDragStopped the same gestures outside the grid
 */
@Composable
fun HomeScreen(
    apps: List<AppInfo>,
    home: List<String>,
    dock: List<String>,
    settings: LumaSettings,
    iconLoader: IconLoader,
    nowMillis: Long,
    battery: BatteryState?,
    onAppClick: (AppInfo, android.graphics.Rect?) -> Unit,
    onAppLongClick: (AppInfo, Rect, AppPlace) -> Unit,
    onEmptyLongClick: (Offset) -> Unit,
    onSearchClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconsVersion: Int = 0,
    gridState: LazyGridState = rememberLazyGridState(),
    scrollConnection: NestedScrollConnection? = null,
    onVerticalDrag: (Float) -> Unit = {},
    onVerticalDragStopped: (Float) -> Unit = {},
) {
    val byKey = remember(apps) { apps.associateBy { it.key } }
    val homeApps = remember(byKey, home) { home.mapNotNull { byKey[it] } }
    val dockApps = remember(byKey, dock) { dock.mapNotNull { byKey[it] } }
    val look = IconLook.from(settings, iconsVersion)
    val density = LocalDensity.current
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    var bottomBarPx by remember { mutableIntStateOf(0) }
    val bottomBar = with(density) { bottomBarPx.toDp() }
    val corner = settings.cornerDp.dp

    val currentEmptyLongClick by rememberUpdatedState(onEmptyLongClick)
    val currentDrag by rememberUpdatedState(onVerticalDrag)
    val currentDragStopped by rememberUpdatedState(onVerticalDragStopped)
    val dragState = rememberDraggableState { currentDrag(it) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .draggable(
                state = dragState,
                orientation = Orientation.Vertical,
                onDragStopped = { velocity -> currentDragStopped(velocity) },
            ),
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val columns = settings.columns
            val horizontalPadding = 14.dp
            val cellWidth = (maxWidth - horizontalPadding * 2) / columns
            val iconSize = fittedIconSize(settings.iconSizeDp.dp, cellWidth)
            LazyVerticalGrid(
                columns = GridCells.Fixed(columns),
                state = gridState,
                contentPadding = PaddingValues(
                    start = horizontalPadding,
                    end = horizontalPadding,
                    top = statusTop + 14.dp,
                    bottom = bottomBar + 18.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(if (settings.showLabels) 14.dp else 20.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (scrollConnection != null) Modifier.nestedScroll(scrollConnection) else Modifier)
                    .pointerInput(Unit) {
                        detectTapGestures(onLongPress = { currentEmptyLongClick(it) })
                    },
            ) {
                if (settings.showClock) {
                    item(key = "luma:clock", span = { GridItemSpan(maxLineSpan) }, contentType = "clock") {
                        ClockWidget(
                            nowMillis = nowMillis,
                            battery = battery,
                            greetingName = settings.greetingName,
                            cornerRadius = corner,
                            modifier = Modifier.padding(start = 6.dp, end = 6.dp, bottom = 14.dp),
                        )
                    }
                } else {
                    item(key = "luma:top", span = { GridItemSpan(maxLineSpan) }, contentType = "spacer") {
                        Spacer(Modifier.height(8.dp))
                    }
                }
                items(homeApps, key = { it.key }, contentType = { "app" }) { app ->
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                        AppTile(
                            app = app,
                            iconSize = iconSize,
                            showLabel = settings.showLabels,
                            look = look,
                            iconLoader = iconLoader,
                            labelWidth = cellWidth - 2.dp,
                            onClick = { bounds -> onAppClick(app, bounds) },
                            onLongClick = { bounds -> onAppLongClick(app, bounds, AppPlace.Home) },
                        )
                    }
                }
                if (homeApps.isEmpty() && apps.isNotEmpty()) {
                    item(key = "luma:empty", span = { GridItemSpan(maxLineSpan) }, contentType = "hint") {
                        Text(
                            text = stringResource(R.string.home_empty_hint),
                            style = LumaType.callout.copy(color = LumaColors.TextSecondary, shadow = com.onedex1.luma.ui.theme.LumaStrongShadow),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 32.dp),
                        )
                    }
                }
            }
        }

        // Search pill + dock
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .onSizeChanged { bottomBarPx = it.height }
                .navigationBarsPadding()
                .padding(bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (settings.showSearch) {
                SearchPill(onClick = onSearchClick)
                Spacer(Modifier.height(if (dockApps.isNotEmpty()) 14.dp else 4.dp))
            }
            if (dockApps.isNotEmpty()) {
                Dock(
                    apps = dockApps,
                    settings = settings,
                    look = look,
                    iconLoader = iconLoader,
                    onAppClick = onAppClick,
                    onAppLongClick = { app, bounds -> onAppLongClick(app, bounds, AppPlace.Dock) },
                )
            }
        }
    }
}

/** Small glass capsule "Поиск" that opens the drawer with the keyboard. */
@Composable
fun SearchPill(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.home_search)
    GlassSurface(
        modifier = modifier
            .springClickable(pressedScale = 0.94f, onClick = onClick)
            .height(42.dp)
            .semantics { contentDescription = label },
        cornerRadius = 21.dp,
    ) {
        Row(
            Modifier
                .align(Alignment.Center)
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(LumaIcons.Search, contentDescription = null, tint = LumaColors.Text, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(8.dp))
            Text(label, style = LumaType.subhead)
        }
    }
}

/** Floating glass dock with up to four apps, no labels. */
@Composable
fun Dock(
    apps: List<AppInfo>,
    settings: LumaSettings,
    look: IconLook,
    iconLoader: IconLoader,
    onAppClick: (AppInfo, android.graphics.Rect?) -> Unit,
    onAppLongClick: (AppInfo, Rect) -> Unit,
    modifier: Modifier = Modifier,
) {
    val iconSize: Dp = settings.iconSizeDp.coerceAtMost(64).dp
    val description = stringResource(R.string.cd_dock)
    // Icon tiles sit directly on the glass platter: a faint rim, no drop shadow, so the dock
    // does not show busy double rims (glass tile inside glass capsule).
    val base = LocalGlassStyle.current
    val tileStyle = remember(base) {
        base.copy(edge = base.edge * 0.3f, tintAlpha = base.tintAlpha * 0.4f, shadow = false)
    }
    GlassSurface(
        modifier = modifier
            .padding(horizontal = 14.dp)
            .fillMaxWidth()
            .height(iconSize + 30.dp)
            .semantics { contentDescription = description },
        cornerRadius = settings.cornerDp.dp + 8.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CompositionLocalProvider(LocalGlassStyle provides tileStyle) {
                apps.forEach { app ->
                    AppTile(
                        app = app,
                        iconSize = iconSize,
                        showLabel = false,
                        look = look,
                        iconLoader = iconLoader,
                        onClick = { bounds -> onAppClick(app, bounds) },
                        onLongClick = { bounds -> onAppLongClick(app, bounds) },
                    )
                }
            }
        }
    }
}
