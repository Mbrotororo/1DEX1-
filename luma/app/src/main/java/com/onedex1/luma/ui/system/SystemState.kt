package com.onedex1.luma.ui.system

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/** Battery level 0..100 and whether the phone is charging. */
@Immutable
data class BatteryState(val level: Int, val charging: Boolean)

private fun Context.registerSafely(receiver: BroadcastReceiver, filter: IntentFilter): Intent? = try {
    ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
} catch (e: Exception) {
    null
}

private fun Context.unregisterSafely(receiver: BroadcastReceiver) {
    try {
        unregisterReceiver(receiver)
    } catch (e: Exception) {
        // already unregistered
    }
}

private fun Intent.toBatteryState(): BatteryState? {
    val level = getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = getIntExtra(BatteryManager.EXTRA_SCALE, 100)
    if (level < 0 || scale <= 0) return null
    val status = getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
    return BatteryState((level * 100f / scale).toInt().coerceIn(0, 100), charging)
}

/** Battery state, updated while the home screen is started. */
@Composable
fun rememberBatteryState(): State<BatteryState?> {
    val context = LocalContext.current.applicationContext
    val lifecycleOwner = LocalLifecycleOwner.current
    val state = remember { mutableStateOf<BatteryState?>(null) }
    DisposableEffect(context, lifecycleOwner) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                intent?.toBatteryState()?.let { state.value = it }
            }
        }
        var registered = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> if (!registered) {
                    val sticky = context.registerSafely(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                    registered = true
                    sticky?.toBatteryState()?.let { state.value = it }
                }
                Lifecycle.Event.ON_STOP -> if (registered) {
                    context.unregisterSafely(receiver)
                    registered = false
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            if (registered) context.unregisterSafely(receiver)
        }
    }
    return state
}

/**
 * Current time in millis, refreshed every minute (TIME_TICK), on time / time-zone changes and
 * whenever the home screen comes back to the front (coroutine delays stop in deep sleep, the
 * broadcast does not).
 */
@Composable
fun rememberClockMillis(): State<Long> {
    val context = LocalContext.current.applicationContext
    val lifecycleOwner = LocalLifecycleOwner.current
    val state = remember { mutableLongStateOf(System.currentTimeMillis()) }
    DisposableEffect(context, lifecycleOwner) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                state.longValue = System.currentTimeMillis()
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_TIME_TICK)
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
            addAction(Intent.ACTION_DATE_CHANGED)
        }
        var registered = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    state.longValue = System.currentTimeMillis()
                    if (!registered) {
                        context.registerSafely(receiver, filter)
                        registered = true
                    }
                }
                Lifecycle.Event.ON_RESUME -> state.longValue = System.currentTimeMillis()
                Lifecycle.Event.ON_STOP -> if (registered) {
                    context.unregisterSafely(receiver)
                    registered = false
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            if (registered) context.unregisterSafely(receiver)
        }
    }
    return state
}
