package com.onedex1.luma.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Thin, rounded line icons in the spirit of SF Symbols, drawn on a 24×24 grid.
 * They are white; tint them with `Icon(tint = …)`.
 */
object LumaIcons {

    private fun icon(name: String, stroke: Float = 1.8f, block: PathBuilder.() -> Unit): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color.White),
                strokeLineWidth = stroke,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
                pathBuilder = block,
            )
        }.build()

    private fun PathBuilder.circle(cx: Float, cy: Float, r: Float) {
        moveTo(cx - r, cy)
        arcTo(r, r, 0f, isMoreThanHalf = true, isPositiveArc = true, x1 = cx + r, y1 = cy)
        arcTo(r, r, 0f, isMoreThanHalf = true, isPositiveArc = true, x1 = cx - r, y1 = cy)
        close()
    }

    val Search: ImageVector by lazy {
        icon("search", 2f) {
            circle(10.5f, 10.5f, 6.25f)
            moveTo(15.2f, 15.2f)
            lineTo(20f, 20f)
        }
    }

    val Close: ImageVector by lazy {
        icon("close", 2f) {
            moveTo(7f, 7f); lineTo(17f, 17f)
            moveTo(17f, 7f); lineTo(7f, 17f)
        }
    }

    val ChevronDown: ImageVector by lazy {
        icon("chevron_down", 2.2f) {
            moveTo(6f, 9.5f); lineTo(12f, 15f); lineTo(18f, 9.5f)
        }
    }

    val Check: ImageVector by lazy {
        icon("check", 2.4f) {
            moveTo(5.5f, 12.5f); lineTo(10f, 17f); lineTo(18.5f, 7.5f)
        }
    }

    /** "Настройки Luma": three sliders. */
    val Sliders: ImageVector by lazy {
        icon("sliders") {
            moveTo(4f, 7f); lineTo(7.2f, 7f)
            moveTo(11.8f, 7f); lineTo(20f, 7f)
            circle(9.5f, 7f, 2.3f)
            moveTo(4f, 12f); lineTo(12.2f, 12f)
            moveTo(16.8f, 12f); lineTo(20f, 12f)
            circle(14.5f, 12f, 2.3f)
            moveTo(4f, 17f); lineTo(6.2f, 17f)
            moveTo(10.8f, 17f); lineTo(20f, 17f)
            circle(8.5f, 17f, 2.3f)
        }
    }

    /** "Обои": a picture with mountains and the sun. */
    val Photo: ImageVector by lazy {
        icon("photo") {
            moveTo(6.5f, 4.5f); lineTo(17.5f, 4.5f)
            quadTo(20f, 4.5f, 20f, 7f); lineTo(20f, 17f)
            quadTo(20f, 19.5f, 17.5f, 19.5f); lineTo(6.5f, 19.5f)
            quadTo(4f, 19.5f, 4f, 17f); lineTo(4f, 7f)
            quadTo(4f, 4.5f, 6.5f, 4.5f); close()
            moveTo(4.6f, 16.6f); lineTo(9.2f, 12f); lineTo(13f, 15.6f)
            lineTo(15.4f, 13.4f); lineTo(19.6f, 17.2f)
            circle(15.5f, 8.8f, 1.5f)
        }
    }

    val Info: ImageVector by lazy {
        icon("info") {
            circle(12f, 12f, 8.5f)
            moveTo(12f, 11f); lineTo(12f, 16.2f)
            moveTo(12f, 7.9f); lineTo(12f, 8f)
        }
    }

    val Trash: ImageVector by lazy {
        icon("trash") {
            moveTo(4.5f, 7f); lineTo(19.5f, 7f)
            moveTo(9.5f, 7f); lineTo(9.5f, 5.3f)
            quadTo(9.5f, 4.4f, 10.4f, 4.4f); lineTo(13.6f, 4.4f)
            quadTo(14.5f, 4.4f, 14.5f, 5.3f); lineTo(14.5f, 7f)
            moveTo(6.5f, 7f); lineTo(7.4f, 18.6f)
            quadTo(7.5f, 20f, 8.9f, 20f); lineTo(15.1f, 20f)
            quadTo(16.5f, 20f, 16.6f, 18.6f); lineTo(17.5f, 7f)
            moveTo(10.2f, 10.5f); lineTo(10.2f, 16.5f)
            moveTo(13.8f, 10.5f); lineTo(13.8f, 16.5f)
        }
    }

    val MinusCircle: ImageVector by lazy {
        icon("minus_circle") {
            circle(12f, 12f, 8.5f)
            moveTo(8.2f, 12f); lineTo(15.8f, 12f)
        }
    }

    val Home: ImageVector by lazy {
        icon("home") {
            moveTo(3.8f, 11.2f); lineTo(12f, 4.2f); lineTo(20.2f, 11.2f)
            moveTo(6.3f, 9.4f); lineTo(6.3f, 18f)
            quadTo(6.3f, 19.6f, 7.9f, 19.6f); lineTo(16.1f, 19.6f)
            quadTo(17.7f, 19.6f, 17.7f, 18f); lineTo(17.7f, 9.4f)
            moveTo(10.2f, 19.6f); lineTo(10.2f, 14.6f); lineTo(13.8f, 14.6f); lineTo(13.8f, 19.6f)
        }
    }

    /** "В док": arrow down into a tray. */
    val DockIn: ImageVector by lazy {
        icon("dock_in") {
            moveTo(12f, 4f); lineTo(12f, 13.2f)
            moveTo(8.2f, 9.6f); lineTo(12f, 13.4f); lineTo(15.8f, 9.6f)
            moveTo(4f, 15.5f); lineTo(4f, 18f)
            quadTo(4f, 20f, 6f, 20f); lineTo(18f, 20f)
            quadTo(20f, 20f, 20f, 18f); lineTo(20f, 15.5f)
        }
    }

    /** "Убрать из дока": arrow up out of a tray. */
    val DockOut: ImageVector by lazy {
        icon("dock_out") {
            moveTo(12f, 13.4f); lineTo(12f, 4.2f)
            moveTo(8.2f, 8f); lineTo(12f, 4.2f); lineTo(15.8f, 8f)
            moveTo(4f, 15.5f); lineTo(4f, 18f)
            quadTo(4f, 20f, 6f, 20f); lineTo(18f, 20f)
            quadTo(20f, 20f, 20f, 18f); lineTo(20f, 15.5f)
        }
    }

    /** A phone with a sparkle: "Сделать рабочим столом". */
    val PhoneHome: ImageVector by lazy {
        icon("phone_home") {
            moveTo(8.5f, 3.5f); lineTo(15.5f, 3.5f)
            quadTo(17.5f, 3.5f, 17.5f, 5.5f); lineTo(17.5f, 18.5f)
            quadTo(17.5f, 20.5f, 15.5f, 20.5f); lineTo(8.5f, 20.5f)
            quadTo(6.5f, 20.5f, 6.5f, 18.5f); lineTo(6.5f, 5.5f)
            quadTo(6.5f, 3.5f, 8.5f, 3.5f); close()
            moveTo(10.5f, 17.6f); lineTo(13.5f, 17.6f)
        }
    }

    val Sparkle: ImageVector by lazy {
        icon("sparkle", 1.7f) {
            moveTo(12f, 3.5f)
            quadTo(12.9f, 10.6f, 20f, 12f)
            quadTo(12.9f, 13.4f, 12f, 20.5f)
            quadTo(11.1f, 13.4f, 4f, 12f)
            quadTo(11.1f, 10.6f, 12f, 3.5f)
            close()
        }
    }

    val Grid: ImageVector by lazy {
        icon("grid") {
            moveTo(5.5f, 4.5f); lineTo(9f, 4.5f); quadTo(10f, 4.5f, 10f, 5.5f); lineTo(10f, 9f)
            quadTo(10f, 10f, 9f, 10f); lineTo(5.5f, 10f); quadTo(4.5f, 10f, 4.5f, 9f); lineTo(4.5f, 5.5f)
            quadTo(4.5f, 4.5f, 5.5f, 4.5f); close()
            moveTo(15f, 4.5f); lineTo(18.5f, 4.5f); quadTo(19.5f, 4.5f, 19.5f, 5.5f); lineTo(19.5f, 9f)
            quadTo(19.5f, 10f, 18.5f, 10f); lineTo(15f, 10f); quadTo(14f, 10f, 14f, 9f); lineTo(14f, 5.5f)
            quadTo(14f, 4.5f, 15f, 4.5f); close()
            moveTo(5.5f, 14f); lineTo(9f, 14f); quadTo(10f, 14f, 10f, 15f); lineTo(10f, 18.5f)
            quadTo(10f, 19.5f, 9f, 19.5f); lineTo(5.5f, 19.5f); quadTo(4.5f, 19.5f, 4.5f, 18.5f); lineTo(4.5f, 15f)
            quadTo(4.5f, 14f, 5.5f, 14f); close()
            moveTo(15f, 14f); lineTo(18.5f, 14f); quadTo(19.5f, 14f, 19.5f, 15f); lineTo(19.5f, 18.5f)
            quadTo(19.5f, 19.5f, 18.5f, 19.5f); lineTo(15f, 19.5f); quadTo(14f, 19.5f, 14f, 18.5f); lineTo(14f, 15f)
            quadTo(14f, 14f, 15f, 14f); close()
        }
    }

    val Person: ImageVector by lazy {
        icon("person") {
            circle(12f, 8.5f, 3.6f)
            moveTo(5.2f, 19.5f)
            quadTo(6.2f, 14.2f, 12f, 14.2f)
            quadTo(17.8f, 14.2f, 18.8f, 19.5f)
        }
    }

    val Drop: ImageVector by lazy {
        icon("drop") {
            moveTo(12f, 3.8f)
            quadTo(18.5f, 10.6f, 18.5f, 14.2f)
            quadTo(18.5f, 20.2f, 12f, 20.2f)
            quadTo(5.5f, 20.2f, 5.5f, 14.2f)
            quadTo(5.5f, 10.6f, 12f, 3.8f)
            close()
        }
    }
}
