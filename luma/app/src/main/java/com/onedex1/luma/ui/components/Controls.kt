package com.onedex1.luma.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaType
import kotlin.math.roundToInt

// -------------------------------------------------------------------------------------------------
// Press feedback
// -------------------------------------------------------------------------------------------------

/** iOS-like squish: scales the element to [pressedScale] with a spring while it is pressed. */
fun Modifier.pressScale(interactionSource: InteractionSource, pressedScale: Float = 0.92f): Modifier = composed {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = if (pressed) {
            spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMediumLow * 2f)
        } else {
            spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow)
        },
        label = "pressScale",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/** Clickable without ripple, with the spring squish instead. */
fun Modifier.springClickable(
    enabled: Boolean = true,
    pressedScale: Float = 0.95f,
    role: Role? = Role.Button,
    onClick: () -> Unit,
): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    this
        .pressScale(interaction, pressedScale)
        .clickable(
            interactionSource = interaction,
            indication = null,
            enabled = enabled,
            role = role,
            onClick = onClick,
        )
}

// -------------------------------------------------------------------------------------------------
// Switch
// -------------------------------------------------------------------------------------------------

@Composable
fun LumaSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val t by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.68f, stiffness = 520f),
        label = "switch",
    )
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val thumbWidth by animateDpAsState(if (pressed) 32.dp else 27.dp, spring(stiffness = 700f), label = "thumbW")
    val density = LocalDensity.current
    Box(
        modifier = modifier
            .size(width = 52.dp, height = 31.dp)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(CircleShape)
            .background(lerp(Color.White.copy(alpha = 0.18f), LumaColors.SwitchOn, t))
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                interactionSource = interaction,
                indication = null,
                onValueChange = onCheckedChange,
            ),
    ) {
        Box(
            Modifier
                .offset {
                    val travel = with(density) { (52.dp - thumbWidth - 4.dp).toPx() }
                    IntOffset((with(density) { 2.dp.toPx() } + travel * t).roundToInt(), with(density) { 2.dp.roundToPx() })
                }
                .size(width = thumbWidth, height = 27.dp)
                .shadow(3.dp, CircleShape, clip = false, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.3f))
                .background(Color.White, CircleShape),
        )
    }
}

// -------------------------------------------------------------------------------------------------
// Slider
// -------------------------------------------------------------------------------------------------

/**
 * A thin iOS-style slider: capsule track, bright fill, white thumb. Tap anywhere to jump,
 * drag horizontally to adjust (vertical drags still scroll the page).
 */
@Composable
fun LumaSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    valueRange: ClosedFloatingPointRange<Float> = 0f..1f,
    enabled: Boolean = true,
    contentDescription: String? = null,
) {
    val density = LocalDensity.current
    val thumb = 26.dp
    val thumbPx = with(density) { thumb.toPx() }
    var widthPx by remember { mutableIntStateOf(0) }
    var dragPx by remember { mutableFloatStateOf(0f) }
    val currentOnChange by rememberUpdatedState(onValueChange)
    val span = (valueRange.endInclusive - valueRange.start).takeIf { it > 0f } ?: 1f
    val fraction = ((value - valueRange.start) / span).coerceIn(0f, 1f)

    fun emit(px: Float) {
        val track = (widthPx - thumbPx).coerceAtLeast(1f)
        val f = ((px - thumbPx / 2f) / track).coerceIn(0f, 1f)
        currentOnChange(valueRange.start + f * span)
    }

    val dragState = rememberDraggableState { delta ->
        dragPx = (dragPx + delta).coerceIn(0f, widthPx.toFloat())
        emit(dragPx)
    }
    val animatedFraction by animateFloatAsState(fraction, spring(dampingRatio = 1f, stiffness = 2400f), label = "slider")

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(34.dp)
            .alpha(if (enabled) 1f else 0.4f)
            .onSizeChanged { widthPx = it.width }
            .semantics { if (contentDescription != null) this.contentDescription = contentDescription }
            .pointerInput(enabled, widthPx) {
                if (!enabled) return@pointerInput
                detectTapGestures(onTap = { emit(it.x) })
            }
            .draggable(
                state = dragState,
                orientation = Orientation.Horizontal,
                enabled = enabled,
                onDragStarted = { start ->
                    dragPx = start.x
                    emit(start.x)
                },
            ),
        contentAlignment = Alignment.CenterStart,
    ) {
        // track
        Box(
            Modifier
                .padding(horizontal = thumb / 2)
                .fillMaxWidth()
                .height(6.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.20f)),
        )
        // fill
        Box(
            Modifier
                .padding(start = thumb / 2)
                .height(6.dp)
                .width(with(density) { ((widthPx - thumbPx).coerceAtLeast(0f) * animatedFraction).toDp() })
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.92f)),
        )
        // thumb
        Box(
            Modifier
                .offset { IntOffset(((widthPx - thumbPx).coerceAtLeast(0f) * animatedFraction).roundToInt(), 0) }
                .size(thumb)
                .shadow(4.dp, CircleShape, clip = false, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.35f))
                .background(Color.White, CircleShape),
        )
    }
}

