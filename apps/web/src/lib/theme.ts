/**
 * 界面主题（阶段 2）：三套主题切换，根节点 data-theme="0|a|b" 驱动
 * design-system/medontime/tokens.css 的 CSS 变量。
 * - 主题 0 现行绿白（默认）；主题 A 暖阳关怀；主题 B 临床极简。
 * - 选择持久化到 localStorage（键 medontime-theme），与 Admin 端同键同值。
 * - 关怀模式（html[data-care-mode]，成员级设置）是独立维度，与主题并存。
 */
export type ThemeId = '0' | 'a' | 'b';

export const THEME_STORAGE_KEY = 'medontime-theme';

export const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: '0', label: '现行绿白', description: '默认主题 · 绿白配色' },
  { id: 'a', label: '暖阳关怀', description: '暖白护眼底色 · 大字号与疏朗间距，适合长辈日常使用' },
  { id: 'b', label: '临床极简', description: '冷白底 · 直角 · 紧凑密度，适合电脑端数据查看' },
];

export function getStoredThemeId(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === '0' || v === 'a' || v === 'b') return v;
  } catch {
    /* localStorage 不可用时回落默认主题 */
  }
  return '0';
}

/** 把主题落到根节点并持久化；主题 0 也显式写 data-theme="0"，三套取值无残留。 */
export function applyThemeId(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* localStorage 不可用时仅本次生效 */
  }
}

/** 启动时在首屏渲染前应用已存主题，避免默认主题闪烁。 */
export function initTheme(): ThemeId {
  const id = getStoredThemeId();
  document.documentElement.dataset.theme = id;
  return id;
}
