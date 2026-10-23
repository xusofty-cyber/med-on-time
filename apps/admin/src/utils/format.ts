import dayjs from 'dayjs';

/** 时间统一以 ISO 8601 UTC 存储，后台按本地时区（Asia/Shanghai）渲染 */
export function fmtDateTime(value?: string | null): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

export function fmtDateTimeFull(value?: string | null): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : value;
}

export function fmtDate(value?: string | null): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : value;
}

/** UUID 等长 ID 的短显（列表列宽有限时用，title 里给全量） */
export function shortId(value?: string | null): string {
  if (!value) return '-';
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

/** JSON 值的安全美化输出（裁决前后值 / 审计 detail / 用法用量） */
export function prettyJson(value: unknown): string {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 0~1 比率转百分比文案 */
export function fmtRate(rate?: number | null): string {
  if (rate === undefined || rate === null || Number.isNaN(rate)) return '-';
  return `${(rate * 100).toFixed(1)}%`;
}
