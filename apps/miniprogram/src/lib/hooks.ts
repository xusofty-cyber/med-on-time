/** 页面级小钩子：会话守卫（与 Web 端 App 路由守卫同语义）。 */
import { useEffect } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { tokenStore } from './api';
import { bootstrap, useApp } from './store';

export const LOGIN_PAGE = '/pages/login/index';
export const HOME_TAB = '/pages/index/index';
const PENDING_SCAN_TICKET_KEY = 'mot.pendingScanTicket';

export function setPendingScanTicket(ticket: string) {
  try {
    Taro.setStorageSync(PENDING_SCAN_TICKET_KEY, ticket);
  } catch {
    /* 存储失败不阻塞 */
  }
}

export function consumePendingScanTicket(): string | null {
  try {
    const v = Taro.getStorageSync(PENDING_SCAN_TICKET_KEY);
    if (typeof v === 'string' && v !== '') {
      Taro.removeStorageSync(PENDING_SCAN_TICKET_KEY);
      return v;
    }
  } catch {
    /* 同上 */
  }
  return null;
}

/** 登录/注册完成后跳转：若存在扫码登录页暂存的待确认票据则回跳扫码确认页，否则进首页 tab。 */
export function navigateAfterAuth() {
  const pendingTicket = consumePendingScanTicket();
  if (pendingTicket) {
    Taro.redirectTo({ url: `/pages/scan-login/index?t=${encodeURIComponent(pendingTicket)}` });
    return;
  }
  Taro.switchTab({ url: HOME_TAB });
}

/**
 * 登录守卫：启动恢复完成后仍无账号且无有效 token → 回登录页；
 * 若存在本地 token 但首次冷启动因弱网未拉取到 account，页面激活时自动重试 bootstrap。
 * 用于四个 tab 页与各功能子页（登录/注册页不使用本钩子）。
 */
export function useSessionGuard() {
  const booted = useApp((s) => s.booted);
  const account = useApp((s) => s.account);

  const check = () => {
    if (!booted) return;
    if (!account) {
      if (tokenStore.access) {
        void bootstrap();
        return;
      }
      Taro.reLaunch({ url: LOGIN_PAGE });
    }
  };
  useDidShow(check);
  useEffect(check, [booted, account]); // eslint-disable-line react-hooks/exhaustive-deps

  return { booted, account };
}
