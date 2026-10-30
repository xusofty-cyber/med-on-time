/**
 * 统一请求封装：信封 {code, message, traceId, data} 解包、Bearer 注入、
 * 401 时单飞刷新并重放一次，刷新失败则清会话回登录页。
 *
 * 令牌存储（第三批续·cookie 改造）：
 * - access token 只驻内存（页面刷新后靠静默刷新恢复会话）；
 * - refresh token 在浏览器环境走后端 httpOnly cookie（mot_refresh），JS 不持有、
 *   不落 localStorage；刷新请求带 X-Mot-Client: web 头走 cookie 模式；
 * - 桌面壳（Electron）无站点 cookie 语义，维持 body 模式：refresh 存本地
 *   localStorage（应用私有存储），access 同样只驻内存；
 * - 旧版本遗留在 localStorage 的 refresh 只用于一次迁移刷新，随后清除。
 */
import type { ApiEnvelope } from './types';
import { desktopBridge } from './desktop';

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

let memoryAccess: string | null = null;

export const tokenStore = {
  get access(): string | null {
    return memoryAccess;
  },
  /** 仅桌面壳（body 模式）能读到 refresh；浏览器环境恒为 null（走 cookie）。 */
  get refresh(): string | null {
    return desktopBridge() ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(access: string, refresh: string) {
    memoryAccess = access;
    if (desktopBridge()) {
      localStorage.setItem(REFRESH_KEY, refresh);
    } else {
      // 浏览器：refresh 只进后端 cookie；清掉本地残留（含旧版本 access）
      localStorage.removeItem(REFRESH_KEY);
    }
    localStorage.removeItem(ACCESS_KEY);
  },
  /** cookie/桌面刷新成功后只更新内存中的 access。 */
  setAccess(access: string) {
    memoryAccess = access;
  },
  clear() {
    memoryAccess = null;
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
  if (envelope.code !== 0) {
    throw new ApiError(envelope.code, envelope.message || '请求失败', envelope.traceId, res.status);
  }
  return envelope.data;
}

let refreshInFlight: Promise<boolean> | null = null;
function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // body 模式：桌面壳的本地 refresh，或浏览器里旧版本遗留的一次性迁移 refresh
        const bodyToken =
          tokenStore.refresh ??
          (!desktopBridge() ? localStorage.getItem(REFRESH_KEY) : null);
        if (bodyToken) {
          const data = await rawFetch<{ accessToken: string; refreshToken: string }>(
            '/auth/refresh',
            { method: 'POST', body: JSON.stringify({ refreshToken: bodyToken }) },
            false,
          );
          // 桌面壳轮换后回存新 refresh；浏览器迁移路径在 set() 内清掉遗留副本，
          // 后续改走 cookie（本次刷新响应已由后端下发 httpOnly cookie）
          tokenStore.set(data.accessToken, data.refreshToken);
          return true;
        }
        // cookie 模式（浏览器）：refresh 在 httpOnly cookie 里，带客户端标识头过 CSRF 门槛
        const data = await rawFetch<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          {
            method: 'POST',
            headers: { 'X-Mot-Client': 'web' },
            body: JSON.stringify({}),
          },
          false,
        );
        tokenStore.setAccess(data.accessToken);
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

/** 启动静默恢复会话：内存无 access 时尝试刷新一次（cookie/桌面/迁移三路径）。 */
export function ensureSession(): Promise<boolean> {
  if (memoryAccess) return Promise.resolve(true);
  return refreshTokens();
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  try {
    return await rawFetch<T>(path, init, true);
  } catch (err) {
    if (err instanceof ApiError && (err.httpStatus === 401 || err.code === 40100)) {
      // 是否可刷新由 refreshTokens 内部判定（桌面 body / 浏览器 cookie / 遗留迁移）
      if (retry) {
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
