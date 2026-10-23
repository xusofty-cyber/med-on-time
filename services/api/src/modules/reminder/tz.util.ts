/**
 * 时区工具（零依赖，基于 Intl）：提醒域一切「本地墙钟」计算收口于此。
 * 口径（需求定版）：提醒按成员本地时区生成与展示，库内同时存 UTC 时刻与
 * local_date / local_time / timezone 快照，后续成员改时区不影响已生成实例。
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** instant 在成员时区下的本地日期 YYYY-MM-DD */
export function localDateOf(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 日期串加减天数（纯日历运算，与时区无关） */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 两日期串相差天数（b - a） */
export function daysBetween(a: string, b: string): number {
  const ms = dateStrToUtcMs(b) - dateStrToUtcMs(a);
  return Math.round(ms / 86_400_000);
}

function dateStrToUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** 日期串的 ISO 星期（1=周一 … 7=周日） */
export function isoWeekday(dateStr: string): number {
  const dow = new Date(dateStrToUtcMs(dateStr)).getUTCDay(); // 0=周日
  return dow === 0 ? 7 : dow;
}

/** 某时区在给定时刻的 UTC 偏移（毫秒） */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** 成员本地日期 + 本地时刻（HH:mm[:ss]）→ UTC 时刻；DST 切换日做两轮校正 */
export function zonedTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const [y, mo, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const [h, mi, s] = timeStr.split(':').map((v) => parseInt(v, 10));
  const guess = Date.UTC(
    y ?? 1970,
    (mo ?? 1) - 1,
    d ?? 1,
    h ?? 0,
    mi ?? 0,
    s ?? 0,
  );
  const offset1 = tzOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset1;
  const offset2 = tzOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

/** @db.Date 读出值 → YYYY-MM-DD（按 UTC 分量，Prisma Date 列以 UTC 零点承载） */
export function dbDateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → @db.Date 写入值（UTC 零点） */
export function strToDbDate(dateStr: string): Date {
  return new Date(dateStrToUtcMs(dateStr));
}

/** HH:mm → @db.Time 写入值（1970-01-01 承载时刻分量） */
export function strToDbTime(timeStr: string): Date {
  const [h, mi] = timeStr.split(':').map((v) => parseInt(v, 10));
  return new Date(Date.UTC(1970, 0, 1, h ?? 0, mi ?? 0, 0));
}

/** @db.Time 读出值 → HH:mm */
export function dbTimeToStr(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/** HH:mm[:ss] 归一化为 HH:mm（生成幂等键与展示用） */
export function normalizeTimeStr(timeStr: string): string {
  const [h, mi] = timeStr.split(':');
  return `${pad2(parseInt(h ?? '0', 10))}:${pad2(parseInt(mi ?? '0', 10))}`;
}

export function isValidTimeStr(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);
}

export function isValidDateStr(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
