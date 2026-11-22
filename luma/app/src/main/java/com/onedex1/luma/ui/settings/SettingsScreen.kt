package com.onedex1.luma.ui.settings

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.onedex1.luma.R
import com.onedex1.luma.data.AppInfo
import com.onedex1.luma.data.GLASS_PRESETS
import com.onedex1.luma.data.LumaSettings
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.glass.LocalGlassStyle
import com.onedex1.luma.glass.WallpaperPreset
import com.onedex1.luma.glass.isLiquidRefractionSupported
import com.onedex1.luma.ui.components.AppIconVisual
import com.onedex1.luma.ui.components.IconLoader
import com.onedex1.luma.ui.components.IconLook
import com.onedex1.luma.ui.components.LumaChip
import com.onedex1.luma.ui.components.LumaSegmented
import com.onedex1.luma.ui.components.LumaSwitch
import com.onedex1.luma.ui.components.PrimaryButton
import com.onedex1.luma.ui.components.SecondaryButton
import com.onedex1.luma.ui.components.SettingRow
import com.onedex1.luma.ui.components.SliderRow
import com.onedex1.luma.ui.components.Hairline
import com.onedex1.luma.ui.components.fittedIconSize
import com.onedex1.luma.ui.components.springClickable
import com.onedex1.luma.ui.home.formatTime
import com.onedex1.luma.ui.home.greetingText
import com.onedex1.luma.ui.home.russianDate
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaIcons
import com.onedex1.luma.ui.theme.LumaStrongShadow
import com.onedex1.luma.ui.theme.LumaType
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.roundToInt

/** Renders a wallpaper thumbnail: id ("ocean", "custom"…) at the given pixel size. */
typealias ThumbnailLoader = suspend (id: String, widthPx: Int, heightPx: Int) -> ImageBitmap?

/** Tint swatches offered under "Оттенок". */
val TINT_SWATCHES: List<Long> = listOf(
    0xFFFFFFFF, 0xFFEAF4FF, 0xFF2F7BFF, 0xFFB14DFF,
    0xFFFF5FA2, 0xFFFF9F43, 0xFF3DDC97, 0xFF1A1D24,
)

private object Badge {
    val Glass = Brush.linearGradient(listOf(Color(0xFF59A2FF), Color(0xFF1F5BFF)))
    val Wallpaper = Brush.linearGradient(listOf(Color(0xFFD06BFF), Color(0xFF7B3BFF)))
    val Icons = Brush.linearGradient(listOf(Color(0xFF34E0C4), Color(0xFF0E9C8C)))
    val Desktop = Brush.linearGradient(listOf(Color(0xFFFFB648), Color(0xFFFF7A1A)))
    val Default = Brush.linearGradient(listOf(Color(0xFF5BE38A), Color(0xFF1FAF55)))
}

