/**
 * 极简 JSON 本地存储（userData 目录）：窗口状态 + 桌面设置。
 * 写入采用 tmp + rename 原子替换；解析失败一律回退默认值，绝不让坏文件挡住启动。
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DesktopReminderItem } from './types';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/** 已排程提醒的落盘快照（DT-H4）：主进程重启后靠它恢复调度，不依赖渲染层重同步。 */
export interface PersistedReminders {
  items: DesktopReminderItem[];
  fired: string[];
  showDrugDetail: boolean;
  savedAt: number;
}

export interface PersistedState {
  window: WindowState;
  settings: {
    autoLaunch: boolean;
  };
  reminders: PersistedReminders | null;
}

const DEFAULTS: PersistedState = {
  window: { width: 1100, height: 760, isMaximized: false },
  settings: { autoLaunch: false },
  reminders: null,
};

function storeFile(): string {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

export function loadState(): PersistedState {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      window: { ...DEFAULTS.window, ...(parsed.window ?? {}) },
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
      reminders:
        parsed.reminders && Array.isArray(parsed.reminders.items)
          ? parsed.reminders
          : null,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let current: PersistedState | null = null;
let saveTimer: NodeJS.Timeout | null = null;

export function getState(): PersistedState {
  if (!current) current = loadState();
  return current;
}

export function updateState(patch: (s: PersistedState) => void): void {
  const s = getState();
  patch(s);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushState, 250);
}

export function flushState(): void {
  if (!current) return;
  try {
    const file = storeFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    // 存储失败不阻断主流程（下次启动回退默认状态）
  }
}
