package com.onedex1.luma.ui.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.onedex1.luma.R
import com.onedex1.luma.glass.GlassSurface
import com.onedex1.luma.glass.LocalGlassStyle
import com.onedex1.luma.ui.components.PrimaryButton
import com.onedex1.luma.ui.components.SecondaryButton
import com.onedex1.luma.ui.theme.LumaColors
import com.onedex1.luma.ui.theme.LumaType

/** First-launch welcome card: logo, short text, "Сделать рабочим столом" / "Позже". */
@Composable
fun OnboardingCard(
    cornerRadius: Dp,
    onMakeDefault: () -> Unit,
    onLater: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassSurface(
        modifier = modifier
            .widthIn(max = 420.dp)
            .fillMaxWidth(),
        cornerRadius = cornerRadius + 6.dp,
        style = LocalGlassStyle.current.copy(heavy = true),
    ) {
        // Faint dark layer: keeps the white text readable on bright wallpapers.
        Box(
            Modifier
                .matchParentSize()
                .clip(RoundedCornerShape(cornerRadius + 6.dp))
                .background(Color.Black.copy(alpha = 0.10f)),
        )
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.luma_logo),
                contentDescription = null,
                modifier = Modifier
                    .size(96.dp)
                    .shadow(18.dp, RoundedCornerShape(26.dp), clip = false, ambientColor = Color(0xFF0B3FD4), spotColor = Color(0xFF0B3FD4))
                    .clip(RoundedCornerShape(26.dp)),
            )
            Spacer(Modifier.height(22.dp))
            Text(
                text = stringResource(R.string.onboarding_title),
                style = LumaType.title,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = stringResource(R.string.onboarding_text),
                style = LumaType.callout.copy(color = LumaColors.TextSecondary),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(26.dp))
            PrimaryButton(
                text = stringResource(R.string.onboarding_make_default),
                onClick = onMakeDefault,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            SecondaryButton(
                text = stringResource(R.string.onboarding_later),
                onClick = onLater,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
