/** 轻量全局状态（零依赖）：账号、成员列表、当前成员、关怀模式、未读数、Toast。 */
import { useSyncExternalStore } from 'react';
import type { Account, CareSettings, Member } from './types';
import { clearDesktopReminders } from './desktop';

export interface ToastMsg {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface AppState {
  account: Account | null;
  members: Member[];
  currentMemberId: string | null;
  careSettings: CareSettings | null;
  unreadCount: number;
  toasts: ToastMsg[];
}

const MEMBER_KEY = 'mot.currentMemberId';
const CARE_KEY = 'mot.careModeLocal';

let state: AppState = {
  account: null,
  members: [],
  currentMemberId: localStorage.getItem(MEMBER_KEY),
  careSettings: null,
  unreadCount: 0,
  toasts: [],
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  emit();
}

export function getState(): AppState {
  return state;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}

export const actions = {
  setAccount(account: Account | null) {
    setState({ account });
  },
  setMembers(members: Member[]) {
    let current = state.currentMemberId;
    if (!current || !members.some((m) => m.id === current)) {
      current = members.find((m) => m.relationship === 'self')?.id ?? members[0]?.id ?? null;
      if (current) localStorage.setItem(MEMBER_KEY, current);
      else localStorage.removeItem(MEMBER_KEY);
    }
    setState({ members, currentMemberId: current });
  },
  setCurrentMember(memberId: string) {
    // 切换成员先清桌面调度，避免新成员数据加载完成前串发上一成员的提醒
    clearDesktopReminders();
    localStorage.setItem(MEMBER_KEY, memberId);
    setState({ currentMemberId: memberId, careSettings: null });
  },
  setCareSettings(settings: CareSettings | null) {
    if (settings) localStorage.setItem(CARE_KEY, settings.careMode ? 'on' : 'off');
    setState({ careSettings: settings });
    applyCareMode();
  },
  setUnreadCount(n: number) {
    setState({ unreadCount: n });
  },
  resetSession() {
    // 登出清桌面调度（桥不存在时自动跳过）
    clearDesktopReminders();
    localStorage.removeItem(MEMBER_KEY);
    setState({ account: null, members: [], currentMemberId: null, careSettings: null, unreadCount: 0 });
    applyCareMode();
  },
  toast(kind: ToastMsg['kind'], text: string) {
    const id = Date.now() + Math.random();
    setState({ toasts: [...state.toasts, { id, kind, text }] });
    setTimeout(() => {
      setState({ toasts: state.toasts.filter((t) => t.id !== id) });
    }, 3600);
  },
};

/** 关怀模式开关落到 html[data-care-mode]，由 index.css 的规则切换字号/对比度/点击区。 */
export function applyCareMode() {
  const on = state.careSettings
    ? state.careSettings.careMode
    : localStorage.getItem(CARE_KEY) === 'on';
  document.documentElement.dataset.careMode = on ? 'on' : 'off';
}

export function currentMember(): Member | null {
  return state.members.find((m) => m.id === state.currentMemberId) ?? null;
}
