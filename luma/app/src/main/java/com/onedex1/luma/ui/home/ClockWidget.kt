package com.onedex1.luma.ui.home

import android.text.format.DateFormat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.onedex1.luma.R
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.ui.system.BatteryState
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaType
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private val RussianLocale: Locale = Locale.forLanguageTag("ru-RU")

/** "суббота, 21 ноября" */
fun russianDate(millis: Long): String =
    SimpleDateFormat("EEEE, d MMMM", RussianLocale).format(Date(millis))

fun formatTime(millis: Long, is24: Boolean): String =
    SimpleDateFormat(if (is24) "HH:mm" else "h:mm", RussianLocale).format(Date(millis))

/** String resource of the greeting for the hour of [millis]. */
fun greetingRes(millis: Long): Int {
    val hour = Calendar.getInstance().apply { timeInMillis = millis }.get(Calendar.HOUR_OF_DAY)
    return when (hour) {
        in 0..4 -> R.string.greeting_night
        in 5..11 -> R.string.greeting_morning
        in 12..16 -> R.string.greeting_day
        else -> R.string.greeting_evening
    }
}

@Composable
fun greetingText(millis: Long, name: String): String {
    val greeting = stringResource(greetingRes(millis))
    val trimmed = name.trim()
    return if (trimmed.isEmpty()) greeting else stringResource(R.string.greeting_with_name, greeting, trimmed)
}

/** The glass clock on the home screen: greeting, big light time, Russian date, battery. */
@Composable
fun ClockWidget(
    nowMillis: Long,
    battery: BatteryState?,
    greetingName: String,
    cornerRadius: Dp,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val is24 = remember(nowMillis) {
        try {
            DateFormat.is24HourFormat(context)
        } catch (e: Exception) {
            true
        }
    }
    val time = remember(nowMillis, is24) { formatTime(nowMillis, is24) }
    val date = remember(nowMillis) { russianDate(nowMillis) }
    val greeting = greetingText(nowMillis, greetingName)

    GlassSurface(modifier = modifier.fillMaxWidth(), cornerRadius = cornerRadius) {
        Column(Modifier.padding(start = 22.dp, end = 20.dp, top = 18.dp, bottom = 20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = greeting,
                    style = LumaType.subhead.copy(color = LumaColors.TextSecondary),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (battery != null) BatteryIndicator(battery)
            }
            Text(
                text = time,
                style = LumaType.clock,
                maxLines = 1,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                text = date,
                style = LumaType.body.copy(color = Color.White.copy(alpha = 0.9f)),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun BatteryIndicator(battery: BatteryState, modifier: Modifier = Modifier) {
    val description = if (battery.charging) {
        stringResource(R.string.cd_battery_charging, battery.level)
    } else {
        stringResource(R.string.cd_battery, battery.level)
    }
    Row(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = stringResource(R.string.battery_percent, battery.level),
            style = LumaType.subhead,
        )
        BatteryGlyph(battery, Modifier.size(width = 25.dp, height = 12.dp))
    }
}

@Composable
private fun BatteryGlyph(battery: BatteryState, modifier: Modifier) {
    val fillColor = when {
        battery.charging -> Color(0xFF5BE38A)
        battery.level <= 15 -> LumaColors.Danger
        else -> Color.White
    }
    val bolt = remember { Path() } // reused: no allocation per draw
    Canvas(modifier) {
        val stroke = 1.2.dp.toPx()
        val capW = 1.8.dp.toPx()
        val bodyW = size.width - capW - 1.dp.toPx()
        val r = 3.5.dp.toPx()
        // body outline
        drawRoundRect(
            color = Color.White.copy(alpha = 0.55f),
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(bodyW - stroke, size.height - stroke),
            cornerRadius = CornerRadius(r, r),
            style = Stroke(stroke),
        )
        // cap
        drawRoundRect(
            color = Color.White.copy(alpha = 0.55f),
            topLeft = Offset(bodyW + 1.dp.toPx(), size.height * 0.32f),
            size = Size(capW, size.height * 0.36f),
            cornerRadius = CornerRadius(capW, capW),
        )
        // level
        val inset = stroke + 1.2.dp.toPx()
        val maxW = bodyW - inset * 2
        val w = (maxW * battery.level / 100f).coerceAtLeast(1.5.dp.toPx())
        drawRoundRect(
            color = fillColor,
            topLeft = Offset(inset, inset),
            size = Size(w, size.height - inset * 2),
            cornerRadius = CornerRadius(r - inset / 2, r - inset / 2),
        )
        if (battery.charging) {
            bolt.reset()
            bolt.apply {
                val cx = bodyW / 2
                val h = size.height
                moveTo(cx + 1.2.dp.toPx(), h * 0.08f)
                lineTo(cx - 3.dp.toPx(), h * 0.56f)
                lineTo(cx - 0.2.dp.toPx(), h * 0.56f)
                lineTo(cx - 1.2.dp.toPx(), h * 0.92f)
                lineTo(cx + 3.dp.toPx(), h * 0.42f)
                lineTo(cx + 0.2.dp.toPx(), h * 0.42f)
                close()
            }
            drawPath(bolt, Color(0xFF0A2A12))
        }
    }
}
