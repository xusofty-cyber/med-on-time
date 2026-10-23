/**
 * 统一请求封装（Taro.request 基封装，与 Web 端 api.ts 同口径）：
 * 信封 {code, message, traceId, data} 解包、Bearer 注入、
 * 401 时用 refresh token 单飞刷新并重放一次，刷新失败则清会话回登录页；
 * token 存 Taro storage（键名与 Web 端 localStorage 键保持一致）。
 */
import Taro from '@tarojs/taro';
import { API_BASE } from '../config';
import type { ApiEnvelope } from './types';

const ACCESS_KEY = 'mot.accessToken';
const REFRESH_KEY = 'mot.refreshToken';

export class ApiError extends Error {
  code: number;
  traceId?: string;
  constructor(code: number, message: string, traceId?: string) {
    super(message);
    this.code = code;
    this.traceId = traceId;
  }
}

function storageGet(key: string): string | null {
  try {
    const v = Taro.getStorageSync(key);
    return typeof v === 'string' && v !== '' ? v : null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get access(): string | null {
    return storageGet(ACCESS_KEY);
  },
  get refresh(): string | null {
    return storageGet(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    Taro.setStorageSync(ACCESS_KEY, access);
    Taro.setStorageSync(REFRESH_KEY, refresh);
  },
  clear() {
    Taro.removeStorageSync(ACCESS_KEY);
    Taro.removeStorageSync(REFRESH_KEY);
  },
};

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

function rawRequest<T>(path: string, method: Method, data: unknown, withAuth: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = {};
    if (data !== undefined) header['Content-Type'] = 'application/json';
    if (withAuth && tokenStore.access) header.Authorization = `Bearer ${tokenStore.access}`;
    Taro.request({
      url: `${API_BASE}${path}`,
      method,
      data: data as Taro.request.Option['data'],
      header,
      timeout: 15000,
      success: (res) => {
        const envelope = res.data as ApiEnvelope<T> | undefined;
        if (res.statusCode === 401) {
          reject(new ApiError(401, envelope?.message || '登录已过期', envelope?.traceId));
          return;
        }
        if (!envelope || typeof envelope.code !== 'number') {
          reject(new ApiError(res.statusCode, `请求失败（HTTP ${res.statusCode}）`));
          return;
        }
        if (envelope.code !== 0 && envelope.code !== 200) {
          reject(new ApiError(envelope.code, envelope.message || '请求失败', envelope.traceId));
          return;
        }
        resolve(envelope.data);
      },
      fail: () => reject(new ApiError(-1, '网络异常，请检查网络后重试')),
    });
  });
}

let refreshInFlight: Promise<boolean> | null = null;
function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = tokenStore.refresh;
      if (!refreshToken) return false;
      try {
        const data = await rawRequest<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          'POST',
          { refreshToken },
          false,
        );
        tokenStore.set(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function request<T>(path: string, method: Method, data?: unknown, retry = true): Promise<T> {
  try {
    return await rawRequest<T>(path, method, data, true);
  } catch (err) {
    if (err instanceof ApiError && err.code === 401 && retry && tokenStore.refresh) {
      const ok = await refreshTokens();
      if (ok) return request<T>(path, method, data, false);
      tokenStore.clear();
      onSessionExpired?.();
    }
    throw err;
  }
}

export const http = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  put: <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  del: <T>(path: string) => request<T>(path, 'DELETE'),
};

export function newClientRequestId(): string {
  return `mini-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 失败 toast（操作类失败统一走这里；列表加载失败由页面内联错误提示）。 */
export function toastError(err: unknown) {
  Taro.showToast({
    title: err instanceof Error ? err.message : '操作失败',
    icon: 'none',
    duration: 2600,
  });
}

export function toastOk(text: string) {
  Taro.showToast({ title: text, icon: 'success', duration: 1800 });
}

export function toastInfo(text: string) {
  Taro.showToast({ title: text, icon: 'none', duration: 2200 });
}
