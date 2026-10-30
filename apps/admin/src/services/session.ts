import type { AdminProfile } from '../api/types';

/**
 * 后台管理员会话（sessionStorage，第三批续收紧）：
 * 后端管理员侧只有 8 小时 access token、无 refresh 机制（AdminAuthController
 * 仅 login），故不存在可 cookie 化的 refresh；此前 token 存 localStorage
 * （浏览器重启仍在）且前端留有一套永远调不通的 refresh 死代码，本次一并处理：
 * - token 与管理员信息改存 sessionStorage：关标签页即失效，重启浏览器须重登；
 * - 旧版本遗留在 localStorage 的副本在保存/清除时顺手清除（迁移收尾）；
 * - 删除 getRefreshToken/updateTokens 等死接口（request.ts 已同步去掉刷新分支）。
 */
const ACCESS_KEY = 'mot.admin.accessToken';
const PROFILE_KEY = 'mot.admin.profile';

function purgeLegacy(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem('mot.admin.refreshToken');
  localStorage.removeItem(PROFILE_KEY);
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getAdminProfile(): AdminProfile | null {
  const raw = sessionStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}

export function saveSession(accessToken: string, profile: AdminProfile): void {
  purgeLegacy();
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearSession(): void {
  purgeLegacy();
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(PROFILE_KEY);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}
