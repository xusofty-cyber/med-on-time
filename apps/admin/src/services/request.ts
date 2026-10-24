import { message } from 'antd';
import { clearSession, getAccessToken, getRefreshToken, updateTokens } from './session';

/**
 * 统一 request 封装（后台专用）。
 * - 基路径 /api（vite dev 代理到 services/api:3000），后台接口统一 /api/admin 前缀，
 *   本文件调用方传 '/admin/...' 路径。
 * - 响应信封 { code, message, traceId, data }：code=0 成功（后端 BusinessCode.OK），
 *   其余为业务错误，message 直接透出提示；错误体只有 { code, message, traceId }。
 * - token 注入 Authorization: Bearer；HTTP 401 / code=40100 时清会话并跳登录页。
 */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  traceId?: string;
  data: T;
}

/** 分页响应 data 口径（API_CONTRACT 通用约定） */
export interface PageData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class ApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;
  readonly traceId?: string;

  constructor(code: number, msg: string, httpStatus: number, traceId?: string) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.traceId = traceId;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** true 时不弹全局错误提示，由调用方处理（如登录页需要区分提示文案） */
  silent?: boolean;
}

const API_PREFIX = '/api';

let refreshInFlight: Promise<boolean> | null = null;
function tryRefreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_PREFIX}/admin/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const env = (await res.json()) as ApiEnvelope<{ accessToken: string; refreshToken?: string }>;
        if (!env || env.code !== 0 || !env.data?.accessToken) return false;
        updateTokens(env.data.accessToken, env.data.refreshToken);
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

function redirectToLogin(): void {
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const { method = 'GET', params, body, silent = false } = options;

  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        qs.set(key, String(value));
      }
    });
  }
  const url = `${API_PREFIX}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;

  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (!silent) message.error('网络异常，请检查网络连接后重试');
    throw new ApiError(-1, '网络异常', 0);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (response.status === 401 || envelope?.code === 40100) {
    if (retry && getRefreshToken()) {
      const refreshed = await tryRefreshTokens();
      if (refreshed) {
        return request<T>(path, options, false);
      }
    }
    if (!silent) message.error('登录已过期，请重新登录');
    redirectToLogin();
    throw new ApiError(40100, '登录已过期', 401, envelope?.traceId);
  }

  if (!response.ok || !envelope || envelope.code !== 0) {
    const msg = envelope?.message ?? `请求失败（HTTP ${response.status}）`;
    if (!silent) message.error(msg);
    throw new ApiError(envelope?.code ?? response.status * 100, msg, response.status, envelope?.traceId);
  }

  return envelope.data;
}

/**
 * ProTable request 适配：把 ProTable 的 { current, pageSize, ...搜索字段 }
 * 转成契约分页参数 { page, pageSize, ... }，返回 ProTable 期望的结果结构。
 */
export function toProTable<T>(
  load: (query: Record<string, string | number | boolean | undefined>) => Promise<PageData<T>>,
) {
  return async (
    params: Record<string, unknown>,
  ): Promise<{ data: T[]; total: number; success: boolean }> => {
    const { current, pageSize, ...rest } = params as {
      current?: number;
      pageSize?: number;
    } & Record<string, unknown>;
    const query: Record<string, string | number | boolean | undefined> = {};
    Object.entries(rest).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        query[key] = value;
      }
    });
    const data = await load({ ...query, page: current ?? 1, pageSize: pageSize ?? 20 });
    const items = Array.isArray(data) ? data : (data?.items ?? []);
    const total = Array.isArray(data) ? data.length : (data?.total ?? items.length);
    return { data: items, total, success: true };
  };
}

/** 有的列表接口（如变更史）可能直接返回数组而非分页信封，统一成数组读取 */
export function asList<T>(data: PageData<T> | T[] | null | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : (data.items ?? []);
}
