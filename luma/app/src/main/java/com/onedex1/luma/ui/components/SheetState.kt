package com.onedex1.luma.ui.components

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Progress of a full-screen sheet (the app drawer): 0 = closed, 1 = open. Follows the finger
 * while dragging and settles with a spring that keeps the fling velocity.
 * Read [progress] only in layout / draw lambdas so that dragging never recomposes.
 */
@Stable
class SheetState(private val scope: CoroutineScope, initial: Float = 0f) {

    var progress by mutableFloatStateOf(initial)
        private set

    /** Height the sheet travels, in px (set from layout). */
    var travelPx: Float = 2000f

    var isDragging: Boolean = false
        private set

    private var dragStart = 0f
    private var job: Job? = null

    val isOpen: Boolean get() = progress > 0.5f

    /** Finger moved by [deltaY] px (positive = down). */
    fun dragBy(deltaY: Float) {
        if (!isDragging) {
            job?.cancel()
            isDragging = true
            dragStart = progress
        }
        progress = (progress - deltaY / travelPx.coerceAtLeast(1f)).coerceIn(0f, 1f)
    }

    /** Finger lifted with [velocityY] px/s (positive = down). */
    fun settle(velocityY: Float) {
        if (!isDragging) return
        isDragging = false
        val v = -velocityY / travelPx.coerceAtLeast(1f)
        val target = when {
            v > FLING -> 1f
            v < -FLING -> 0f
            dragStart < 0.5f -> if (progress > 0.22f) 1f else 0f
            else -> if (progress < 0.78f) 0f else 1f
        }
        animateTo(target, v)
    }

    fun open() = animateTo(1f, 0f)

    fun close() = animateTo(0f, 0f)

    fun snapTo(value: Float) {
        job?.cancel()
        isDragging = false
        progress = value.coerceIn(0f, 1f)
    }

    private fun animateTo(target: Float, velocity: Float) {
        job?.cancel()
        isDragging = false
        if (progress == target) return
        job = scope.launch {
            animate(
                initialValue = progress,
                targetValue = target,
                initialVelocity = velocity,
                animationSpec = spring(dampingRatio = 0.9f, stiffness = 340f, visibilityThreshold = 0.0005f),
            ) { value, _ -> progress = value.coerceIn(0f, 1f) }
        }
    }

    private companion object {
        const val FLING = 1.1f // sheet heights per second
    }
}

@Composable
fun rememberSheetState(initial: Float = 0f): SheetState {
    val scope = rememberCoroutineScope()
    return remember { SheetState(scope, initial) }
}

/**
 * Home grid gestures: pulling up past the end of the grid opens the drawer, pulling down at the
 * top expands the notification shade (once per gesture).
 */
class HomeScrollConnection(
    private val sheet: SheetState,
    private val pullDownThresholdPx: Float,
    private val onPullDown: () -> Unit,
) : NestedScrollConnection {
    private var pulled = 0f
    private var fired = false

    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
        if (source != NestedScrollSource.UserInput) return Offset.Zero
        if (sheet.isDragging) {
            sheet.dragBy(available.y)
            return Offset(0f, available.y)
        }
        return Offset.Zero
    }

    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
        if (source != NestedScrollSource.UserInput) return Offset.Zero
        if (available.y < 0f) {
            sheet.dragBy(available.y)
            return Offset(0f, available.y)
        }
        if (available.y > 0f) {
            pulled += available.y
            if (!fired && pulled > pullDownThresholdPx) {
                fired = true
                onPullDown()
            }
            return Offset(0f, available.y)
        }
        return Offset.Zero
    }

    override suspend fun onPreFling(available: Velocity): Velocity {
        pulled = 0f
        fired = false
        if (sheet.isDragging) {
            sheet.settle(available.y)
            return available
        }
        return Velocity.Zero
    }

    /** For drags outside the grid (dock, search pill, status bar area). */
    fun onDrag(deltaY: Float) {
        if (sheet.isDragging || deltaY < 0f) {
            sheet.dragBy(deltaY)
        } else {
            pulled += deltaY
            if (!fired && pulled > pullDownThresholdPx) {
                fired = true
                onPullDown()
            }
        }
    }

    fun onDragStopped(velocityY: Float) {
        pulled = 0f
        fired = false
        sheet.settle(velocityY)
    }
}

/** Drawer grid gestures: pulling down at the top closes the drawer, following the finger. */
class DrawerScrollConnection(private val sheet: SheetState) : NestedScrollConnection {
    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
        if (source != NestedScrollSource.UserInput) return Offset.Zero
        if (sheet.isDragging) {
            sheet.dragBy(available.y)
            return Offset(0f, available.y)
        }
        return Offset.Zero
    }

    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
        if (source != NestedScrollSource.UserInput) return Offset.Zero
        if (available.y > 0f) {
            sheet.dragBy(available.y)
            return Offset(0f, available.y)
        }
        return Offset.Zero
    }

    override suspend fun onPreFling(available: Velocity): Velocity {
        if (sheet.isDragging) {
            sheet.settle(available.y)
            return available
        }
        return Velocity.Zero
    }
}
