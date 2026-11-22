package com.onedex1.luma.glass

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlin.math.abs

/**
 * Device tilt for the glass highlights: x, y in -1..1, relative to the posture the phone has been
 * held in for the last ~2 s (so highlights react to motion and drift back to neutral).
 *  - x > 0 when the device rolls to the right (right edge goes down),
 *  - y > 0 when the top edge tilts away from the user.
 * Uses TYPE_GRAVITY (falls back to TYPE_ACCELEROMETER) with low-pass smoothing. The sensor is only
 * registered while the lifecycle is RESUMED and [enabled]; it is unregistered on pause/dispose.
 * With no sensor or [enabled] = false the value stays Offset.Zero (no recompositions/redraws).
 * The returned State is meant to be read in the draw phase.
 */
@Composable
fun rememberTilt(enabled: Boolean): State<Offset> {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state = remember { mutableStateOf(Offset.Zero) }
    DisposableEffect(enabled, lifecycleOwner, context) {
        if (!enabled) {
            state.value = Offset.Zero
            onDispose { }
        } else {
            val tracker = TiltTracker(context.applicationContext, state)
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> tracker.start()
                    Lifecycle.Event.ON_PAUSE -> tracker.stop()
                    else -> Unit
                }
            }
            // addObserver replays the events up to the current state, so a RESUMED owner starts now.
            lifecycleOwner.lifecycle.addObserver(observer)
            onDispose {
                lifecycleOwner.lifecycle.removeObserver(observer)
                tracker.stop()
                state.value = Offset.Zero
            }
        }
    }
    return state
}

/** Sensor listener with two low-pass filters (fast = signal, slow = baseline). Main thread only. */
internal class TiltTracker(
    context: Context,
    private val out: MutableState<Offset>,
) : SensorEventListener {

    private val sensorManager: SensorManager? =
        try {
            context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        } catch (t: Throwable) {
            null
        }

    private val sensor: Sensor? =
        try {
            sensorManager?.getDefaultSensor(Sensor.TYPE_GRAVITY)
                ?: sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        } catch (t: Throwable) {
            null
        }

    private var running = false
    private var primed = false
    private var fastX = 0f
    private var fastY = 0f
    private var baseX = 0f
    private var baseY = 0f
    private var lastX = 0f
    private var lastY = 0f

    fun start() {
        if (running) return
        val sm = sensorManager ?: return
        val s = sensor ?: return
        primed = false
        running = try {
            sm.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME)
        } catch (t: Throwable) {
            false
        }
    }

    fun stop() {
        if (!running) return
        running = false
        try {
            sensorManager?.unregisterListener(this)
        } catch (t: Throwable) {
            // ignore
        }
        // settle highlights back to neutral
        lastX = 0f
        lastY = 0f
        out.value = Offset.Zero
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!running || event.values.size < 2) return
        val gx = event.values[0] / SensorManager.GRAVITY_EARTH
        val gy = event.values[1] / SensorManager.GRAVITY_EARTH
        if (gx.isNaN() || gy.isNaN()) return
        if (!primed) {
            fastX = gx; fastY = gy; baseX = gx; baseY = gy
            primed = true
            return
        }
        fastX += (gx - fastX) * FAST
        fastY += (gy - fastY) * FAST
        baseX += (fastX - baseX) * SLOW
        baseY += (fastY - baseY) * SLOW
        // Right edge down -> gx decreases; top edge away -> gy decreases.
        val tx = ((baseX - fastX) * GAIN).coerceIn(-1f, 1f)
        val ty = ((baseY - fastY) * GAIN).coerceIn(-1f, 1f)
        // Dead zone: the slow drift back to neutral ends with one exact zero instead of dozens of
        // sub-pixel updates (every update redraws every glass surface).
        val qx = if (abs(tx) < EPS) 0f else tx
        val qy = if (abs(ty) < EPS) 0f else ty
        val settled = qx == 0f && qy == 0f && (lastX != 0f || lastY != 0f)
        if (abs(qx - lastX) > EPS || abs(qy - lastY) > EPS || settled) {
            lastX = qx
            lastY = qy
            out.value = Offset(qx, qy)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private companion object {
        const val FAST = 0.18f   // ~120 ms at SENSOR_DELAY_GAME (~50 Hz)
        const val SLOW = 0.012f  // ~2 s baseline
        const val GAIN = 2.6f    // ~22 degrees of tilt -> full deflection
        // ~0.33 degrees of tilt: hand tremor no longer redraws the glass ~50x per second, while the
        // bloom still moves at most ~3 px per step on a full-width sheet (no visible stepping).
        const val EPS = 0.015f
    }
}
