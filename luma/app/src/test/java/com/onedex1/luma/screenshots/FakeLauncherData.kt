package com.onedex1.luma.screenshots

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.graphics.Typeface
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.ui.components.IconLoader
import java.util.Calendar
import kotlin.math.cos
import kotlin.math.sin

/**
 * Fake apps for the JVM screenshot tests: realistic Russian labels (including a few long ones to
 * exercise ellipsizing) and generated icons that look like what LauncherApps returns on a Pixel:
 * adaptive icons already masked to a circle, some with a coloured background, some white.
 */
object FakeLauncherData {

    private enum class Look { COLOR, WHITE, DARK }

    private data class FakeApp(
        val label: String,
        val pkg: String,
        val color: Int,
        val look: Look,
        val glyph: String,
    )

    private val fake = listOf(
        FakeApp("Телефон", "com.google.android.dialer", 0xFF1A73E8.toInt(), Look.WHITE, "phone"),
        FakeApp("Сообщения", "com.google.android.apps.messaging", 0xFF1A73E8.toInt(), Look.COLOR, "bubble"),
        FakeApp("Chrome", "com.android.chrome", 0xFF34A853.toInt(), Look.WHITE, "ring"),
        FakeApp("Камера", "com.android.camera", 0xFF5F6368.toInt(), Look.DARK, "lens"),
        FakeApp("Настройки", "com.android.settings", 0xFF4285F4.toInt(), Look.COLOR, "gear"),
        FakeApp("Play Маркет", "com.android.vending", 0xFF01875F.toInt(), Look.WHITE, "play"),
        FakeApp("Google Фото", "com.google.android.apps.photos", 0xFFFBBC04.toInt(), Look.WHITE, "petals"),
        FakeApp("YouTube", "com.google.android.youtube", 0xFFFF0033.toInt(), Look.WHITE, "play"),
        FakeApp("Часы", "com.google.android.deskclock", 0xFF0B57D0.toInt(), Look.COLOR, "clock"),
        FakeApp("Календарь", "com.google.android.calendar", 0xFF1A73E8.toInt(), Look.WHITE, "21"),
        FakeApp("Карты", "com.google.android.apps.maps", 0xFF34A853.toInt(), Look.WHITE, "pin"),
        FakeApp("Gmail", "com.google.android.gm", 0xFFEA4335.toInt(), Look.WHITE, "M"),
        FakeApp("Telegram", "org.telegram.messenger", 0xFF2AABEE.toInt(), Look.COLOR, "plane"),
        FakeApp("ВКонтакте", "com.vkontakte.android", 0xFF0077FF.toInt(), Look.COLOR, "VK"),
        FakeApp("TikTok", "com.zhiliaoapp.musically", 0xFFF2F2F2.toInt(), Look.DARK, "note"),
        FakeApp("Minecraft", "com.mojang.minecraftpe", 0xFF5D8C3E.toInt(), Look.COLOR, "block"),
        FakeApp("Discord", "com.discord", 0xFF5865F2.toInt(), Look.COLOR, "bubble"),
        FakeApp("Яндекс Музыка", "ru.yandex.music", 0xFFFFCC00.toInt(), Look.DARK, "note"),
        FakeApp("Twitch", "tv.twitch.android.app", 0xFF9146FF.toInt(), Look.COLOR, "bubble"),
        FakeApp("Госуслуги", "ru.rostel", 0xFF0D4CD3.toInt(), Look.WHITE, "Г"),
        FakeApp("СберБанк Онлайн", "ru.sberbankmobile", 0xFF21A038.toInt(), Look.COLOR, "ring"),
        FakeApp("Калькулятор", "com.google.android.calculator", 0xFF00639B.toInt(), Look.COLOR, "="),
        FakeApp("Заметки", "com.google.android.keep", 0xFFFBBC04.toInt(), Look.COLOR, "bulb"),
        FakeApp("Погода", "com.weather.app", 0xFF4FA3FF.toInt(), Look.COLOR, "sun"),
        FakeApp("Файлы", "com.google.android.apps.nbu.files", 0xFF0B57D0.toInt(), Look.WHITE, "folder"),
        FakeApp("Контакты", "com.google.android.contacts", 0xFF1A73E8.toInt(), Look.COLOR, "person"),
        FakeApp("Диктофон", "com.google.android.apps.recorder", 0xFFEA4335.toInt(), Look.WHITE, "dot"),
        FakeApp("Кинопоиск", "ru.kinopoisk", 0xFFFF5500.toInt(), Look.DARK, "lens"),
    )

    private fun keyOf(pkg: String) = "$pkg/$pkg.MainActivity"

    val apps: List<AppInfo> = fake
        .map { AppInfo(key = keyOf(it.pkg), packageName = it.pkg, className = "${it.pkg}.MainActivity", label = it.label) }
        .sortedBy { it.label.lowercase() }

