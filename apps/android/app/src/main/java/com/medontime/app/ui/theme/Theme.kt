package com.medontime.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** 医嘱绿（UI 规范定版主色）。 */
val MedGreen = Color(0xFF0B6B4F)
private val MedGreenDark = Color(0xFF084C37)
private val InkBlack = Color(0xFF101511)

private val NormalColors = lightColorScheme(
    primary = MedGreen,
    onPrimary = Color.White,
    secondary = MedGreenDark,
    background = Color(0xFFF7F9F7),
    surface = Color.White,
    onSurface = InkBlack,
)

/**
 * 关怀模式配色：白底近黑字、主色加深以满足对比度 ≥ 7:1（UI 规范 senior 关怀口径）。
 */
private val CareColors = lightColorScheme(
    primary = Color(0xFF063D2B),
    onPrimary = Color.White,
    secondary = Color(0xFF063D2B),
    background = Color.White,
    surface = Color.White,
    onSurface = Color(0xFF000000),
    surfaceVariant = Color(0xFFE8EDE9),
    onSurfaceVariant = Color(0xFF1A1F1B),
)

private val NormalTypography = Typography()

/** 关怀模式字阶：正文 ≥ 18sp、行高放大，标题层级同步放大。 */
private val CareTypography = Typography(
    headlineMedium = TextStyle(fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold),
    headlineSmall = TextStyle(fontSize = 28.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 26.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 22.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 20.sp, lineHeight = 30.sp),
    bodyMedium = TextStyle(fontSize = 18.sp, lineHeight = 27.sp),
    bodySmall = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    labelLarge = TextStyle(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp),
)

/** 当前是否关怀模式（组件据此放大点击区 ≥56dp 等）。 */
val LocalCareMode = compositionLocalOf { false }

@Composable
fun MedOnTimeTheme(careMode: Boolean, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalCareMode provides careMode) {
        MaterialTheme(
            colorScheme = if (careMode) CareColors else NormalColors,
            typography = if (careMode) CareTypography else NormalTypography,
            content = content,
        )
    }
}
