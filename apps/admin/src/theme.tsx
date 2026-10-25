/**
 * Admin 界面主题（阶段 2）：三套主题切换。
 * - 主题 0 现行绿白（默认）；主题 A 暖阳关怀；主题 B 临床极简。
 * - 取值事实源：design-system/medontime/tokens.json（主题 0 为归并定稿值，
 *   主题 A/B 全部取值为推断级，不得与实测值混写）。
 * - AntD token 经 ConfigProvider 下发；ProLayout 的 header/sider token 另见
 *   ADMIN_THEMES[].proLayoutToken；登录页渐变见 loginGradient。
 * - 选择持久化到 localStorage（键 medontime-theme），与 Web 端同键同值；
 *   同时写 html[data-theme]，供 theme.css 的主题 B 表格覆盖规则使用。
 * - 有意识不做的决策：AntD Tag 预设色名（constants/labels.ts，31 处）不品牌化，
 *   按审计 §3.4 原样保留；Figtree/Inter 未随应用自托管（仓库无字体文件），
 *   三套主题正文字体暂同为系统字体栈。
 */
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeId = '0' | 'a' | 'b';

export const THEME_STORAGE_KEY = 'medontime-theme';

export const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: '0', label: '现行绿白', description: '默认主题' },
  { id: 'a', label: '暖阳关怀', description: '暖白护眼底色' },
  { id: 'b', label: '临床极简', description: '冷白底 · 直角 · 紧凑' },
];

/** 系统字体栈（tokens.json primitive.font.family.sans，已定义）。 */
const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

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

interface AdminThemeDef {
  /** 下发给 ConfigProvider 的 AntD token。 */
  config: ThemeConfig;
  /** 下发给 ProLayout 的 token（header/sider）。 */
  proLayoutToken: {
    header: { colorBgHeader: string };
    sider: { colorBgMenuItemSelected: string; colorTextMenuSelected: string };
  };
  /** 登录页背景渐变起止色（审计 §3.4：登录渐变不进公共 Token，此处仅跟随主题）。 */
  loginGradient: [string, string];
  /** 登录卡片阴影（跟随主题：0 沿用原值、A 单层柔和、B 无阴影）。 */
  loginCardShadow: string;
}

export const ADMIN_THEMES: Record<ThemeId, AdminThemeDef> = {
  '0': {
    config: {
      token: {
        colorPrimary: '#0B6B4F',
        colorLink: '#0B6B4F',
        colorSuccess: '#0B6B4F',
        /* 警示数值沿用 Admin 现有值 #D46B08；与 #F59E0B 的关系未裁决（审计 §3.2）。 */
        colorWarning: '#D46B08',
        /* 危险红两级定案：#CF1322 已并入 #DC2626（tokens.json decisions）。 */
        colorError: '#DC2626',
        /* colorInfo 不设：主题 0 沿用 AntD 默认，审计未定义 Admin 信息色。 */
        colorText: '#101511',
        colorTextSecondary: '#5B6660',
        colorTextTertiary: '#8C8C8C',
        colorBgBase: '#FFFFFF',
        colorBgLayout: '#F4F8F6',
        colorBgContainer: '#FFFFFF',
        colorBorder: '#D3DAD6',
        colorBorderSecondary: '#E3E8E5',
        /* 圆角/字号按 tokens.json：radius.md 12px、正文 16px。Admin 原为 AntD
         * 默认（6px/14px），此处为 token 化带来的外观变化，非功能变化。 */
        borderRadius: 12,
        fontSize: 16,
        fontFamily: SYSTEM_FONT,
        controlHeight: 32,
        /* 2026-10-25 修复：与 Web 端焦点环 3px 对齐（AntD 默认 2px）。 */
        controlOutlineWidth: 3,
      },
    },
    proLayoutToken: {
      header: { colorBgHeader: '#FFFFFF' },
      sider: { colorBgMenuItemSelected: '#E6F4EF', colorTextMenuSelected: '#084C38' },
    },
    loginGradient: ['#0B6B4F', '#084C38'],
    loginCardShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  a: {
    config: {
      token: {
        colorPrimary: '#0369A1',
        colorLink: '#0369A1',
        colorSuccess: '#047857',
        colorWarning: '#92400E',
        colorError: '#DC2626',
        colorInfo: '#0284C7',
        colorText: '#0F172A',
        colorTextSecondary: '#475569',
        colorTextTertiary: '#64748B',
        colorBgBase: '#FFFFFF',
        colorBgLayout: '#FFF9F2',
        colorBgContainer: '#FFFFFF',
        colorBorder: '#64748B',
        colorBorderSecondary: '#E8DCC8',
        borderRadius: 12,
        fontSize: 17,
        fontFamily: SYSTEM_FONT,
        /* 主题 A 触摸目标 ≥48px。 */
        controlHeight: 48,
        /* 2026-10-25 修复：与 Web 端焦点环 3px 对齐（AntD 默认 2px）。 */
        controlOutlineWidth: 3,
      },
    },
    proLayoutToken: {
      header: { colorBgHeader: '#FFFFFF' },
      sider: { colorBgMenuItemSelected: '#FDF1E3', colorTextMenuSelected: '#0369A1' },
    },
    loginGradient: ['#0369A1', '#075985'],
    loginCardShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
  },
  b: {
    config: {
      token: {
        colorPrimary: '#0369A1',
        colorLink: '#0369A1',
        colorSuccess: '#047857',
        colorWarning: '#92400E',
        colorError: '#DC2626',
        colorInfo: '#0284C7',
        colorText: '#0F172A',
        colorTextSecondary: '#475569',
        colorTextTertiary: '#64748B',
        colorBgBase: '#FFFFFF',
        colorBgLayout: '#F0F9FF',
        colorBgContainer: '#FFFFFF',
        colorBorder: '#64748B',
        colorBorderSecondary: '#CBD5E1',
        borderRadius: 0,
        fontSize: 16,
        fontFamily: SYSTEM_FONT,
        controlHeight: 32,
        /* 2026-10-25 修复：与 Web 端焦点环 3px 对齐（AntD 默认 2px）。 */
        controlOutlineWidth: 3,
      },
    },
    proLayoutToken: {
      header: { colorBgHeader: '#FFFFFF' },
      sider: { colorBgMenuItemSelected: '#F1F5F9', colorTextMenuSelected: '#0369A1' },
    },
    loginGradient: ['#0369A1', '#075985'],
    loginCardShadow: 'none',
  },
};

const ThemeContext = createContext<{ themeId: ThemeId; setThemeId: (id: ThemeId) => void }>({
  themeId: '0',
  setThemeId: () => undefined,
});

export function useAdminTheme(): { themeId: ThemeId; setThemeId: (id: ThemeId) => void } {
  return useContext(ThemeContext);
}

/** 主题 Provider：持有当前主题，切换时重下发 ConfigProvider token 并写根属性。 */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => getStoredThemeId());
  const setThemeId = (id: ThemeId) => {
    applyThemeId(id);
    setThemeIdState(id);
  };
  useEffect(() => {
    applyThemeId(themeId);
  }, [themeId]);
  const config = useMemo(() => ADMIN_THEMES[themeId].config, [themeId]);
  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      <ConfigProvider locale={zhCN} theme={config}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
