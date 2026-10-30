/**
 * 轻量类型化 i18n 运行时（Admin 端；选型见 docs/dev/I18N.md，与 Web 端同构）：
 * - 词条以 zh-CN 为事实源，zh-TW/en 的类型被约束为同一键集合，漏译编译期报错；
 * - 当前语言保存在 localStorage（mot.locale，Admin 独立源单独存），默认 zh-CN；
 * - tr() 供非组件代码（labels 字典等）命令式调用，useT() 供组件订阅；
 * - antd 组件语言由 theme.tsx 的 ConfigProvider 按本状态下发官方 locale 包。
 */
import { useSyncExternalStore } from 'react';
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

function isLocale(v: string | null): v is Locale {
  return v === 'zh-CN' || v === 'zh-TW' || v === 'en';
}

let current: Locale = (() => {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    return isLocale(saved) ? saved : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
})();
document.documentElement.lang = current;

const listeners = new Set<() => void>();
export function getLocale(): Locale {
  return current;
}
export function setLocaleState(next: Locale): void {
  current = next;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    /* localStorage 不可用时仅本次生效 */
  }
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
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

/** 非组件订阅（theme.tsx 的 ConfigProvider 需要跟随语言重渲染）。 */
export function subscribeLocale(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
