/** 轻量全局状态（零依赖，与 Web 端 store 同结构）：账号、成员列表、当前成员、关怀模式、未读数。 */
import { useSyncExternalStore } from 'react';
import Taro from '@tarojs/taro';
import type { Account, CareSettings, Member } from './types';
import { ApiError, tokenStore } from './api';
import { authApi, memberApi } from './endpoints';
import { applyThemeChrome, getStoredThemeId, THEME_STORAGE_KEY, type MiniThemeId } from './theme';

interface AppState {
  booted: boolean;
  account: Account | null;
  members: Member[];
  currentMemberId: string | null;
  careSettings: CareSettings | null;
  unreadCount: number;
  /** 界面主题 id：'0' 现行绿白（默认）/ 'a' 暖阳关怀；主题 B 不进移动端。 */
  themeId: MiniThemeId;
}

const MEMBER_KEY = 'mot.currentMemberId';
const CARE_KEY = 'mot.careModeLocal';

function storageGet(key: string): string | null {
  try {
    const v = Taro.getStorageSync(key);
    return typeof v === 'string' && v !== '' ? v : null;
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string) {
  try {
    Taro.setStorageSync(key, value);
  } catch {
    /* 存储失败不阻塞业务 */
  }
}
function storageRemove(key: string) {
  try {
    Taro.removeStorageSync(key);
  } catch {
    /* 同上 */
  }
}

let state: AppState = {
  booted: false,
  account: null,
  members: [],
  currentMemberId: storageGet(MEMBER_KEY),
  careSettings: null,
  unreadCount: 0,
  themeId: getStoredThemeId(),
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

/** 关怀模式当前是否生效（成员级设置优先，未装载时回退本地记忆，与 Web 端口径一致）。 */
export function careModeOn(): boolean {
  return state.careSettings ? state.careSettings.careMode : storageGet(CARE_KEY) === 'on';
}

async function loadCareSettings(memberId: string) {
  try {
    const s = await memberApi.getCareSettings(memberId);
    if (state.currentMemberId === memberId) actions.setCareSettings(s);
  } catch {
    if (state.currentMemberId === memberId) actions.setCareSettings(null);
  }
}

export const actions = {
  setAccount(account: Account | null) {
    setState({ account });
  },
  setMembers(members: Member[]) {
    let current = state.currentMemberId;
    if (!current || !members.some((m) => m.id === current)) {
      current = members.find((m) => m.relationship === 'self')?.id ?? members[0]?.id ?? null;
      if (current) storageSet(MEMBER_KEY, current);
      else storageRemove(MEMBER_KEY);
    }
    setState({ members, currentMemberId: current });
    if (current) void loadCareSettings(current);
  },
  setCurrentMember(memberId: string) {
    storageSet(MEMBER_KEY, memberId);
    setState({ currentMemberId: memberId, careSettings: null });
    void loadCareSettings(memberId);
  },
  setCareSettings(settings: CareSettings | null) {
    if (settings) storageSet(CARE_KEY, settings.careMode ? 'on' : 'off');
    setState({ careSettings: settings });
  },
  setUnreadCount(n: number) {
    setState({ unreadCount: n });
  },
  /** 切换界面主题：持久化 + 宿主 chrome 跟随；根节点 .theme-a 类由 app.tsx 按 themeId 挂载。 */
  setThemeId(themeId: MiniThemeId) {
    storageSet(THEME_STORAGE_KEY, themeId);
    setState({ themeId });
    applyThemeChrome(themeId);
  },
  resetSession() {
    bootPromise = null;
    storageRemove(MEMBER_KEY);
    setState({ account: null, members: [], currentMemberId: null, careSettings: null, unreadCount: 0 });
  },
};

/** 启动恢复会话（app useLaunch 调用一次）：有 token 则拉账号与成员，仅 401 鉴权失败清会话，弱网瞬时错误保留登录态并允许重试。 */
let bootPromise: Promise<void> | null = null;
export function bootstrap(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      if (tokenStore.access) {
        try {
          const me = await authApi.me();
          actions.setAccount(me);
          try {
            actions.setMembers(await memberApi.list());
          } catch {
            /* 成员列表拉取失败保留已验证的 account 登录态，进入页面后可刷新重试 */
          }
        } catch (err) {
          if (err instanceof ApiError && err.code === 401) {
            tokenStore.clear();
            actions.resetSession();
          } else {
            bootPromise = null;
          }
        }
      }
      setState({ booted: true });
      /* 启动即按已存主题刷宿主 chrome（导航栏/TabBar），页面样式由 app.tsx 的 .theme-a 类驱动。 */
      applyThemeChrome(state.themeId);
    })();
  }
  return bootPromise;
}

export function currentMember(): Member | null {
  return state.members.find((m) => m.id === state.currentMemberId) ?? null;
}
