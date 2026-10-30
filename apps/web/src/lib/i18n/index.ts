/**
 * 轻量类型化 i18n 运行时（Web 端；选型见 docs/dev/I18N.md）：
 * - 词条以 zh-CN 为事实源，zh-TW/en 的类型被约束为同一键集合，漏译编译期报错；
 * - 当前语言保存在 localStorage（mot.locale），默认 zh-CN；store 持有同一状态驱动重渲染；
 * - tr() 供非组件代码（dict 标签、endpoints 外逻辑）命令式调用，useT() 供组件订阅。
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
  const saved = localStorage.getItem(LOCALE_KEY);
  return isLocale(saved) ? saved : 'zh-CN';
})();
document.documentElement.lang = current;

const listeners = new Set<() => void>();
export function getLocale(): Locale {
  return current;
}
export function setLocaleState(next: Locale): void {
  current = next;
  localStorage.setItem(LOCALE_KEY, next);
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