/**
 * "Настройки Luma": glass cards over the live wallpaper. Every change is applied at once, so the
 * glass of the cards themselves is the live preview. Stateless apart from the name draft.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    settings: LumaSettings,
    wallpapers: List<WallpaperPreset>,
    hasCustomWallpaper: Boolean,
    thumbnailLoader: ThumbnailLoader,
    previewApps: List<AppInfo>,
    iconLoader: IconLoader,
    nowMillis: Long,
    isDefaultHome: Boolean,
    versionName: String,
    onUpdate: ((LumaSettings) -> LumaSettings) -> Unit,
    onApplyPreset: (String) -> Unit,
    onPickPhoto: () -> Unit,
    onApplySystemWallpaper: () -> Unit,
    onMakeDefault: () -> Unit,
    onOpenHomeSettings: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    iconsVersion: Int = 0,
    customWallpaperVersion: Int = 0,
    applyingSystemWallpaper: Boolean = false,
    refractionSupported: Boolean = isLiquidRefractionSupported,
    scrollState: ScrollState = rememberScrollState(),
    scrollToWallpaperToken: Int = 0,
) {
    val corner = settings.cornerDp.dp
    val density = LocalDensity.current
    val focusManager = LocalFocusManager.current
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var wallpaperY by remember { mutableFloatStateOf(-1f) }

    LaunchedEffect(scrollToWallpaperToken) {
        if (scrollToWallpaperToken > 0) {
            // wait for the first layout of the cards
            var tries = 0
            while (wallpaperY < 0f && tries < 20) {
                kotlinx.coroutines.delay(16)
                tries++
            }
            if (wallpaperY >= 0f) {
                val target = (wallpaperY - with(density) { (statusTop + 70.dp).toPx() }).roundToInt().coerceAtLeast(0)
                scrollState.animateScrollTo(target, spring(dampingRatio = 1f, stiffness = 260f))
            }
        }
    }

    Box(modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp),
        ) {
            Spacer(Modifier.height(statusTop + 64.dp))
            Text(stringResource(R.string.settings_title), style = LumaType.largeTitle, modifier = Modifier.padding(start = 6.dp))
            Spacer(Modifier.height(18.dp))

            // ---- Live preview
            SectionLabel(stringResource(R.string.settings_preview))
            PreviewCard(settings, previewApps, iconLoader, iconsVersion, nowMillis)
            Spacer(Modifier.height(18.dp))

            // ---- Glass style
            SectionCard(stringResource(R.string.section_glass), LumaIcons.Drop, Badge.Glass, corner) {
                FlowRow(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    GLASS_PRESETS.forEach { preset ->
                        LumaChip(
                            text = preset.title,
                            selected = settings.preset == preset.id,
                            onClick = { onApplyPreset(preset.id) },
                            leading = { ColorDot(preset.tintColor, 14.dp) },
                        )
                    }
                    if (GLASS_PRESETS.none { it.id == settings.preset }) {
                        LumaChip(
                            text = stringResource(R.string.glass_custom),
                            selected = true,
                            onClick = {},
                            leading = { ColorDot(settings.tintColor, 14.dp) },
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                SliderRow(
                    title = stringResource(R.string.glass_blur),
                    valueText = percent(settings.blur),
                    value = settings.blur,
                    onValueChange = { v -> onUpdate { it.copy(blur = v) } },
                )
                val transparency = 1f - settings.tintAlpha / LumaSettings.TINT_ALPHA_MAX
                SliderRow(
                    title = stringResource(R.string.glass_transparency),
                    valueText = percent(transparency),
                    value = transparency,
                    onValueChange = { v -> onUpdate { it.copy(tintAlpha = (1f - v) * LumaSettings.TINT_ALPHA_MAX) } },
                )
                SliderRow(
                    title = stringResource(R.string.glass_edge),
                    valueText = percent(settings.edge),
                    value = settings.edge,
                    onValueChange = { v -> onUpdate { it.copy(edge = v) } },
                )
                SliderRow(
                    title = stringResource(R.string.glass_corners),
                    valueText = settings.cornerDp.toString(),
                    value = settings.cornerDp.toFloat(),
                    valueRange = LumaSettings.CORNER_MIN_DP.toFloat()..LumaSettings.CORNER_MAX_DP.toFloat(),
                    onValueChange = { v -> onUpdate { it.copy(cornerDp = v.roundToInt()) } },
                )
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.glass_tint), style = LumaType.body)
                Spacer(Modifier.height(10.dp))
                FlowRow(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    TINT_SWATCHES.forEach { color ->
                        Swatch(color, selected = settings.tintColor == color) {
                            onUpdate { it.copy(tintColor = color) }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Hairline()
                SettingRow(
                    title = stringResource(R.string.glass_refraction),
                    note = if (refractionSupported) null else stringResource(R.string.glass_refraction_note),
                ) {
                    // Unsupported (Android 12 and lower): shown off and disabled, not "on".
                    LumaSwitch(
                        checked = settings.refraction && refractionSupported,
                        enabled = refractionSupported,
                        onCheckedChange = { c -> onUpdate { it.copy(refraction = c) } },
                    )
                }
                SliderRow(
                    title = stringResource(R.string.glass_refraction_strength),
                    valueText = percent(settings.refractionStrength),
                    value = settings.refractionStrength,
                    enabled = settings.refraction && refractionSupported,
                    onValueChange = { v -> onUpdate { it.copy(refractionStrength = v) } },
                )
                Hairline()
                SettingRow(
                    title = stringResource(R.string.glass_tilt),
                    note = stringResource(R.string.glass_tilt_note),
                ) {
                    LumaSwitch(
                        checked = settings.tiltHighlights,
                        onCheckedChange = { c -> onUpdate { it.copy(tiltHighlights = c) } },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            // ---- Wallpaper
            SectionCard(
                stringResource(R.string.section_wallpaper),
                LumaIcons.Photo,
                Badge.Wallpaper,
                corner,
                Modifier.onGloballyPositioned { wallpaperY = it.positionInParent().y },
            ) {
                Row(
                    Modifier
                        .bleed(18.dp)
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 18.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    wallpapers.forEach { preset ->
                        val spec = LumaSettings.presetWallpaper(preset.id)
                        WallpaperThumb(
                            id = preset.id,
                            title = preset.title,
                            selected = settings.wallpaper == spec,
                            version = 0,
                            loader = thumbnailLoader,
                            onClick = { onUpdate { it.copy(wallpaper = spec) } },
                        )
                    }
                    if (hasCustomWallpaper) {
                        WallpaperThumb(
                            id = LumaSettings.WALLPAPER_CUSTOM,
                            title = stringResource(R.string.wallpaper_custom),
                            selected = settings.wallpaper == LumaSettings.WALLPAPER_CUSTOM,
                            version = customWallpaperVersion,
                            loader = thumbnailLoader,
                            onClick = { onUpdate { it.copy(wallpaper = LumaSettings.WALLPAPER_CUSTOM) } },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                SecondaryButton(
                    text = stringResource(R.string.wallpaper_pick_photo),
                    icon = LumaIcons.Photo,
                    onClick = onPickPhoto,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                SecondaryButton(
                    text = stringResource(if (applyingSystemWallpaper) R.string.wallpaper_setting_system else R.string.wallpaper_set_system),
                    icon = LumaIcons.PhoneHome,
                    enabled = !applyingSystemWallpaper,
                    onClick = onApplySystemWallpaper,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(16.dp))

            // ---- Icons
            SectionCard(stringResource(R.string.section_icons), LumaIcons.Grid, Badge.Icons, corner) {
                Text(stringResource(R.string.icons_style), style = LumaType.body, modifier = Modifier.padding(vertical = 4.dp))
                Spacer(Modifier.height(6.dp))
                LumaSegmented(
                    options = listOf(
                        LumaSettings.ICON_STYLE_ORIGINAL to stringResource(R.string.icons_style_original),
                        LumaSettings.ICON_STYLE_GLASS to stringResource(R.string.icons_style_glass),
                        LumaSettings.ICON_STYLE_CLEAR to stringResource(R.string.icons_style_clear),
                    ),
                    selected = settings.iconStyle,
                    onSelect = { style -> onUpdate { it.copy(iconStyle = style) } },
                )
                Spacer(Modifier.height(8.dp))
                SliderRow(
                    title = stringResource(R.string.icons_size),
                    valueText = settings.iconSizeDp.toString(),
                    value = settings.iconSizeDp.toFloat(),
                    valueRange = LumaSettings.ICON_SIZE_MIN_DP.toFloat()..LumaSettings.ICON_SIZE_MAX_DP.toFloat(),
                    onValueChange = { v -> onUpdate { it.copy(iconSizeDp = v.roundToInt()) } },
                )
                Hairline()
                SettingRow(title = stringResource(R.string.icons_labels)) {
                    LumaSwitch(
                        checked = settings.showLabels,
                        onCheckedChange = { c -> onUpdate { it.copy(showLabels = c) } },
                    )
                }
                Hairline()
                SettingRow(title = stringResource(R.string.icons_columns)) {
                    LumaSegmented(
                        options = listOf(4 to "4", 5 to "5"),
                        selected = settings.columns,
                        onSelect = { c -> onUpdate { it.copy(columns = c) } },
                        modifier = Modifier.width(120.dp),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            // ---- Desktop
            SectionCard(stringResource(R.string.section_desktop), LumaIcons.Person, Badge.Desktop, corner) {
                Text(stringResource(R.string.desktop_name), style = LumaType.body, modifier = Modifier.padding(vertical = 4.dp))
                Spacer(Modifier.height(6.dp))
                NameField(
                    initial = settings.greetingName,
                    onChange = { name -> onUpdate { it.copy(greetingName = name) } },
                    onDone = { focusManager.clearFocus() },
                )
                Spacer(Modifier.height(6.dp))
                SettingRow(title = stringResource(R.string.desktop_clock)) {
                    LumaSwitch(
                        checked = settings.showClock,
                        onCheckedChange = { c -> onUpdate { it.copy(showClock = c) } },
                    )
                }
                Hairline()
                SettingRow(title = stringResource(R.string.desktop_search)) {
                    LumaSwitch(
                        checked = settings.showSearch,
                        onCheckedChange = { c -> onUpdate { it.copy(showSearch = c) } },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            // ---- Default launcher
            SectionCard(
                stringResource(if (isDefaultHome) R.string.default_is_luma else R.string.default_title),
                LumaIcons.Home,
                Badge.Default,
                corner,
            ) {
                if (isDefaultHome) {
                    SecondaryButton(
                        text = stringResource(R.string.default_change),
                        icon = LumaIcons.Sliders,
                        onClick = onOpenHomeSettings,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    Text(stringResource(R.string.default_make_note), style = LumaType.footnote)
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton(
                        text = stringResource(R.string.default_make),
                        onClick = onMakeDefault,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(10.dp))
                    // Manual route for firmwares that block the system dialog (e.g. MIUI).
                    SecondaryButton(
                        text = stringResource(R.string.default_open_settings),
                        icon = LumaIcons.Sliders,
                        onClick = onOpenHomeSettings,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            // ---- About
            AboutCard(corner, versionName)
            Spacer(Modifier.height(navBottom + 28.dp))
        }

        // Top fade so the status bar stays legible over the wallpaper
        Box(
            Modifier
                .fillMaxWidth()
                .height(statusTop + 56.dp)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.38f), Color.Transparent))),
        )

        // iOS-style header bar: frosted glass that fades in once the large title scrolls away, so
        // cards slide under it instead of under the floating "Готово" button.
        val barStart = with(density) { 8.dp.toPx() }
        val barRange = with(density) { 44.dp.toPx() }
        val base = LocalGlassStyle.current
        val barStyle = remember(base) { base.copy(heavy = true, shadow = false, edge = 0f, refraction = 0f) }
        Box(
            Modifier
                .fillMaxWidth()
                .height(statusTop + 62.dp)
                .graphicsLayer { alpha = ((scrollState.value - barStart) / barRange).coerceIn(0f, 1f) },
        ) {
            GlassSurface(Modifier.fillMaxSize(), cornerRadius = 0.dp, style = barStyle) {
                Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.10f)))
                Text(
                    stringResource(R.string.settings_title),
                    style = LumaType.headline,
                    maxLines = 1,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = statusTop + 20.dp),
                )
            }
            Hairline(Modifier.align(Alignment.BottomCenter))
        }

        // Floating "Готово"
        GlassSurface(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(top = 10.dp, end = 16.dp)
                .springClickable(pressedScale = 0.92f, onClick = onClose)
                .height(42.dp),
            cornerRadius = 21.dp,
        ) {
            Text(
                stringResource(R.string.settings_done),
                style = LumaType.headline,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 20.dp),
            )
        }
    }
}

/** Lets a horizontally scrolling row run to the card edges while its items keep the card padding. */
private fun Modifier.bleed(horizontal: Dp): Modifier = layout { measurable, constraints ->
    val extra = horizontal.roundToPx()
    val width = constraints.maxWidth + extra * 2
    val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
    layout(constraints.maxWidth, placeable.height) { placeable.place(-extra, 0) }
}

