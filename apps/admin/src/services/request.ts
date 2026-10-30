import { message } from 'antd';
import { clearSession, getAccessToken } from './session';
import { tr } from '../i18n';

/**
 * 统一 request 封装（后台专用）。
 * - 基路径 /api（vite dev 代理到 services/api:3000），后台接口统一 /api/admin 前缀，
 *   本文件调用方传 '/admin/...' 路径。
 * - 响应信封 { code, message, traceId, data }：code=0 成功（后端 BusinessCode.OK），
 *   其余为业务错误，message 直接透出提示；错误体只有 { code, message, traceId }。
 * - token 注入 Authorization: Bearer；HTTP 401 / code=40100 时清会话并跳登录页
 *   （authCall 鉴权调用除外：401 即凭证错误，保留后端原话，不刷新、不清会话、不跳登录）。
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
  /**
   * true 时按鉴权调用处理（如登录）：401 表示凭证错误而非会话过期，
   * 保留后端原话（如“用户名或密码不正确”），不尝试刷新、不清会话、不跳登录页。
   */
  authCall?: boolean;
}

const API_PREFIX = '/api';

function redirectToLogin(): void {
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, body, silent = false, authCall = false } = options;

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
    if (!silent) message.error(tr('req.network'));
    throw new ApiError(-1, tr('req.networkShort'), 0);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (response.status === 401 || envelope?.code === 40100) {
    if (authCall) {
      /* 鉴权调用（如登录）：401 就是凭证错误，后端 message 已是准确文案
       * （如“用户名或密码不正确”），直接透出；不要按会话过期处理——
       * 登录页本来就没有会话可过期，刷新/清会话/跳登录都是错的。
       * 2026-10-26 修复：此前这里无条件抛“登录已过期”，密码错也显示过期。 */
      throw new ApiError(
        envelope?.code ?? 40100,
        envelope?.message || tr('req.loginFailed'),
        401,
        envelope?.traceId,
      );
    }
    // 管理员侧无 refresh 机制：401 即会话结束，直接清会话跳登录（死刷新分支已删）
    if (!silent) message.error(tr('req.sessionExpired'));
    redirectToLogin();
    throw new ApiError(40100, tr('req.sessionExpiredShort'), 401, envelope?.traceId);
  }

  if (!response.ok || !envelope || envelope.code !== 0) {
    const msg = envelope?.message ?? tr('req.failedHttp', { status: response.status });
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
