/**
 * 本地提醒调度：渲染层登录后同步当日时间线，主进程以定时器到点发系统通知。
 *
 * 口径：
 * - 状态过滤：终态（taken/skipped/cancelled/missed）剂量永不通知，同步时即剔除并
 *   记入 fired 防旧载荷复活；snoozed 剂量以 snoozeUntil 为触发时刻（DT-C1 修复）。
 * - 幂等：同一 reminder_instance 只通知一次（fired 集合去重），与后端提醒幂等键互为补充。
 * - 追赶：同步/启动时已过点但在宽限窗（15 分钟）内的条目补发一次；更久的视为过期不打扰。
 * - 隐私：showDrugDetail=false（默认）时通知正文不出现药名/剂量；
 *   日志只记条数与实例 id，严禁用药明细落日志（AGENTS.md 日志脱敏红线）。
 */
import { Notification } from 'electron';
import { getState, updateState } from './store';
import type { DesktopReminderItem, ReminderSummary, SyncRemindersPayload } from './types';

const TICK_MS = 15_000;
const GRACE_MS = 15 * 60_000;
const STALE_MS = 2 * 60 * 60_000;
const MAX_ITEMS = 500;

/** 终态：这些状态的剂量绝不到点通知（已服再提醒会诱导重复服药）。 */
const TERMINAL_STATUSES = new Set(['taken', 'skipped', 'cancelled', 'missed']);
const KNOWN_STATUSES = new Set([
  'pending',
  'reminded',
  'snoozed',
  ...TERMINAL_STATUSES,
]);

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
  // 状态缺失/未知（旧版 web 载荷）按 pending 兼容；snoozeUntil 须可解析才保留。
  const status =
    typeof o['status'] === 'string' && KNOWN_STATUSES.has(o['status'])
      ? o['status']
      : 'pending';
  const snoozeUntil =
    typeof o['snoozeUntil'] === 'string' && !Number.isNaN(Date.parse(o['snoozeUntil']))
      ? o['snoozeUntil']
      : null;
  return {
    id: o['id'],
    scheduledAtUtc: o['scheduledAtUtc'],
    status,
    snoozeUntil,
    drugNameSnapshot: sanitizeString(o['drugNameSnapshot'], 120),
    doseAmount,
    doseUnit: sanitizeString(o['doseUnit'], 32),
    storageLocation: o['storageLocation'] === null ? null : sanitizeString(o['storageLocation'], 120),
    memberDisplayName: sanitizeString(o['memberDisplayName'], 64),
    showDrugDetail: typeof o['showDrugDetail'] === 'boolean' ? o['showDrugDetail'] : undefined,
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

  /** 原始条目 → 已排程条目：终态剔除并记 fired 防复活、snooze 取顺延时刻、过期丢弃。 */
  private buildScheduled(items: DesktopReminderItem[]): ScheduledItem[] {
    const now = Date.now();
    return items
      .map((i) => {
        if (i.status && TERMINAL_STATUSES.has(i.status)) {
          this.fired.add(i.id);
          return null;
        }
        const at =
          i.status === 'snoozed' && i.snoozeUntil
            ? Date.parse(i.snoozeUntil)
            : Date.parse(i.scheduledAtUtc);
        return { ...i, at };
      })
      .filter((i): i is ScheduledItem => i !== null)
      .filter((i) => now - i.at < STALE_MS)
      .sort((a, b) => a.at - b.at);
  }

  /** 落盘当前调度（同步/触发/清理后调用；updateState 内部 250ms 防抖合并写）。 */
  private persist(): void {
    const items = this.items.map((i) => {
      const { at: _at, ...rest } = i;
      return rest;
    });
    const fired = [...this.fired];
    const showDrugDetail = this.showDrugDetail;
    updateState((s) => {
      s.reminders = { items, fired, showDrugDetail, savedAt: Date.now() };
    });
  }

  sync(payload: SyncRemindersPayload): number {
    this.showDrugDetail = payload.showDrugDetail;
    this.items = this.buildScheduled(payload.items);
    this.synced = true;
    console.info(`[desktop] reminders synced: ${this.items.length} item(s), detail=${this.showDrugDetail}`);
    this.persist();
    this.ensureTimer();
    this.tick();
    this.onSummaryChanged();
    return this.items.length;
  }

  /**
   * 主进程启动恢复（DT-H4）：调度此前只活在内存里，桌面端重启/被系统杀掉后
   * 在渲染层下一次同步前（最长一个轮询周期）到点不响。现从落盘快照恢复：
   * 条目重新过 sanitize 与过期过滤，fired 一并恢复防重复通知。
   */
  restore(): void {
    const saved = getState().reminders;
    if (!saved) return;
    const clean = saved.items
      .map((raw) => sanitizeItem(raw))
      .filter((i): i is DesktopReminderItem => i !== null);
    this.fired = new Set(
      Array.isArray(saved.fired)
        ? saved.fired.filter((x): x is string => typeof x === 'string')
        : [],
    );
    this.showDrugDetail = saved.showDrugDetail === true;
    this.items = this.buildScheduled(clean);
    this.synced = true;
    console.info(`[desktop] reminders restored: ${this.items.length} item(s)`);
    this.ensureTimer();
    this.tick();
    this.onSummaryChanged();
  }

  clear(): void {
    this.items = [];
    this.fired.clear();
    this.synced = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    updateState((s) => {
      s.reminders = null;
    });
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
    let changed = false;
    for (const item of this.items) {
      if (this.fired.has(item.id)) continue;
      if (item.at <= now && now - item.at <= GRACE_MS) {
        this.fired.add(item.id);
        changed = true;
        this.fire(item);
      }
    }
    // 顺带清理已彻底过期的条目，托盘概览随之刷新
    const before = this.items.length;
    this.items = this.items.filter((i) => now - i.at < STALE_MS);
    if (this.items.length !== before) {
      changed = true;
      this.onSummaryChanged();
    }
    if (changed) this.persist();
  }

  private fire(item: ScheduledItem): void {
    if (!Notification.isSupported()) {
      console.warn(`[desktop] notification unsupported, skipped instance=${item.id}`);
      return;
    }
    // 条目级隐私开关优先于载荷级（多成员各自的关怀设置互不污染）
    const showDetail = item.showDrugDetail ?? this.showDrugDetail;
    const detail =
      showDetail && item.drugNameSnapshot
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