private fun percent(v: Float): String = "${(v.coerceIn(0f, 1f) * 100f).roundToInt()}%"

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = LumaType.subhead.copy(color = Color.White.copy(alpha = 0.85f), shadow = LumaStrongShadow),
        modifier = Modifier.padding(start = 8.dp, bottom = 8.dp),
    )
}

@Composable
private fun SectionCard(
    title: String,
    icon: ImageVector,
    badge: Brush,
    corner: Dp,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    GlassSurface(modifier = modifier.fillMaxWidth(), cornerRadius = corner) {
        CardScrim(corner)
        Column(
            Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(30.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(badge),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(12.dp))
                Text(title, style = LumaType.headline, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

/** A faint dark layer inside big text cards, so white text stays readable on bright wallpapers. */
@Composable
private fun BoxScope.CardScrim(corner: Dp) {
    Box(
        Modifier
            .matchParentSize()
            .clip(RoundedCornerShape(corner))
            .background(Color.Black.copy(alpha = 0.07f)),
    )
}

@Composable
private fun ColorDot(color: Long, size: Dp) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(Color(color))
            .border(1.dp, Color.White.copy(alpha = 0.55f), CircleShape),
    )
}

@Composable
private fun Swatch(color: Long, selected: Boolean, onClick: () -> Unit) {
    val ring by animateFloatAsState(if (selected) 1f else 0f, spring(dampingRatio = 0.7f, stiffness = 600f), label = "swatch")
    Box(
        Modifier
            .size(32.dp)
            .springClickable(pressedScale = 0.88f, role = Role.RadioButton, onClick = onClick)
            .border((2.2f * ring).dp, Color.White.copy(alpha = 0.95f * ring), CircleShape)
            .padding(4.5.dp)
            .shadow(3.dp, CircleShape, clip = false)
            .clip(CircleShape)
            .background(Color(color))
            .border(1.dp, Color.White.copy(alpha = 0.35f), CircleShape),
    )
}

@Composable
private fun WallpaperThumb(
    id: String,
    title: String,
    selected: Boolean,
    version: Int,
    loader: ThumbnailLoader,
    onClick: () -> Unit,
) {
    val density = LocalDensity.current
    val w = 74.dp
    val h = 150.dp
    val wPx = with(density) { w.roundToPx() }
    val hPx = with(density) { h.roundToPx() }
    val image by produceState<ImageBitmap?>(null, id, version, wPx, hPx) {
        value = try {
            loader(id, wPx, hPx)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }
    val ring by animateFloatAsState(if (selected) 1f else 0f, spring(dampingRatio = 0.7f, stiffness = 500f), label = "thumb")
    Column(
        Modifier
            .width(w)
            .springClickable(pressedScale = 0.94f, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = title },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(w, h)
                .shadow(8.dp, RoundedCornerShape(16.dp), clip = false, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.4f))
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White.copy(alpha = 0.10f))
                .border((1f + 1.8f * ring).dp, Color.White.copy(alpha = 0.25f + 0.7f * ring), RoundedCornerShape(16.dp)),
        ) {
            image?.let {
                Image(
                    bitmap = it,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (selected) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(7.dp)
                        .size(22.dp)
                        .alpha(ring)
                        .clip(CircleShape)
                        .background(Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(LumaIcons.Check, contentDescription = null, tint = LumaColors.AccentDeep, modifier = Modifier.size(14.dp))
                }
            }
        }
        Spacer(Modifier.height(7.dp))
        Text(title, style = LumaType.caption.copy(color = if (selected) Color.White else LumaColors.TextSecondary), maxLines = 1)
    }
}

@Composable
private fun NameField(initial: String, onChange: (String) -> Unit, onDone: () -> Unit) {
    // Local draft = source of truth while typing (the store round-trip is asynchronous).
    var draft by rememberSaveable { mutableStateOf(initial) }
    val hint = stringResource(R.string.desktop_name_hint)
    Box(
        Modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(RoundedCornerShape(23.dp))
            .background(Color.White.copy(alpha = 0.13f))
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (draft.isEmpty()) {
            Text(hint, style = LumaType.body.copy(color = LumaColors.TextTertiary, shadow = null))
        }
        BasicTextField(
            value = draft,
            onValueChange = { v ->
                val clean = v.replace('\n', ' ').take(LumaSettings.GREETING_NAME_MAX_LENGTH)
                draft = clean
                onChange(clean)
            },
            singleLine = true,
            textStyle = LumaType.body.copy(shadow = null),
            cursorBrush = SolidColor(LumaColors.Accent),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onDone() }),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = hint },
        )
    }
}