// -------------------------------------------------------------------------------------------------
// Segmented control
// -------------------------------------------------------------------------------------------------

@Composable
fun <T> LumaSegmented(
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val index = options.indexOfFirst { it.first == selected }.coerceAtLeast(0)
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(38.dp)
            .clip(CircleShape)
            .background(LumaColors.Fill),
    ) {
        val segment = maxWidth / options.size.coerceAtLeast(1)
        val x by animateDpAsState(segment * index, spring(dampingRatio = 0.78f, stiffness = 520f), label = "segment")
        Box(
            Modifier
                .offset { IntOffset(x.roundToPx(), 0) }
                .width(segment)
                .fillMaxHeight()
                .padding(3.dp)
                .shadow(2.dp, CircleShape, clip = false, ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.2f))
                .background(Color.White.copy(alpha = 0.30f), CircleShape),
        )
        Row(Modifier.fillMaxWidth().fillMaxHeight()) {
            options.forEachIndexed { i, (value, label) ->
                val isSelected = i == index
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.RadioButton,
                        ) { onSelect(value) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        style = if (isSelected) LumaType.subhead else LumaType.callout.copy(color = LumaColors.TextSecondary),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// Chips, buttons, rows
// -------------------------------------------------------------------------------------------------

@Composable
fun LumaChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
) {
    val bg by animateColorAsState(if (selected) LumaColors.FillSelected else LumaColors.Fill, label = "chipBg")
    val border by animateColorAsState(
        if (selected) Color.White.copy(alpha = 0.65f) else Color.White.copy(alpha = 0.10f),
        label = "chipBorder",
    )
    Row(
        modifier = modifier
            .springClickable(pressedScale = 0.93f, role = Role.RadioButton, onClick = onClick)
            .height(36.dp)
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, border, CircleShape)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        leading?.invoke()
        Text(text, style = if (selected) LumaType.subhead else LumaType.callout, maxLines = 1)
    }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    Row(
        modifier = modifier
            .springClickable(enabled = enabled, pressedScale = 0.96f, onClick = onClick)
            .alpha(if (enabled) 1f else 0.55f)
            .height(52.dp)
            .shadow(10.dp, CircleShape, clip = false, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.35f))
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.94f))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = LumaColors.Navy, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(
            text,
            style = LumaType.headline.copy(color = LumaColors.Navy, shadow = null, fontSize = 16.sp, letterSpacing = (-0.3).sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    Row(
        modifier = modifier
            .springClickable(enabled = enabled, pressedScale = 0.96f, onClick = onClick)
            .alpha(if (enabled) 1f else 0.55f)
            .height(48.dp)
            .clip(CircleShape)
            .background(LumaColors.Fill)
            .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(19.dp))
            Spacer(Modifier.width(9.dp))
        }
        Text(text, style = LumaType.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** A settings row: title (+ optional note) on the left, a control on the right. */
@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = LumaType.body)
            if (note != null) {
                Spacer(Modifier.height(2.dp))
                Text(note, style = LumaType.footnote)
            }
        }
        trailing()
    }
}

/** Title + value label over a [LumaSlider]. */
@Composable
fun SliderRow(
    title: String,
    valueText: String,
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    valueRange: ClosedFloatingPointRange<Float> = 0f..1f,
    enabled: Boolean = true,
) {
    Column(modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = LumaType.body, modifier = Modifier.weight(1f).alpha(if (enabled) 1f else 0.5f))
            Text(valueText, style = LumaType.callout.copy(color = LumaColors.TextSecondary))
        }
        Spacer(Modifier.height(2.dp))
        LumaSlider(
            value = value,
            onValueChange = onValueChange,
            valueRange = valueRange,
            enabled = enabled,
            contentDescription = title,
        )
    }
}

@Composable
fun Hairline(modifier: Modifier = Modifier, inset: Dp = 0.dp) {
    Box(
        modifier
            .padding(start = inset)
            .fillMaxWidth()
            .height(0.7.dp)
            .background(LumaColors.Hairline),
    )
}

/** Rounded shape helper. */
fun rounded(radius: Dp) = RoundedCornerShape(radius)
