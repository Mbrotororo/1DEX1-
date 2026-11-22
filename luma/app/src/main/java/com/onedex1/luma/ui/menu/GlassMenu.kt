package com.onedex1.luma.ui.menu

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.glass.LocalGlassStyle
import com.onedex1.luma.ui.components.Hairline
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaType
import kotlin.math.roundToInt

/** One row of a glass context menu. */
@Immutable
data class MenuItem(
    val id: String,
    val title: String,
    val icon: ImageVector,
    val destructive: Boolean = false,
)

/**
 * What to show: [anchor] is the long-pressed icon (root coordinates) or a zero-size rect at the
 * touch point for the empty-space menu. [lifted] re-draws the icon above the frosted screen.
 * [clearBelow] (px) is how far the tile reaches below the icon (its label): a menu opening below
 * the icon starts under it instead of slicing through the label.
 */
@Immutable
data class MenuRequest(
    val anchor: Rect,
    val title: String?,
    val items: List<MenuItem>,
    val app: AppInfo? = null,
    val lifted: (@Composable () -> Unit)? = null,
    val clearBelow: Float = 0f,
)

/**
 * Hosts at most one glass context menu with a spring "pop" in and a quick fade out.
 * Set [request] to null to dismiss.
 */
@Composable
fun GlassMenuHost(
    request: MenuRequest?,
    cornerRadius: Dp,
    onItemClick: (MenuRequest, MenuItem) -> Unit,
    onDismiss: () -> Unit,
) {
    var shown by remember { mutableStateOf(request) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(request) {
        if (request != null) {
            if (shown != null && shown !== request) progress.snapTo(0f)
            shown = request
            progress.animateTo(1f, spring(dampingRatio = 0.72f, stiffness = 520f))
        } else if (shown != null) {
            progress.animateTo(0f, tween(150))
            shown = null
        }
    }
    val current = shown ?: return
    GlassMenuOverlay(
        request = current,
        cornerRadius = cornerRadius,
        progress = { progress.value },
        interactive = request != null,
        onItemClick = { onItemClick(current, it) },
        onDismiss = onDismiss,
    )
}

@Composable
private fun GlassMenuOverlay(
    request: MenuRequest,
    cornerRadius: Dp,
    progress: () -> Float,
    interactive: Boolean,
    onItemClick: (MenuItem) -> Unit,
    onDismiss: () -> Unit,
) {
    val density = LocalDensity.current
    val gap = with(density) { 12.dp.roundToPx() }
    val margin = with(density) { 14.dp.roundToPx() }
    val baseStyle = LocalGlassStyle.current
    val menuStyle = remember(baseStyle) { baseStyle.copy(heavy = true) }
    // Frosted backdrop behind the menu (iOS blurs everything behind a context menu): the heavy
    // wallpaper blur covers the screen, so the grid behind only ghosts through.
    val frostStyle = remember(baseStyle) {
        baseStyle.copy(heavy = true, shadow = false, edge = 0f, refraction = 0f, tintAlpha = baseStyle.tintAlpha * 0.5f)
    }
    val anchor = request.anchor
    val pointAnchor = anchor.width < 1f && anchor.height < 1f
    var placedAbove by remember(request) { mutableStateOf(false) }
    var alignedRight by remember(request) { mutableStateOf(false) }

    Layout(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { }
            .background(Color.Transparent)
            .pointerInput(interactive) {
                detectTapGestures(onTap = { if (interactive) onDismiss() }, onLongPress = { if (interactive) onDismiss() })
            },
        content = {
            // frost + dim
            Box(
                Modifier
                    .layoutId("scrim")
                    .graphicsLayer { alpha = (progress() * 0.86f).coerceIn(0f, 1f) },
            ) {
                GlassSurface(Modifier.fillMaxSize(), cornerRadius = 0.dp, style = frostStyle) {
                    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.22f)))
                }
            }
            // lifted icon
            if (request.lifted != null && !pointAnchor) {
                Box(
                    Modifier
                        .layoutId("lifted")
                        .graphicsLayer {
                            val p = progress()
                            alpha = p.coerceIn(0f, 1f)
                            val s = 1f + 0.08f * p
                            scaleX = s
                            scaleY = s
                        },
                    contentAlignment = Alignment.Center,
                ) { request.lifted.invoke() }
            }
            // menu
            GlassSurface(
                modifier = Modifier
                    .layoutId("menu")
                    .width(252.dp)
                    .graphicsLayer {
                        val p = progress()
                        alpha = p.coerceIn(0f, 1f)
                        val s = 0.82f + 0.18f * p
                        scaleX = s
                        scaleY = s
                        val ox = if (pointAnchor) 0.5f else if (alignedRight) 0.85f else 0.15f
                        transformOrigin = TransformOrigin(ox, if (placedAbove) 1f else 0f)
                    },
                cornerRadius = cornerRadius.coerceAtMost(26.dp),
                style = menuStyle,
            ) {
                Box(
                    Modifier
                        .matchParentSize()
                        .clip(RoundedCornerShape(cornerRadius.coerceAtMost(26.dp)))
                        .background(Color(0x52000A28)),
                )
                MenuContent(request, onItemClick)
            }
        },
    ) { measurables, constraints ->
        val full = Constraints.fixed(constraints.maxWidth, constraints.maxHeight)
        val scrim = measurables.first { it.layoutId == "scrim" }.measure(full)
        val liftedM = measurables.firstOrNull { it.layoutId == "lifted" }
        val lifted = liftedM?.measure(
            Constraints.fixed(anchor.width.roundToInt().coerceAtLeast(1), anchor.height.roundToInt().coerceAtLeast(1)),
        )
        val menu = measurables.first { it.layoutId == "menu" }.measure(
            Constraints(maxWidth = constraints.maxWidth - margin * 2, maxHeight = constraints.maxHeight - margin * 2),
        )
        layout(constraints.maxWidth, constraints.maxHeight) {
            scrim.place(0, 0)
            lifted?.place(anchor.left.roundToInt(), anchor.top.roundToInt())
            val w = constraints.maxWidth
            val h = constraints.maxHeight
            val x: Int
            val y: Int
            if (pointAnchor) {
                x = (anchor.left - menu.width / 2f).roundToInt().coerceIn(margin, w - margin - menu.width)
                val below = anchor.top.roundToInt() + gap
                val above = anchor.top.roundToInt() - gap - menu.height
                // In the lower part of the screen (search pill, dock) the menu opens upwards.
                val preferAbove = anchor.top > h * 0.55f && above >= margin
                y = if (!preferAbove && below + menu.height <= h - margin) below else above
                placedAbove = y < anchor.top
            } else {
                // iOS-like: the menu hangs from the icon's edge that is nearer to the screen edge.
                alignedRight = anchor.center.x > w / 2f
                val rawX = if (alignedRight) anchor.right.roundToInt() - menu.width else anchor.left.roundToInt()
                x = rawX.coerceIn(margin, (w - margin - menu.width).coerceAtLeast(margin))
                val below = (anchor.bottom + request.clearBelow).roundToInt() + gap
                val above = anchor.top.roundToInt() - gap - menu.height
                val goBelow = below + menu.height <= h - margin * 3 || above < margin * 3
                y = if (goBelow) below else above
                placedAbove = !goBelow
            }
            menu.place(x, y.coerceIn(margin, (h - margin - menu.height).coerceAtLeast(margin)))
        }
    }
}

@Composable
private fun MenuContent(request: MenuRequest, onItemClick: (MenuItem) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        if (request.title != null) {
            Text(
                text = request.title,
                style = LumaType.footnote,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 8.dp),
            )
            Hairline()
        }
        request.items.forEachIndexed { index, item ->
            if (index > 0) Hairline(inset = 18.dp)
            MenuRow(item) { onItemClick(item) }
        }
    }
}

@Composable
private fun MenuRow(item: MenuItem, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val color = if (item.destructive) LumaColors.DangerText else Color.White
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .background(if (pressed) Color.White.copy(alpha = 0.14f) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = item.title,
            style = LumaType.body.copy(color = color),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Icon(item.icon, contentDescription = null, tint = color, modifier = Modifier.size(21.dp))
    }
}

/** Zero-size anchor at a touch point. */
fun pointAnchor(at: Offset): Rect = Rect(at, at)
