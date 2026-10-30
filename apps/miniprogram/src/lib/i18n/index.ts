/**
 * 轻量类型化 i18n 运行时（小程序端；选型见 docs/dev/I18N.md，与 Web/Admin 同构）：
 * - 词条以 zh-CN 为事实源，zh-TW/en 的类型被约束为同一键集合，漏译编译期报错；
 * - 当前语言保存在 Taro storage（mot.locale），默认 zh-CN；
 * - tr() 供非组件代码（dict 标签等）命令式调用，useT() 供组件订阅；
 * - 导航栏标题经 useNavTitle 在页面显示时以当前语言重设（index.config.ts 仅为
 *   简体默认）；tabBar 文案由 app.tsx 订阅语言变化后 setTabBarItem 同步。
 */
import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import Taro from '@tarojs/taro';
import { zhCN, type I18nKey } from './zh-CN';
import { zhTW } from './zh-TW';
import { en } from './en';

export type Locale = 'zh-CN' | 'zh-TW' | 'en';
export type { I18nKey };
export const LOCALES: { value: Locale; labelKey: I18nKey }[] = [
  { value: 'zh-CN', labelKey: 'common.langZhCN' },
  { value: 'zh-TW', labelKey: 'common.langZhTW' },
  { value: 'en', labelKey: 'common.langEn' },
];

const LOCALE_KEY = 'mot.locale';
const DICTS: Record<Locale, Record<I18nKey, string>> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
};

function isLocale(v: unknown): v is Locale {
  return v === 'zh-CN' || v === 'zh-TW' || v === 'en';
}

let current: Locale = (() => {
  try {
    const saved = Taro.getStorageSync(LOCALE_KEY);
    return isLocale(saved) ? saved : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
})();

const listeners = new Set<() => void>();
export function getLocale(): Locale {
  return current;
}
export function setLocaleState(next: Locale): void {
  current = next;
  try {
    Taro.setStorageSync(LOCALE_KEY, next);
  } catch {
    /* 存储失败仅本次生效 */
  }
  listeners.forEach((fn) => fn());
}
export function subscribeLocale(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 命令式翻译：{name} 占位符插值；缺词条回退简体，再回退键名本身。 */
export function tr(key: I18nKey, params?: Record<string, string | number>): string {
  const raw = DICTS[current][key] ?? zhCN[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

/** 组件用：订阅语言变化并返回绑定当前语言的 t 函数。 */
export function useT(): (key: I18nKey, params?: Record<string, string | number>) => string {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return tr;
}

/** 页面用：显示时把导航栏标题设为当前语言文案（语言切换后回页即刷新）。 */
export function useNavTitle(key: I18nKey): void {
  const t = useT();
  useEffect(() => {
    Taro.setNavigationBarTitle({ title: t(key) }).catch(() => undefined);
  }, [t, key]);
}
