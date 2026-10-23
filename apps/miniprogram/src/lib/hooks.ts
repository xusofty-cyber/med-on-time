/** 页面级小钩子：会话守卫（与 Web 端 App 路由守卫同语义）。 */
import { useEffect } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { useApp } from './store';

export const LOGIN_PAGE = '/pages/login/index';
export const HOME_TAB = '/pages/index/index';

/**
 * 登录守卫：启动恢复完成后仍无账号 → 回登录页。
 * 用于四个 tab 页与各功能子页（登录/注册页不使用本钩子）。
 */
export function useSessionGuard() {
  const booted = useApp((s) => s.booted);
  const account = useApp((s) => s.account);

  const check = () => {
    if (booted && !account) {
      Taro.reLaunch({ url: LOGIN_PAGE });
    }
  };
  useDidShow(check);
  useEffect(check, [booted, account]); // eslint-disable-line react-hooks/exhaustive-deps

  return { booted, account };
}
