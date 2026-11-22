package com.onedex1.luma.ui.drawer

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.Orientation
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.onedex1.luma.R
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.ui.components.AppTile
import com.onedex1.luma.ui.components.IconLoader
import com.onedex1.luma.ui.components.IconLook
import com.onedex1.luma.ui.components.fittedIconSize
import com.onedex1.luma.ui.components.springClickable
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaIcons
import com.onedex1.luma.ui.theme.LumaType
import java.util.Locale

/** Case-insensitive search that also treats "ё" as "е". Prefix matches come first. */
fun filterApps(apps: List<AppInfo>, query: String): List<AppInfo> {
    val q = normalize(query.trim())
    if (q.isEmpty()) return apps
    val prefix = ArrayList<AppInfo>()
    val wordPrefix = ArrayList<AppInfo>()
    val inside = ArrayList<AppInfo>()
    for (app in apps) {
        val label = normalize(app.label)
        when {
            label.startsWith(q) -> prefix += app
            label.contains(" $q") || label.contains("-$q") -> wordPrefix += app
            label.contains(q) || normalize(app.packageName).contains(q) -> inside += app
        }
    }
    return prefix + wordPrefix + inside
}

private fun normalize(s: String): String = s.lowercase(Locale.ROOT).replace('ё', 'е')

/**
 * Content of the app drawer (it is placed inside a heavy glass sheet by the caller): grabber,
 * search field, alphabetical grid. Stateless.
 */
@Composable
fun DrawerScreen(
    apps: List<AppInfo>,
    settings: LumaSettings,
    iconLoader: IconLoader,
    query: String,
    onQueryChange: (String) -> Unit,
    onAppClick: (AppInfo, android.graphics.Rect?) -> Unit,
    onAppLongClick: (AppInfo, Rect) -> Unit,
    modifier: Modifier = Modifier,
    iconsVersion: Int = 0,
    gridState: LazyGridState = rememberLazyGridState(),
    focusRequester: FocusRequester = remember { FocusRequester() },
    scrollConnection: NestedScrollConnection? = null,
    onHeaderDrag: (Float) -> Unit = {},
    onHeaderDragStopped: (Float) -> Unit = {},
) {
    val filtered = remember(apps, query) { filterApps(apps, query) }
    val look = IconLook.from(settings, iconsVersion)
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val currentDrag by rememberUpdatedState(onHeaderDrag)
    val currentStop by rememberUpdatedState(onHeaderDragStopped)
    val headerDrag = rememberDraggableState { currentDrag(it) }

    Column(
        modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding(),
    ) {
        // Header: grabber, title, search. Dragging it moves the sheet.
        Column(
            Modifier
                .fillMaxWidth()
                .draggable(
                    state = headerDrag,
                    orientation = Orientation.Vertical,
                    onDragStopped = { v -> currentStop(v) },
                )
                .padding(horizontal = 20.dp),
        ) {
            Box(
                Modifier
                    .padding(top = 8.dp)
                    .align(Alignment.CenterHorizontally)
                    .size(width = 38.dp, height = 5.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.45f)),
            )
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp, bottom = 12.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Text(stringResource(R.string.drawer_title), style = LumaType.title, modifier = Modifier.weight(1f))
                if (apps.isNotEmpty()) {
                    val searching = query.isNotBlank()
                    Text(
                        if (searching) stringResource(R.string.drawer_found, filtered.size) else stringResource(R.string.drawer_count, apps.size),
                        style = LumaType.footnote,
                        modifier = Modifier.padding(bottom = 3.dp),
                    )
                }
            }
            SearchField(
                query = query,
                onQueryChange = onQueryChange,
                focusRequester = focusRequester,
                onGo = { filtered.firstOrNull()?.let { onAppClick(it, null) } },
            )
            Spacer(Modifier.height(10.dp))
        }

        BoxWithConstraints(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .clip(RectangleShape),
        ) {
            val columns = settings.columns
            val horizontalPadding = 12.dp
            val cellWidth = (maxWidth - horizontalPadding * 2) / columns
            val iconSize = fittedIconSize(settings.iconSizeDp.coerceAtMost(64).dp, cellWidth)
            LazyVerticalGrid(
                columns = GridCells.Fixed(columns),
                state = gridState,
                contentPadding = PaddingValues(
                    start = horizontalPadding,
                    end = horizontalPadding,
                    top = 8.dp,
                    bottom = navBottom + 24.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (scrollConnection != null) Modifier.nestedScroll(scrollConnection) else Modifier),
            ) {
                val topHit = if (query.isNotBlank()) filtered.firstOrNull()?.key else null
                items(filtered, key = { it.key }, contentType = { "app" }) { app ->
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                        if (app.key == topHit) {
                            // Top hit: what Enter / "Go" on the keyboard launches.
                            Box(
                                Modifier
                                    .matchParentSize()
                                    .padding(horizontal = 3.dp)
                                    .clip(RoundedCornerShape(18.dp))
                                    .background(Color.White.copy(alpha = 0.16f))
                                    .border(1.dp, Color.White.copy(alpha = 0.38f), RoundedCornerShape(18.dp)),
                            )
                        }
                        AppTile(
                            app = app,
                            iconSize = iconSize,
                            showLabel = true,
                            look = look,
                            iconLoader = iconLoader,
                            labelWidth = cellWidth - 2.dp,
                            onClick = { bounds -> onAppClick(app, bounds) },
                            onLongClick = { bounds -> onAppLongClick(app, bounds) },
                        )
                    }
                }
                if (filtered.isEmpty() && query.isNotBlank()) {
                    item(span = { GridItemSpan(maxLineSpan) }, contentType = "empty") {
                        Text(
                            text = stringResource(R.string.drawer_nothing_found),
                            style = LumaType.callout.copy(color = LumaColors.TextSecondary),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(vertical = 48.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    focusRequester: FocusRequester,
    onGo: () -> Unit,
) {
    val hint = stringResource(R.string.drawer_search_hint)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(RoundedCornerShape(23.dp))
            .background(Color.White.copy(alpha = 0.14f))
            .padding(start = 14.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(LumaIcons.Search, contentDescription = null, tint = LumaColors.TextSecondary, modifier = Modifier.size(19.dp))
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (query.isEmpty()) {
                Text(hint, style = LumaType.body.copy(color = LumaColors.TextTertiary, shadow = null), maxLines = 1)
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = LumaType.body.copy(shadow = null),
                cursorBrush = SolidColor(LumaColors.Accent),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    imeAction = ImeAction.Go,
                ),
                keyboardActions = KeyboardActions(onGo = { onGo() }, onSearch = { onGo() }, onDone = { onGo() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .semantics { contentDescription = hint },
            )
        }
        if (query.isNotEmpty()) {
            val clear = stringResource(R.string.drawer_clear)
            Box(
                Modifier
                    .size(34.dp)
                    .springClickable(pressedScale = 0.85f) { onQueryChange("") }
                    .semantics { contentDescription = clear },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.35f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(LumaIcons.Close, contentDescription = null, tint = LumaColors.Navy, modifier = Modifier.size(13.dp))
                }
            }
        }
    }
}
