/**
 * 桌面端 IPC 契约（主进程 / preload 共用）。
 *
 * 红线对齐：
 * - 通知内容是否包含药名由渲染层随同步载荷传入的 showDrugDetail 决定，
 *   该值取自成员 care-settings 的 lockScreenShowDrugDetail（默认 OFF，契约见
 *   docs/dev/API_CONTRACT.md / PUT /members/:memberId/care-settings）。
 * - 主进程日志严禁输出药名、剂量等用药明细，只记条数与实例 id。
 */

/** IPC 通道白名单：preload 只允许调用以下通道，主进程只注册以下通道。 */
export const IPC_CHANNELS = {
  syncReminders: 'desktop:sync-reminders',
  clearReminders: 'desktop:clear-reminders',
  reminderSummary: 'desktop:reminder-summary',
  getSettings: 'desktop:get-settings',
  setAutoLaunch: 'desktop:set-auto-launch',
  retryLoad: 'desktop:retry-load',
  /** 主 → 渲染事件：用户点击了某条提醒通知 */
  reminderActivated: 'desktop:reminder-activated',
} as const;

/** 渲染层同步给主进程的单条当日提醒（字段与 web 端 ReminderInstance 对齐后取最小集）。 */
export interface DesktopReminderItem {
  /** reminder_instance.id */
  id: string;
  /** ISO 8601 UTC 到点时刻（scheduledAtUtc） */
  scheduledAtUtc: string;
  /**
   * 实例状态（pending / reminded / snoozed / taken / skipped / missed / cancelled）。
   * 主进程据此过滤终态：已服/已跳过/已取消/已漏服的剂量绝不再到点通知（防重复服药，
   * 2026-10-30 全项目审查 DT-C1）；snoozed 时以 snoozeUntil 为实际触发时刻。
   * 旧版 web 载荷无此字段时主进程按 pending 兼容处理。
   */
  status?: string;
  /** snooze 后再次提醒的 ISO 8601 UTC 时刻（status=snoozed 时有效） */
  snoozeUntil?: string | null;
  /** 以下明细仅在 showDrugDetail=true 时用于通知正文 */
  drugNameSnapshot?: string;
  doseAmount?: number | string;
  doseUnit?: string;
  storageLocation?: string | null;
  memberDisplayName?: string;
  /**
   * 条目级隐私开关（多成员同步时逐成员带入各自的 lockScreenShowDrugDetail）：
   * 存在时优先于载荷级 showDrugDetail——某成员关了详情，其他成员开了，
   * 不能用一个全局开关互相污染（2026-10-30 审查 DT-H4）。
   */
  showDrugDetail?: boolean;
}

export interface SyncRemindersPayload {
  /** 成员本地日期 YYYY-MM-DD，仅作标识与日志条数核对 */
  localDate: string;
  /** = care-settings.lockScreenShowDrugDetail，默认 false */
  showDrugDetail: boolean;
  items: DesktopReminderItem[];
}

export interface ReminderSummary {
  /** 是否已收到过渲染层同步（未登录/未同步时为 false） */
  synced: boolean;
  total: number;
  /** 尚未触发且未过期的条数 */
  remaining: number;
  /** 下一次提醒时刻 ISO；无则为 null */
  nextAt: string | null;
  /** 下一次提醒的本地时刻 HH:mm（由主进程按本机时区格式化，仅时间不含药名） */
  nextLocalTime: string | null;
}

export interface DesktopSettings {
  autoLaunch: boolean;
  platform: NodeJS.Platform;
  version: string;
}

/** preload 暴露给渲染层的 window.medontimeDesktop 形状。 */
export interface MedOnTimeDesktopBridge {
  isDesktop: true;
  platform: NodeJS.Platform;
  /** 登录并拉到今日提醒后调用：把当日时间线同步给主进程做本地通知调度 */
  syncReminders: (payload: SyncRemindersPayload) => Promise<{ accepted: number }>;
  /** 登出 / 切换成员时调用：清空本地调度，避免串成员提醒 */
  clearReminders: () => Promise<void>;
  getReminderSummary: () => Promise<ReminderSummary>;
  getSettings: () => Promise<DesktopSettings>;
  setAutoLaunch: (enabled: boolean) => Promise<DesktopSettings>;
  /** 加载失败页的重试按钮 */
  retryLoad: () => Promise<void>;
  /** 订阅通知点击事件，返回取消订阅函数 */
  onReminderActivated: (cb: (instanceId: string) => void) => () => void;
}
