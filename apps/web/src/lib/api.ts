/**
 * 统一请求封装：信封 {code, message, traceId, data} 解包、Bearer 注入、
 * 401 时用 refresh token 单飞刷新并重放一次，刷新失败则清会话回登录页。
 */
import type { ApiEnvelope } from './types';

const ACCESS_KEY = 'mot.accessToken';
const REFRESH_KEY = 'mot.refreshToken';
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export class ApiError extends Error {
  code: number;
  traceId?: string;
  httpStatus?: number;
  constructor(code: number, message: string, traceId?: string, httpStatus?: number) {
    super(message);
    this.code = code;
    this.traceId = traceId;
    this.httpStatus = httpStatus;
  }
}

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function rawFetch<T>(path: string, init: RequestInit, withAuth: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (withAuth && tokenStore.access) headers.set('Authorization', `Bearer ${tokenStore.access}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }
  if (!envelope) throw new ApiError(res.status, `请求失败（HTTP ${res.status}）`, undefined, res.status);
  if (envelope.code !== 0 && envelope.code !== 200) {
    throw new ApiError(envelope.code, envelope.message || '请求失败', envelope.traceId, res.status);
  }
  return envelope.data;
}

let refreshInFlight: Promise<boolean> | null = null;
function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = tokenStore.refresh;
      if (!refreshToken) return false;
      try {
        const data = await rawFetch<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          { method: 'POST', body: JSON.stringify({ refreshToken }) },
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

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  try {
    return await rawFetch<T>(path, init, true);
  } catch (err) {
    if (err instanceof ApiError && (err.httpStatus === 401 || err.code === 401)) {
      if (retry && tokenStore.refresh) {
        const ok = await refreshTokens();
        if (ok) return request<T>(path, init, false);
      }
      tokenStore.clear();
      onSessionExpired?.();
    }
    throw err;
  }
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