    /** Dock: dialer, messages, browser, camera (what LayoutStore.ensureDefaults picks). */
    val dock: List<String> = listOf(
        "com.google.android.dialer", "com.google.android.apps.messaging", "com.android.chrome", "com.android.camera",
    ).map(::keyOf)

    /** Home grid: the popular apps LayoutStore puts there first, then alphabetical fill (16 apps). */
    val home: List<String> = listOf(
        "com.android.settings", "com.android.vending", "com.google.android.apps.photos", "com.google.android.youtube",
        "com.google.android.deskclock", "com.google.android.calendar", "com.google.android.apps.maps", "com.google.android.gm",
        "org.telegram.messenger", "com.vkontakte.android", "com.zhiliaoapp.musically", "com.mojang.minecraftpe",
        "com.discord", "ru.yandex.music", "ru.sberbankmobile", "ru.rostel",
    ).map(::keyOf)

    /** Saturday, 21 November 2026, 21:47 -> "Добрый вечер", "суббота, 21 ноября". */
    val fixedTime: Long = Calendar.getInstance().apply {
        set(2026, Calendar.NOVEMBER, 21, 21, 47, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    private val byKey = fake.associateBy { keyOf(it.pkg) }

    val iconLoader: IconLoader = { key, size -> icon(key, size) }

    fun icon(key: String, sizePx: Int): ImageBitmap? {
        val app = byKey[key] ?: return null
        val s = sizePx.coerceAtLeast(8)
        val f = s.toFloat()
        val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        // Background disc (Pixel launcher masks adaptive icons to a circle).
        when (app.look) {
            Look.COLOR -> p.shader = LinearGradient(0f, 0f, f, f, lighten(app.color, 0.28f), app.color, Shader.TileMode.CLAMP)
            Look.WHITE -> p.shader = LinearGradient(0f, 0f, 0f, f, 0xFFFFFFFF.toInt(), 0xFFF1F3F4.toInt(), Shader.TileMode.CLAMP)
            Look.DARK -> p.shader = LinearGradient(0f, 0f, 0f, f, 0xFF2B2B2B.toInt(), 0xFF101010.toInt(), Shader.TileMode.CLAMP)
        }
        c.drawCircle(f / 2f, f / 2f, f / 2f, p)
        p.shader = null
        val fg = when (app.look) {
            Look.COLOR -> 0xFFFFFFFF.toInt()
            Look.WHITE -> app.color
            Look.DARK -> app.color
        }
        drawGlyph(c, app.glyph, f, fg, p)
        return bmp.asImageBitmap()
    }

    private fun drawGlyph(c: Canvas, glyph: String, f: Float, color: Int, p: Paint) {
        p.color = color
        p.style = Paint.Style.FILL
        val cx = f / 2f
        val cy = f / 2f
        when (glyph) {
            "ring" -> {
                p.style = Paint.Style.STROKE; p.strokeWidth = f * 0.11f
                c.drawCircle(cx, cy, f * 0.22f, p)
            }
            "lens" -> {
                c.drawCircle(cx, cy, f * 0.24f, p)
                p.color = 0xFF0B0B0B.toInt(); c.drawCircle(cx, cy, f * 0.12f, p)
            }
            "dot" -> c.drawCircle(cx, cy, f * 0.17f, p)
            "play" -> {
                val path = Path().apply {
                    moveTo(cx - f * 0.13f, cy - f * 0.18f); lineTo(cx + f * 0.2f, cy); lineTo(cx - f * 0.13f, cy + f * 0.18f); close()
                }
                c.drawPath(path, p)
            }
            "plane" -> {
                val path = Path().apply {
                    moveTo(cx - f * 0.24f, cy - f * 0.02f); lineTo(cx + f * 0.22f, cy - f * 0.2f)
                    lineTo(cx + f * 0.12f, cy + f * 0.2f); lineTo(cx - f * 0.02f, cy + f * 0.06f); close()
                }
                c.drawPath(path, p)
            }
            "bubble" -> {
                c.drawRoundRect(cx - f * 0.24f, cy - f * 0.18f, cx + f * 0.24f, cy + f * 0.12f, f * 0.1f, f * 0.1f, p)
                val path = Path().apply { moveTo(cx - f * 0.12f, cy + f * 0.1f); lineTo(cx - f * 0.16f, cy + f * 0.24f); lineTo(cx + f * 0.02f, cy + f * 0.1f); close() }
                c.drawPath(path, p)
            }
            "gear" -> {
                for (i in 0 until 8) {
                    val a = Math.PI * 2 * i / 8
                    c.drawCircle(cx + (cos(a) * f * 0.2f).toFloat(), cy + (sin(a) * f * 0.2f).toFloat(), f * 0.07f, p)
                }
                c.drawCircle(cx, cy, f * 0.19f, p)
                p.color = 0xFF2A62D8.toInt(); c.drawCircle(cx, cy, f * 0.08f, p)
            }
            "petals" -> {
                val colors = intArrayOf(0xFFEA4335.toInt(), 0xFFFBBC04.toInt(), 0xFF34A853.toInt(), 0xFF4285F4.toInt())
                for (i in 0 until 4) {
                    p.color = colors[i]
                    val a = Math.PI / 2 * i
                    c.drawCircle(cx + (cos(a) * f * 0.11f).toFloat(), cy + (sin(a) * f * 0.11f).toFloat(), f * 0.11f, p)
                }
            }
            "clock" -> {
                c.drawCircle(cx, cy, f * 0.26f, p)
                p.color = 0xFF0B57D0.toInt(); p.strokeWidth = f * 0.04f; p.strokeCap = Paint.Cap.ROUND
                c.drawLine(cx, cy, cx, cy - f * 0.17f, p); c.drawLine(cx, cy, cx + f * 0.12f, cy + f * 0.05f, p)
            }
            "pin" -> {
                c.drawCircle(cx, cy - f * 0.06f, f * 0.16f, p)
                val path = Path().apply { moveTo(cx - f * 0.14f, cy); lineTo(cx, cy + f * 0.26f); lineTo(cx + f * 0.14f, cy); close() }
                c.drawPath(path, p)
                p.color = 0xFFFFFFFF.toInt(); c.drawCircle(cx, cy - f * 0.06f, f * 0.06f, p)
            }
            "note" -> {
                c.drawCircle(cx - f * 0.06f, cy + f * 0.14f, f * 0.1f, p)
                c.drawRect(cx + f * 0.0f, cy - f * 0.22f, cx + f * 0.05f, cy + f * 0.14f, p)
                c.drawRect(cx + f * 0.0f, cy - f * 0.22f, cx + f * 0.16f, cy - f * 0.15f, p)
            }
            "block" -> {
                c.drawRect(cx - f * 0.2f, cy - f * 0.2f, cx + f * 0.2f, cy + f * 0.2f, p)
                p.color = 0xFF8B5A2B.toInt(); c.drawRect(cx - f * 0.2f, cy - f * 0.02f, cx + f * 0.2f, cy + f * 0.2f, p)
            }
            "bulb" -> {
                c.drawCircle(cx, cy - f * 0.04f, f * 0.16f, p)
                c.drawRect(cx - f * 0.07f, cy + f * 0.1f, cx + f * 0.07f, cy + f * 0.2f, p)
            }
            "sun" -> {
                p.color = 0xFFFFD54F.toInt(); c.drawCircle(cx - f * 0.06f, cy - f * 0.06f, f * 0.14f, p)
                p.color = 0xFFFFFFFF.toInt(); c.drawRoundRect(cx - f * 0.18f, cy, cx + f * 0.24f, cy + f * 0.16f, f * 0.08f, f * 0.08f, p)
            }
            "folder" -> {
                c.drawRoundRect(cx - f * 0.24f, cy - f * 0.14f, cx + f * 0.24f, cy + f * 0.2f, f * 0.05f, f * 0.05f, p)
                c.drawRoundRect(cx - f * 0.24f, cy - f * 0.2f, cx - f * 0.02f, cy - f * 0.08f, f * 0.04f, f * 0.04f, p)
            }
            "person" -> {
                c.drawCircle(cx, cy - f * 0.08f, f * 0.1f, p)
                c.drawRoundRect(cx - f * 0.18f, cy + f * 0.06f, cx + f * 0.18f, cy + f * 0.24f, f * 0.09f, f * 0.09f, p)
            }
            "phone" -> {
                p.style = Paint.Style.STROKE; p.strokeWidth = f * 0.09f; p.strokeCap = Paint.Cap.ROUND
                val path = Path().apply {
                    moveTo(cx - f * 0.15f, cy - f * 0.18f)
                    quadTo(cx - f * 0.18f, cy + f * 0.16f, cx + f * 0.17f, cy + f * 0.16f)
                }
                c.drawPath(path, p)
            }
            else -> {
                p.textAlign = Paint.Align.CENTER
                p.typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
                p.textSize = f * (if (glyph.length > 1) 0.32f else 0.42f)
                c.drawText(glyph, cx, cy - (p.descent() + p.ascent()) / 2f, p)
            }
        }
        p.style = Paint.Style.FILL
    }

    private fun lighten(color: Int, k: Float): Int {
        fun ch(shift: Int): Int {
            val v = (color shr shift) and 0xFF
            return (v + (255 - v) * k).toInt().coerceIn(0, 255)
        }
        return (0xFF shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
    }
}
