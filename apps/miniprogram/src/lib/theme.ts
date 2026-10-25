/** 界面主题（阶段 3）：两套主题切换，根节点 .theme-a 类驱动 app.scss 的 CSS 变量。
 * - 主题 0 现行绿白（默认）；主题 A 暖阳关怀（暖白底 #FFF9F2、主按钮 #0369A1、
 *   正文 17px、圆角 12px、卡片 24px 内边距 + 柔和阴影、触控 ≥48px）。
 *   取值来源：design-system/medontime/tokens.json + MASTER-A.md（推断级）。
 * - 主题 B（临床极简）只落 Admin + PC Web，移动端不做：选择项只列 0 与 A。
 * - 选择持久化到本地存储（键 medontime-theme，与 Web/Admin 端同键同值，
 *   不同存储后端）；关怀模式（.care-on，成员级设置）是独立维度，与主题并存。
 * - 宿主 chrome（导航栏 / TabBar）是静态配置，运行时用官方 API 跟随主题色；
 *   失败（非微信环境等）时静默忽略，不阻塞业务。
 */
import Taro from '@tarojs/taro';

export type MiniThemeId = '0' | 'a';

export const THEME_STORAGE_KEY = 'medontime-theme';

export const THEMES: { id: MiniThemeId; label: string; description: string }[] = [
  { id: '0', label: '现行绿白', description: '默认主题 · 绿白配色' },
  { id: 'a', label: '暖阳关怀', description: '暖白护眼底色 · 大字号与疏朗间距，适合长辈日常使用' },
];

/** 主按钮蓝（主题 A）与主绿（主题 0）：Switch 等原生组件 color 属性跟随主题。 */
export function themeSwitchColor(themeId: MiniThemeId): string {
  return themeId === 'a' ? '#0369A1' : '#0B6B4F';
}

export function getStoredThemeId(): MiniThemeId {
  try {
    const v = Taro.getStorageSync(THEME_STORAGE_KEY);
    if (v === '0' || v === 'a') return v;
  } catch {
    /* 存储不可用时回落默认主题 */
  }
  return '0';
}

/** 宿主 chrome 跟随主题：导航栏底 + TabBar 选中色；主题 B 不进移动端，无需处理。 */
export function applyThemeChrome(themeId: MiniThemeId): void {
  const primary = themeId === 'a' ? '#0369A1' : '#0B6B4F';
  const secondary = themeId === 'a' ? '#475569' : '#5B6660';
  try {
    void Taro.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: primary }).catch(() => undefined);
  } catch {
    /* 非微信环境等：忽略 */
  }
  try {
    void Taro.setTabBarStyle({ color: secondary, selectedColor: primary }).catch(() => undefined);
  } catch {
    /* 非 tab 页等：忽略 */
  }
}
