/** 用户端接口调用层 —— 路径逐条对应 docs/dev/API_CONTRACT.md「用户端接口」，与 Web 端 endpoints.ts 同口径。 */
import { http, newClientRequestId } from './api';
import type {
  Account,
  AdherenceCalendarDay,
  AdherenceSummary,
  Allergy,
  AdverseRecord,
  AuthResult,
  Authorization,
  CareSettings,
  Drug,
  DrugInteractions,
  EmergencyContact,
  MedicalRecordEntry,
  Member,
  NotificationItem,
  NotificationPrefs,
  PageResult,
  Plan,
  PlanChangeHistoryEntry,
  PlanPayload,
  ReminderInstance,
  StockAdjustPayload,
  StockItem,
  UserSession,
} from './types';

const qs = (params: Record<string, string | number | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const authApi = {
  sendSmsCode: (phone: string, scene: 'register' | 'login' | 'reset') =>
    http.post<{ sent: boolean }>('/auth/sms/send', { phone, scene }),
  register: (body: { phone: string; password: string; code: string; nickname?: string }) =>
    http.post<AuthResult>('/auth/register', body),
  login: (body: { phone: string; password: string }) => http.post<AuthResult>('/auth/login', body),
  loginByCode: (body: { phone: string; code: string }) => http.post<AuthResult>('/auth/login/code', body),
  resetPassword: (body: { phone: string; code: string; newPassword: string }) =>
    http.post<{ ok: boolean }>('/auth/password/reset', body),
  logout: () => http.post<{ ok: boolean }>('/auth/logout'),
  me: () => http.get<Account>('/auth/me'),
  bindWechat: () => http.post<{ ok: boolean; message?: string }>('/auth/bind/wechat', {}),
};

export const accountApi = {
  profile: () => http.get<Account>('/account/profile'),
  updateProfile: (body: { nickname?: string; timezone?: string }) => http.patch<Account>('/account/profile', body),
  cancel: (reason?: string) => http.post<{ ok: boolean; cancelApplyAt?: string }>('/account/cancel', { reason }),
  sessions: () => http.get<UserSession[]>('/account/sessions'),
  revokeSession: (id: string) => http.del<{ ok: boolean }>(`/account/sessions/${id}`),
};

export const memberApi = {
  list: () => http.get<Member[]>('/members'),
  create: (body: {
    displayName: string;
    relationship: string;
    gender?: string;
    birthDate?: string;
    timezone?: string;
  }) => http.post<Member>('/members', body),
  update: (memberId: string, body: Partial<Member>) => http.patch<Member>(`/members/${memberId}`, body),
  remove: (memberId: string) => http.del<{ ok: boolean }>(`/members/${memberId}`),
  getCareSettings: (memberId: string) => http.get<CareSettings>(`/members/${memberId}/care-settings`),
  putCareSettings: (memberId: string, body: CareSettings) =>
    http.put<CareSettings>(`/members/${memberId}/care-settings`, body),
};

export const authorizationApi = {
  list: () => http.get<Authorization[]>('/authorizations'),
  create: (body: {
    memberId: string;
    caregiverPhone: string;
    level: string;
    expiresAt?: string | null;
  }) => http.post<Authorization>('/authorizations', body),
  accept: (id: string) => http.post<Authorization>(`/authorizations/${id}/accept`),
  reject: (id: string) => http.post<Authorization>(`/authorizations/${id}/reject`),
  revoke: (id: string) => http.post<Authorization>(`/authorizations/${id}/revoke`),
};

export const drugApi = {
  search: (q: string, page = 1) => http.get<PageResult<Drug>>(`/drugs/search${qs({ q, page, pageSize: 20 })}`),
  detail: (id: string) => http.get<Drug>(`/drugs/${id}`),
  interactions: (id: string) => http.get<DrugInteractions>(`/drugs/${id}/interactions`),
  createCustom: (memberId: string, body: Partial<Drug> & { genericName: string; specification: string; unit: string; dosageForm: string }) =>
    http.post<Drug>(`/members/${memberId}/drugs/custom`, body),
};

export const planApi = {
  list: (memberId: string) => http.get<Plan[]>(`/members/${memberId}/plans`),
  create: (memberId: string, body: PlanPayload) => http.post<Plan>(`/members/${memberId}/plans`, body),
  update: (planId: string, body: Partial<PlanPayload>) => http.patch<Plan>(`/plans/${planId}`, body),
  remove: (planId: string) => http.del<{ ok: boolean }>(`/plans/${planId}`),
  history: (planId: string) => http.get<PlanChangeHistoryEntry[]>(`/plans/${planId}/history`),
  pause: (planId: string) => http.post<Plan>(`/plans/${planId}/pause`),
  resume: (planId: string) => http.post<Plan>(`/plans/${planId}/resume`),
};

export const reminderApi = {
  today: (memberId: string) => http.get<ReminderInstance[]>(`/members/${memberId}/reminders/today`),
  byDate: (memberId: string, date: string) =>
    http.get<ReminderInstance[]>(`/members/${memberId}/reminders${qs({ date })}`),
  snooze: (instanceId: string) => http.post<ReminderInstance>(`/reminders/${instanceId}/snooze`, {}),
  skip: (instanceId: string, reason?: string) =>
    http.post<ReminderInstance>(`/reminders/${instanceId}/skip`, { reason }),
  checkin: (instanceId: string) =>
    http.post<{ ok: boolean }>(`/reminders/${instanceId}/checkin`, {
      action: 'taken',
      takenAt: new Date().toISOString(),
      confirmationMethod: 'tap',
      clientRequestId: newClientRequestId(),
    }),
  checkins: (memberId: string, from: string, to: string) =>
    http.get<unknown[]>(`/members/${memberId}/checkins${qs({ from, to })}`),
};

export const adherenceApi = {
  summary: (memberId: string, range: 'week' | 'month') =>
    http.get<AdherenceSummary>(`/members/${memberId}/adherence/summary${qs({ range })}`),
  calendar: (memberId: string, month: string) =>
    http.get<AdherenceCalendarDay[]>(`/members/${memberId}/adherence/calendar${qs({ month })}`),
};

export const stockApi = {
  list: (memberId: string) => http.get<StockItem[]>(`/members/${memberId}/stock`),
  adjust: (memberId: string, body: StockAdjustPayload) =>
    http.post<StockItem>(`/members/${memberId}/stock/adjust`, body),
};

export const ehrApi = {
  getAllergies: (memberId: string) => http.get<Allergy[]>(`/members/${memberId}/allergies`),
  putAllergies: (memberId: string, items: Allergy[]) =>
    http.put<Allergy[]>(`/members/${memberId}/allergies`, { items }),
  listAdverse: (memberId: string) => http.get<AdverseRecord[]>(`/members/${memberId}/adverse-records`),
  createAdverse: (memberId: string, body: { symptomTags: string[]; description?: string; severity: string; occurredAt: string; planItemId?: string }) =>
    http.post<AdverseRecord>(`/members/${memberId}/adverse-records`, body),
  listContacts: (memberId: string) => http.get<EmergencyContact[]>(`/members/${memberId}/emergency-contacts`),
  createContact: (memberId: string, body: Omit<EmergencyContact, 'id'>) =>
    http.post<EmergencyContact>(`/members/${memberId}/emergency-contacts`, body),
  updateContact: (memberId: string, id: string, body: Partial<EmergencyContact>) =>
    http.patch<EmergencyContact>(`/members/${memberId}/emergency-contacts/${id}`, body),
  removeContact: (memberId: string, id: string) =>
    http.del<{ ok: boolean }>(`/members/${memberId}/emergency-contacts/${id}`),
  listMedicalRecords: (memberId: string) => http.get<MedicalRecordEntry[]>(`/members/${memberId}/medical-records`),
  createMedicalRecord: (memberId: string, body: { title?: string; content: string; recordDate?: string }) =>
    http.post<MedicalRecordEntry>(`/members/${memberId}/medical-records`, body),
};

export const notificationApi = {
  list: (page = 1) => http.get<PageResult<NotificationItem>>(`/notifications${qs({ page, pageSize: 30 })}`),
  markRead: (id: string) => http.post<{ ok: boolean }>(`/notifications/${id}/read`),
  getPrefs: () => http.get<NotificationPrefs>('/notification-prefs'),
  putPrefs: (body: NotificationPrefs) => http.put<NotificationPrefs>('/notification-prefs', body),
};
