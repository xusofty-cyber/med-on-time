/**
 * 本地提醒调度：渲染层登录后同步当日时间线，主进程以定时器到点发系统通知。
 *
 * 口径：
 * - 幂等：同一 reminder_instance 只通知一次（fired 集合去重），与后端提醒幂等键互为补充。
 * - 追赶：同步/启动时已过点但在宽限窗（15 分钟）内的条目补发一次；更久的视为过期不打扰。
 * - 隐私：showDrugDetail=false（默认）时通知正文不出现药名/剂量；
 *   日志只记条数与实例 id，严禁用药明细落日志（AGENTS.md 日志脱敏红线）。
 */
import { Notification } from 'electron';
import type { DesktopReminderItem, ReminderSummary, SyncRemindersPayload } from './types';

const TICK_MS = 15_000;
const GRACE_MS = 15 * 60_000;
const STALE_MS = 2 * 60 * 60_000;
const MAX_ITEMS = 500;

interface ScheduledItem extends DesktopReminderItem {
  at: number;
}

function sanitizeString(v: unknown, maxLen = 120): string | undefined {
  return typeof v === 'string' ? v.slice(0, maxLen) : undefined;
}

function sanitizeItem(v: unknown): DesktopReminderItem | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o['id'] !== 'string' ||
    o['id'].length === 0 ||
    o['id'].length > 64 ||
    typeof o['scheduledAtUtc'] !== 'string' ||
    Number.isNaN(Date.parse(o['scheduledAtUtc']))
  ) {
    return null;
  }
  const rawDose = o['doseAmount'];
  const doseAmount =
    typeof rawDose === 'number' && Number.isFinite(rawDose)
      ? rawDose
      : typeof rawDose === 'string'
        ? rawDose.slice(0, 32)
        : undefined;
  return {
    id: o['id'],
    scheduledAtUtc: o['scheduledAtUtc'],
    drugNameSnapshot: sanitizeString(o['drugNameSnapshot'], 120),
    doseAmount,
    doseUnit: sanitizeString(o['doseUnit'], 32),
    storageLocation: o['storageLocation'] === null ? null : sanitizeString(o['storageLocation'], 120),
    memberDisplayName: sanitizeString(o['memberDisplayName'], 64),
  };
}

/** 校验渲染层载荷；非法条目逐条丢弃并计数，不整批失败。 */
export function sanitizePayload(payload: unknown): SyncRemindersPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const o = payload as Record<string, unknown>;
  if (!Array.isArray(o['items'])) return null;
  const items: DesktopReminderItem[] = [];
  for (const raw of o['items']) {
    const clean = sanitizeItem(raw);
    if (clean) {
      items.push(clean);
      if (items.length >= MAX_ITEMS) break;
    }
  }
  return {
    localDate: typeof o['localDate'] === 'string' ? o['localDate'].slice(0, 32) : '',
    showDrugDetail: o['showDrugDetail'] === true,
    items,
  };
}

export class ReminderScheduler {
  private items: ScheduledItem[] = [];
  private fired = new Set<string>();
  private showDrugDetail = false;
  private synced = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onActivate: (instanceId: string) => void,
    private readonly onSummaryChanged: () => void,
  ) {}

  sync(payload: SyncRemindersPayload): number {
    const now = Date.now();
    this.showDrugDetail = payload.showDrugDetail;
    this.items = payload.items
      .map((i) => ({ ...i, at: Date.parse(i.scheduledAtUtc) }))
      .filter((i) => now - i.at < STALE_MS)
      .sort((a, b) => a.at - b.at);
    this.synced = true;
    console.info(`[desktop] reminders synced: ${this.items.length} item(s), detail=${this.showDrugDetail}`);
    this.ensureTimer();
    this.tick();
    this.onSummaryChanged();
    return this.items.length;
  }

  clear(): void {
    this.items = [];
    this.fired.clear();
    this.synced = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onSummaryChanged();
  }

  summary(): ReminderSummary {
    const now = Date.now();
    const upcoming = this.items.filter((i) => !this.fired.has(i.id) && i.at + GRACE_MS > now);
    const next = upcoming.find((i) => i.at >= now - GRACE_MS);
    return {
      synced: this.synced,
      total: this.items.length,
      remaining: upcoming.length,
      nextAt: next ? new Date(next.at).toISOString() : null,
      nextLocalTime: next
        ? new Date(next.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : null,
    };
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const now = Date.now();
    for (const item of this.items) {
      if (this.fired.has(item.id)) continue;
      if (item.at <= now && now - item.at <= GRACE_MS) {
        this.fired.add(item.id);
        this.fire(item);
      }
    }
    // 顺带清理已彻底过期的条目，托盘概览随之刷新
    const before = this.items.length;
    this.items = this.items.filter((i) => now - i.at < STALE_MS);
    if (this.items.length !== before) this.onSummaryChanged();
  }

  private fire(item: ScheduledItem): void {
    if (!Notification.isSupported()) {
      console.warn(`[desktop] notification unsupported, skipped instance=${item.id}`);
      return;
    }
    const detail =
      this.showDrugDetail && item.drugNameSnapshot
        ? `${item.drugNameSnapshot}${item.doseAmount != null ? ` ${item.doseAmount}${item.doseUnit ?? ''}` : ''}${
            item.storageLocation ? `（存放在${item.storageLocation}）` : ''
          }`
        : '现在有一剂药需要服用，打开药准时查看详情。';
    const n = new Notification({
      title: '药准时 · 服药提醒',
      body: item.memberDisplayName ? `${item.memberDisplayName}：${detail}` : detail,
      silent: false,
    });
    n.on('click', () => this.onActivate(item.id));
    n.show();
    console.info(`[desktop] notification fired instance=${item.id}`);
    this.onSummaryChanged();
  }
}
