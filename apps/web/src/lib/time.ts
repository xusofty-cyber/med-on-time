/** 时间工具：后端 ISO 8601 UTC 存储，前端按成员时区渲染墙钟时间。 */

export function fmtTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(d);
}

export function fmtDateTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(d);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

/** 某时区下的今天 YYYY-MM-DD */
export function todayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date());
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** localTime 字段（HH:MM:SS 或 ISO）→ HH:MM */
export function wallTime(localTime: string): string {
  const m = localTime.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : localTime;
}

export function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}
