// 预加载桥：只暴露 MedOnTimeDesktopBridge 白名单能力给渲染进程（apps/web），
// 不开放任何 Node / ipcRenderer 原生对象。通道名与主进程注册一一对应（types.ts）。
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './types';
import type { MedOnTimeDesktopBridge, SyncRemindersPayload } from './types';

const bridge: MedOnTimeDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  syncReminders: (payload: SyncRemindersPayload) => ipcRenderer.invoke(IPC_CHANNELS.syncReminders, payload),
  clearReminders: () => ipcRenderer.invoke(IPC_CHANNELS.clearReminders),
  getReminderSummary: () => ipcRenderer.invoke(IPC_CHANNELS.reminderSummary),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.setAutoLaunch, enabled === true),
  retryLoad: () => ipcRenderer.invoke(IPC_CHANNELS.retryLoad),
  onReminderActivated: (cb) => {
    const listener = (_e: unknown, instanceId: unknown) => {
      if (typeof instanceId === 'string') cb(instanceId);
    };
    ipcRenderer.on(IPC_CHANNELS.reminderActivated, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.reminderActivated, listener);
  },
};

contextBridge.exposeInMainWorld('medontimeDesktop', bridge);
