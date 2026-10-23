import { request, type PageData } from '../services/request';
import type {
  AccountDetail,
  AccountItem,
  AdminLoginResult,
  AppVersionItem,
  AppVersionPayload,
  ArticleItem,
  ArticleUpsertPayload,
  AuditLogItem,
  ConsentItem,
  ConsentUpsertPayload,
  DashboardData,
  DisputeItem,
  DrugItem,
  ImportSeedResult,
  ListQuery,
  MemberItem,
  PlanHistoryItem,
  PlanItemRow,
  ResolveDisputePayload,
  ReviewDrugPayload,
} from './types';

/**
 * 后台接口层 —— 与 docs/dev/API_CONTRACT.md「后台接口」逐条对应（/api/admin 前缀，
 * request 封装统一加 /api）。页面只经本层调接口，不直接 fetch。
 */

/* ---------------- 鉴权 / 仪表盘 ---------------- */

export function adminLogin(username: string, password: string) {
  return request<AdminLoginResult>('/admin/auth/login', {
    method: 'POST',
    body: { username, password },
    silent: true,
  });
}

export function getDashboard() {
  return request<DashboardData>('/admin/dashboard');
}

/**
 * ProTable 搜索字段统一为 keyword，后端各列表 DTO 的关键字参数名为 q——
 * 在此单点映射（2026-10-23 巡检修复：此前 keyword 被后端白名单剥离，
 * 账号/药品等关键字搜索恒不生效）。
 */
function withQ(query: ListQuery): Record<string, string | number | boolean | null | undefined> {
  const { keyword, ...rest } = query as ListQuery & { keyword?: string };
  return keyword ? { ...rest, q: keyword } : { ...rest };
}

/* ---------------- 账号与成员 ---------------- */

export function listAccounts(query: ListQuery) {
  return request<PageData<AccountItem>>('/admin/accounts', { params: withQ(query) });
}

export function getAccount(id: string) {
  return request<AccountDetail>(`/admin/accounts/${id}`);
}

export function freezeAccount(id: string, reason?: string) {
  return request<{ id: string; status: string }>(`/admin/accounts/${id}/freeze`, {
    method: 'POST',
    body: { reason },
  });
}

export function unfreezeAccount(id: string) {
  return request<{ id: string; status: string }>(`/admin/accounts/${id}/unfreeze`, {
    method: 'POST',
    body: {},
  });
}

export function listMembers(query: ListQuery) {
  return request<PageData<MemberItem>>('/admin/members', { params: withQ(query) });
}

/* ---------------- 药品库 ---------------- */

export function listDrugs(query: ListQuery) {
  return request<PageData<DrugItem>>('/admin/drugs', { params: withQ(query) });
}

export function getDrug(id: string) {
  return request<DrugItem>(`/admin/drugs/${id}`);
}

export function reviewDrug(id: string, payload: ReviewDrugPayload) {
  return request<DrugItem>(`/admin/drugs/${id}/review`, { method: 'PATCH', body: payload });
}

/** 导入 services/api/prisma/seeds/drug_seed_200.json（pending 条目置未发布） */
export function importDrugSeed() {
  return request<ImportSeedResult>('/admin/drugs/import-seed', { method: 'POST', body: {} });
}

/* ---------------- 计划监管 ---------------- */

export function listPlans(query: ListQuery & { memberId: string }) {
  return request<PageData<PlanItemRow>>('/admin/plans', { params: query });
}

export function getPlanHistory(planId: string) {
  return request<PageData<PlanHistoryItem> | PlanHistoryItem[]>(`/admin/plans/${planId}/history`);
}

/* ---------------- 内容 ---------------- */

export function listArticles(query: ListQuery) {
  return request<PageData<ArticleItem>>('/admin/content/articles', { params: query });
}

export function createArticle(payload: ArticleUpsertPayload) {
  return request<ArticleItem>('/admin/content/articles', { method: 'POST', body: payload });
}

export function updateArticle(id: string, payload: ArticleUpsertPayload) {
  return request<ArticleItem>(`/admin/content/articles/${id}`, { method: 'PUT', body: payload });
}

export function deleteArticle(id: string) {
  return request<{ id: string }>(`/admin/content/articles/${id}`, { method: 'DELETE' });
}

export function listConsents(query: ListQuery) {
  return request<PageData<ConsentItem>>('/admin/content/consents', { params: query });
}

export function createConsent(payload: ConsentUpsertPayload) {
  return request<ConsentItem>('/admin/content/consents', { method: 'POST', body: payload });
}

export function updateConsent(id: string, payload: ConsentUpsertPayload) {
  return request<ConsentItem>(`/admin/content/consents/${id}`, { method: 'PUT', body: payload });
}

export function deleteConsent(id: string) {
  return request<{ id: string }>(`/admin/content/consents/${id}`, { method: 'DELETE' });
}

/* ---------------- 客服裁决 ---------------- */

export function listDisputes(query: ListQuery) {
  return request<PageData<DisputeItem>>('/admin/disputes', { params: query });
}

export function resolveDispute(id: string, payload: ResolveDisputePayload) {
  return request<DisputeItem>(`/admin/disputes/${id}/resolve`, { method: 'POST', body: payload });
}

/* ---------------- 审计 ---------------- */

export function listAuditLogs(query: ListQuery) {
  return request<PageData<AuditLogItem>>('/admin/audit-logs', { params: query });
}

/* ---------------- 系统：应用版本 ---------------- */

export function listAppVersions(query: ListQuery) {
  return request<PageData<AppVersionItem>>('/admin/app-versions', { params: query });
}

export function createAppVersion(payload: AppVersionPayload) {
  return request<AppVersionItem>('/admin/app-versions', { method: 'POST', body: payload });
}

export function updateAppVersion(id: string, payload: AppVersionPayload) {
  return request<AppVersionItem>(`/admin/app-versions/${id}`, { method: 'PUT', body: payload });
}

export function deleteAppVersion(id: string) {
  return request<{ id: string }>(`/admin/app-versions/${id}`, { method: 'DELETE' });
}
