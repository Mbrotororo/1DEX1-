package com.onedex1.luma.ui.theme

import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Luma palette: white text on glass, a blue accent taken from the Luma icon. */
object LumaColors {
    val Text = Color.White
    val TextSecondary = Color.White.copy(alpha = 0.84f)
    val TextTertiary = Color.White.copy(alpha = 0.64f)
    val Accent = Color(0xFF4A8BFF)
    val SwitchOn = Color(0xFF34C759)
    val AccentDeep = Color(0xFF0B3FD4)
    val Fill = Color.White.copy(alpha = 0.13f)
    val FillPressed = Color.White.copy(alpha = 0.22f)
    val FillSelected = Color.White.copy(alpha = 0.30f)
    val Hairline = Color.White.copy(alpha = 0.14f)
    val Danger = Color(0xFFFF7B7B)
    /** Destructive text on glass (lighter than [Danger] so it stays readable on blue glass). */
    val DangerText = Color(0xFFFFA49E)
    val Navy = Color(0xFF06154C)
    val WindowFallback = Color(0xFF020A3C)
}

/** Soft shadow under text that sits on glass or directly on the wallpaper. */
val LumaTextShadow = Shadow(color = Color.Black.copy(alpha = 0.30f), offset = Offset(0f, 1.5f), blurRadius = 7f)

/** Stronger shadow for icon labels and titles drawn straight onto the wallpaper. */
val LumaStrongShadow = Shadow(color = Color.Black.copy(alpha = 0.58f), offset = Offset(0f, 1.5f), blurRadius = 10f)

/** SF-like type scale built on the system sans-serif with light / medium weights. */
object LumaType {
    private val base = TextStyle(
        fontFamily = FontFamily.SansSerif,
        color = Color.White,
        shadow = LumaTextShadow,
    )

    val clock = base.copy(
        fontSize = 80.sp,
        lineHeight = 84.sp,
        fontWeight = FontWeight.Light,
        letterSpacing = (-2.4).sp,
    )
    val largeTitle = base.copy(
        fontSize = 34.sp,
        lineHeight = 40.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.7).sp,
        shadow = LumaStrongShadow,
    )
    val title = base.copy(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.4).sp)
    val title2 = base.copy(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp)
    val headline = base.copy(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp)
    val body = base.copy(fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.Normal, letterSpacing = (-0.1).sp)
    val bodyMedium = body.copy(fontWeight = FontWeight.Medium)
    val callout = base.copy(fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal)
    val subhead = base.copy(fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    val footnote = base.copy(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Normal, color = LumaColors.TextSecondary)
    val caption = base.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, color = LumaColors.TextSecondary)
    val iconLabel = base.copy(
        fontSize = 12.sp,
        lineHeight = 15.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.sp,
        shadow = LumaStrongShadow,
    )
}

/** Radius for a glass element of [height] that should look like a capsule-ish panel. */
fun panelRadius(corner: Dp, extra: Dp = 0.dp): Dp = corner + extra

// Created once: MaterialTheme provides these through static locals, and a new ColorScheme instance
// (it has no equals) would disable skipping for the whole UI on every LumaTheme recomposition.
private val LumaColorScheme = darkColorScheme(
    primary = LumaColors.Accent,
    onPrimary = Color.White,
    secondary = LumaColors.Accent,
    background = Color.Transparent,
    onBackground = Color.White,
    surface = Color.Transparent,
    onSurface = Color.White,
)

private val LumaTypography = Typography(
    displayLarge = LumaType.clock,
    headlineLarge = LumaType.largeTitle,
    titleLarge = LumaType.title,
    titleMedium = LumaType.headline,
    bodyLarge = LumaType.body,
    bodyMedium = LumaType.callout,
    bodySmall = LumaType.footnote,
    labelMedium = LumaType.caption,
    labelSmall = LumaType.iconLabel,
)

private val LumaSelectionColors = TextSelectionColors(
    handleColor = LumaColors.Accent,
    backgroundColor = LumaColors.Accent.copy(alpha = 0.35f),
)

@Composable
fun LumaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LumaColorScheme, typography = LumaTypography) {
        CompositionLocalProvider(
            LocalContentColor provides Color.White,
            LocalTextSelectionColors provides LumaSelectionColors,
            content = content,
        )
    }
}