@Composable
private fun PreviewCard(
    settings: LumaSettings,
    previewApps: List<AppInfo>,
    iconLoader: IconLoader,
    iconsVersion: Int,
    nowMillis: Long,
) {
    val corner = settings.cornerDp.dp
    val shape = RoundedCornerShape(corner + 6.dp)
    val look = IconLook.from(settings, iconsVersion)
    Box(
        Modifier
            .fillMaxWidth()
            .border(1.dp, Color.White.copy(alpha = 0.28f), shape)
            .padding(14.dp),
    ) {
        Column(Modifier.fillMaxWidth()) {
            if (settings.showClock) {
                GlassSurface(Modifier.fillMaxWidth(), cornerRadius = corner) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = formatTime(nowMillis, true),
                            style = LumaType.clock.copy(fontSize = 40.sp, lineHeight = 44.sp, letterSpacing = (-1).sp),
                        )
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(greetingText(nowMillis, settings.greetingName), style = LumaType.caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(russianDate(nowMillis), style = LumaType.subhead, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
            }
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val columns = settings.columns
                val cell = maxWidth / columns
                val iconSize = fittedIconSize(settings.iconSizeDp.dp, cell)
                Row(Modifier.fillMaxWidth()) {
                    previewApps.take(columns).forEach { app ->
                        Column(Modifier.width(cell), horizontalAlignment = Alignment.CenterHorizontally) {
                            AppIconVisual(app.key, iconSize, look, iconLoader)
                            if (settings.showLabels) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    app.label,
                                    style = LumaType.iconLabel,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.width(cell - 4.dp),
                                )
                            }
                        }
                    }
                }
            }
            if (settings.showSearch) {
                Spacer(Modifier.height(14.dp))
                GlassSurface(
                    Modifier
                        .align(Alignment.CenterHorizontally)
                        .height(36.dp),
                    cornerRadius = 18.dp,
                ) {
                    Row(Modifier.align(Alignment.Center).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(LumaIcons.Search, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.home_search), style = LumaType.caption.copy(color = Color.White))
                    }
                }
            }
        }
    }
    Spacer(Modifier.height(8.dp))
    Text(
        stringResource(R.string.settings_preview_note),
        style = LumaType.footnote.copy(shadow = LumaStrongShadow),
        modifier = Modifier.padding(horizontal = 8.dp),
    )
}

@Composable
private fun AboutCard(corner: Dp, versionName: String) {
    GlassSurface(Modifier.fillMaxWidth(), cornerRadius = corner) {
        CardScrim(corner)
        Row(
            Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(R.drawable.luma_logo),
                contentDescription = null,
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(17.dp)),
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.section_about), style = LumaType.headline)
                Spacer(Modifier.height(2.dp))
                Text(stringResource(R.string.about_tagline), style = LumaType.callout)
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.about_version, versionName), style = LumaType.footnote)
                Text(stringResource(R.string.about_made_for), style = LumaType.footnote)
            }
        }
    }
}
