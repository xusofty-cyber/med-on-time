/**
 * 桌面端提醒桥（Electron preload 注入的 window.medontimeDesktop）。
 * 契约以 apps/desktop/src/types.ts 与 apps/desktop/README 接入示例为权威：
 * 本文件是 web 侧的同形声明（两包独立发布，不做跨包 import）。
 * 普通浏览器环境下桥不存在，全部调用静默跳过，页面行为不受影响；
 * 桥调用失败（IPC 异常等）只吞掉异常，绝不阻塞页面主流程。
 */

export interface DesktopReminderItem {
  id: string;
  scheduledAtUtc: string;
  /** 实例状态；桌面主进程据此过滤终态（已服/跳过/取消/漏服不再提醒）并处理 snooze 时刻 */
  status?: string;
  snoozeUntil?: string | null;
  drugNameSnapshot?: string;
  doseAmount?: number | string;
  doseUnit?: string;
  storageLocation?: string | null;
  memberDisplayName?: string;
}

export interface SyncRemindersPayload {
  localDate: string;
  /** = 当前成员 care-settings 的 lockScreenShowDrugDetail，默认 false */
  showDrugDetail: boolean;
  items: DesktopReminderItem[];
}

export interface MedOnTimeDesktopBridge {
  isDesktop: true;
  platform: string;
  syncReminders: (payload: SyncRemindersPayload) => Promise<{ accepted: number }>;
  clearReminders: () => Promise<void>;
}

declare global {
  interface Window {
    medontimeDesktop?: MedOnTimeDesktopBridge;
  }
}

export function desktopBridge(): MedOnTimeDesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.medontimeDesktop : undefined;
}

/** 同步今日提醒到桌面主进程调度；无桥时 no-op。 */
export function syncDesktopReminders(payload: SyncRemindersPayload): void {
  const bridge = desktopBridge();
  if (!bridge) return;
  void bridge.syncReminders(payload).catch(() => undefined);
}

/** 登出 / 切换成员时清空桌面调度，避免串成员提醒；无桥时 no-op。 */
export function clearDesktopReminders(): void {
  const bridge = desktopBridge();
  if (!bridge) return;
  void bridge.clearReminders().catch(() => undefined);
}
