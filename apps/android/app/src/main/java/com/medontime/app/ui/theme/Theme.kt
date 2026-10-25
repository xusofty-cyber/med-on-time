package com.medontime.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 界面主题（阶段 3，事实源：design-system/medontime/tokens.json + MASTER-A.md）。
 * - 主题 0 现行绿白（默认）：归并定稿值——页面底 #F4F8F6、正文 #101511、主绿 #0B6B4F、
 *   深绿 #084C38（归并 #084C37 / iOS #074F3A 换算漂移）、浅绿 #E6F4EF。
 * - 主题 A 暖阳关怀（推断级）：暖白底 #FFF9F2、主按钮 #0369A1、正文 17sp、圆角 12dp、
 *   卡片内边距 24dp + 柔和阴影、触控 ≥48dp。
 * - 主题 B（临床极简）只落 Admin + PC Web，移动端不做：本枚举只有 0 与 A。
 * - 关怀模式与主题是独立维度（关怀是密度/无障碍设置，不是主题）：
 *   关怀开启时配色与字阶沿用关怀模式（白底深绿、对比度 ≥7:1），主题只决定圆角与
 *   卡片内边距等形状值；两者叠加后的配色未裁决（MASTER-A §0），留待组件任务。
 */
enum class AppTheme(val id: String, val label: String, val description: String) {
    Standard("0", "现行绿白", "默认主题 · 绿白配色"),
    Warm("a", "暖阳关怀", "暖白护眼底色 · 大字号与疏朗间距，适合长辈日常使用");

    companion object {
        fun fromId(id: String): AppTheme = values().firstOrNull { it.id == id } ?: Standard
    }
}

/** 医嘱绿（UI 规范定版主色）。 */
val MedGreen = Color(0xFF0B6B4F)
private val MedGreenDark = Color(0xFF084C38)
private val InkBlack = Color(0xFF101511)

/** 主题 A 品牌蓝（推断级）：主按钮底 #0369A1（白字 5.93:1）；hover #075985、图标/大字蓝 #0284C7
 * （禁作小字与按钮底，D2）、次按钮 #0E7490、已服按钮 #047857 见 MASTER-A §1。 */
private val WarmPrimaryAction = Color(0xFF0369A1)
private val WarmSecondaryAction = Color(0xFF0E7490)

private val NormalColors = lightColorScheme(
    primary = MedGreen,
    onPrimary = Color.White,
    secondary = MedGreenDark,
    background = Color(0xFFF4F8F6),
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

/** 主题 A 配色（推断级）：暖白底、深 slate 正文、蓝系主按钮、绿系已服、红两级不变。 */
private val WarmColors = lightColorScheme(
    primary = WarmPrimaryAction,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD1FAE5),
    onPrimaryContainer = Color(0xFF065F46),
    secondary = WarmSecondaryAction,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFDF1E3),
    onSecondaryContainer = Color(0xFF0F172A),
    background = Color(0xFFFFF9F2),
    surface = Color.White,
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFFDF1E3),
    onSurfaceVariant = Color(0xFF475569),
    error = Color(0xFFDC2626),
    onError = Color.White,
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF991B1B),
    outline = Color(0xFF64748B),
    outlineVariant = Color(0xFFE8DCC8),
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

/** 主题 A 字阶（推断级）：正文 17sp、行高 1.6、标题 20sp。 */
private val WarmTypography = Typography(
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 17.sp, lineHeight = 27.sp),
    bodyMedium = TextStyle(fontSize = 17.sp, lineHeight = 27.sp),
    bodySmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
)

/** 主题 A 圆角（推断级）：小 8dp / 中 12dp / 大 12dp / 特大 16dp；主题 0 沿用 Material3 默认形状。 */
private val WarmShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

/** 当前是否关怀模式（组件据此放大点击区 ≥56dp 等）。 */
val LocalCareMode = compositionLocalOf { false }

/** 当前界面主题（组件据此取主题相关的尺寸，如今日提醒卡片内边距）。 */
val LocalAppTheme = compositionLocalOf { AppTheme.Standard }

@Composable
fun MedOnTimeTheme(
    theme: AppTheme = AppTheme.Standard,
    careMode: Boolean,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalCareMode provides careMode, LocalAppTheme provides theme) {
        MaterialTheme(
            colorScheme = when {
                careMode -> CareColors
                theme == AppTheme.Warm -> WarmColors
                else -> NormalColors
            },
            typography = when {
                careMode -> CareTypography
                theme == AppTheme.Warm -> WarmTypography
                else -> NormalTypography
            },
            shapes = if (theme == AppTheme.Warm) WarmShapes else Shapes(),
            content = content,
        )
    }
}
