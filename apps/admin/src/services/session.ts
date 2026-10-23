import type { AdminProfile } from '../api/types';

/**
 * 后台管理员会话（localStorage）。
 * token 主体为 admin（与用户端 account 独立，见 API_CONTRACT 鉴权约定）；
 * 只存 token 与管理员基本信息，不存任何敏感业务数据。
 */
const ACCESS_KEY = 'mot.admin.accessToken';
const REFRESH_KEY = 'mot.admin.refreshToken';
const PROFILE_KEY = 'mot.admin.profile';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function getAdminProfile(): AdminProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}

export function saveSession(
  accessToken: string,
  refreshToken: string | undefined,
  profile: AdminProfile,
): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}
