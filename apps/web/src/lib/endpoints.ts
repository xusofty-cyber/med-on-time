/** 用户端接口调用层 —— 路径逐条对应 docs/dev/API_CONTRACT.md「用户端接口」。 */
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
  MedicalProfile,
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
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export type EmailCodeScene = 'register' | 'login' | 'reset' | 'reset_password' | 'bind';

/**
 * 契约归一化层（2026-10-23 实测对齐）：后端各列表接口的线上形状并不统一——
 * 分页包装 {items,total,page,pageSize}、分组 {own,authorized} / {granted,received}、
 * 提醒 {date,timezone,items}、依从 {days:[...]} 等。页面一律按数组/定版类型消费，
 * 形状适配集中收敛在本层，页面不再直面原始形状（曾致授权/设置页渲染崩溃白屏）。
 */
interface Paged<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}
const unpage = <T>(p: Paged<T> | T[]): T[] => (Array.isArray(p) ? p : (p?.items ?? []));

export const authApi = {
  sendSmsCode: (phone: string, scene: 'register' | 'login' | 'reset') =>
    http.post<{ sent: boolean }>('/auth/sms/send', { phone, scene }),
  sendEmailCode: (email: string, scene: EmailCodeScene) =>
    http.post<{ expiresInSeconds: number }>('/auth/email/send', { email, scene }),
  register: (body: { phone: string; password: string; nickname?: string }) =>
    http.post<AuthResult>('/auth/register', { ...body, registerChannel: 'web' }),
  registerByEmail: (body: { email: string; code: string; password: string; nickname?: string; phone?: string }) =>
    http.post<AuthResult>('/auth/register/email', body),
  login: (body: { account: string; password: string }) => http.post<AuthResult>('/auth/login', body),
  loginByCode: (
    body:
      | { phone: string; code: string; smsCode?: string }
      | { email: string; code: string },
  ) => {
    if ('phone' in body) {
      return http.post<AuthResult>('/auth/login/code', {
        phone: body.phone,
        code: body.code,
        smsCode: body.smsCode ?? body.code,
      });
    }
    return http.post<AuthResult>('/auth/login/code', {
      email: body.email,
      code: body.code,
    });
  },
  resetPassword: (
    body:
      | { phone: string; code: string; smsCode?: string; newPassword: string }
      | { email: string; code: string; newPassword: string },
  ) => {
    if ('phone' in body) {
      return http.post<{ ok: boolean }>('/auth/password/reset', {
        phone: body.phone,
        code: body.code,
        smsCode: body.smsCode ?? body.code,
        newPassword: body.newPassword,
      });
    }
    return http.post<{ ok: boolean }>('/auth/password/reset', {
      email: body.email,
      code: body.code,
      newPassword: body.newPassword,
    });
  },
  logout: () => http.post<{ ok: boolean }>('/auth/logout'),
  /** 扫码登录（小程序确认）：建票 + 轮询取票 */
  createScanTicket: () =>
    http.post<{ ticketId: string; qrContent: string; expiresIn: number }>('/auth/scan-login/tickets', {
      platform: 'web',
    }),
  pollScanTicket: (ticketId: string) =>
    http.get<{ status: 'pending' } | ({ status: 'confirmed' } & AuthResult)>(
      `/auth/scan-login/tickets/${ticketId}`,
    ),
  me: () => http.get<Account>('/auth/me'),
  /** 微信绑定（小程序扫码确认）：建票 + 轮询票据状态 */
  createBindTicket: () =>
    http.post<{ ticketId: string; expiresInSeconds: number; qrContent: string }>(
      '/auth/wechat/bind-tickets',
    ),
  getBindTicket: (id: string) =>
    http.get<{ status: 'pending' | 'confirmed' | 'expired' }>(
      `/auth/wechat/bind-tickets/${id}`,
    ),
};

export const accountApi = {
  profile: () => http.get<Account>('/account/profile'),
  updateProfile: (body: { nickname?: string; timezone?: string }) => http.patch<Account>('/account/profile', body),
  cancel: (reason?: string) => http.post<{ ok: boolean; cancelApplyAt?: string }>('/account/cancel', { reason }),
  sessions: async (): Promise<UserSession[]> => unpage(await http.get<Paged<UserSession>>('/account/sessions')),
  revokeSession: (id: string) => http.del<{ ok: boolean }>(`/account/sessions/${id}`),
};

export const memberApi = {
  /** 后端返回 {own, authorized} 分组：own → accessLevel='owner'；authorized → accessLevel=授权级别（L1/L2/L3）。 */
  list: async (): Promise<Member[]> => {
    const r = await http.get<{
      own: (Member & { access?: string })[];
      authorized: (Member & { access?: string; level?: string })[];
    }>('/members');
    return [
      ...(r.own ?? []).map((m) => ({ ...m, accessLevel: 'owner' })),
      ...(r.authorized ?? []).map((m) => ({ ...m, accessLevel: m.level ?? 'caregiver' })),
    ];
  },
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
  /** 后端返回 {granted, received} 分组且字段名为 memberDisplayName/grantedByNickname，在此归一化为页面口径。 */
  list: async (): Promise<{ granted: Authorization[]; received: Authorization[] }> => {
    type Raw = Authorization & { memberDisplayName?: string | null; grantedByNickname?: string | null };
    const r = await http.get<{ granted: Raw[]; received: Raw[] }>('/authorizations');
    const norm = (a: Raw): Authorization => ({
      ...a,
      memberName: a.memberDisplayName ?? undefined,
      grantorNickname: a.grantedByNickname ?? undefined,
      caregiverNickname: a.caregiverNickname ?? undefined,
    });
    return { granted: (r.granted ?? []).map(norm), received: (r.received ?? []).map(norm) };
  },
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
  search: async (q: string, page = 1): Promise<PageResult<Drug>> => {
    const res = await http.get<PageResult<Drug> | Drug[]>(`/drugs/search${qs({ q, page, pageSize: 20 })}`);
    if (Array.isArray(res)) return { items: res, total: res.length, page, pageSize: 20 };
    return {
      items: res?.items ?? [],
      total: res?.total ?? (res?.items?.length ?? 0),
      page: res?.page ?? page,
      pageSize: res?.pageSize ?? 20,
    };
  },
  detail: (id: string) => http.get<Drug>(`/drugs/${id}`),
  interactions: (id: string) => http.get<DrugInteractions>(`/drugs/${id}/interactions`),
  createCustom: (memberId: string, body: Partial<Drug> & { genericName: string; specification: string; unit: string; dosageForm: string }) =>
    http.post<Drug>(`/members/${memberId}/drugs/custom`, body),
};

export const planApi = {
  list: async (memberId: string): Promise<Plan[]> => unpage(await http.get<Paged<Plan>>(`/members/${memberId}/plans`)),
  create: (memberId: string, body: PlanPayload) => http.post<Plan>(`/members/${memberId}/plans`, body),
  update: (planId: string, body: Partial<PlanPayload>) => http.patch<Plan>(`/plans/${planId}`, body),
  remove: (planId: string) => http.del<{ ok: boolean }>(`/plans/${planId}`),
  history: async (planId: string): Promise<PlanChangeHistoryEntry[]> =>
    unpage(await http.get<Paged<PlanChangeHistoryEntry>>(`/plans/${planId}/history`)),
  pause: (planId: string) => http.post<Plan>(`/plans/${planId}/pause`),
  resume: (planId: string) => http.post<Plan>(`/plans/${planId}/resume`),
};

export const reminderApi = {
  today: async (memberId: string): Promise<ReminderInstance[]> =>
    (await http.get<{ items: ReminderInstance[] }>(`/members/${memberId}/reminders/today`)).items ?? [],
  byDate: async (memberId: string, date: string): Promise<ReminderInstance[]> =>
    (await http.get<{ items: ReminderInstance[] }>(`/members/${memberId}/reminders${qs({ date })}`)).items ?? [],
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
  checkins: async (memberId: string, from: string, to: string): Promise<unknown[]> =>
    unpage(await http.get<Paged<unknown>>(`/members/${memberId}/checkins${qs({ from, to })}`)),
};

export const adherenceApi = {
  /** 后端计数字段为 scheduled/taken/onTime/missed/skipped（无 Count 后缀），在此对齐页面口径。 */
  summary: async (memberId: string, range: 'week' | 'month'): Promise<AdherenceSummary> => {
    const r = await http.get<{
      range: string;
      scheduled: number;
      taken: number;
      onTime: number;
      missed: number;
      skipped: number;
      adherenceRate: number | null;
      onTimeRate: number | null;
    }>(`/members/${memberId}/adherence/summary${qs({ range })}`);
    return {
      range: r.range,
      scheduledCount: r.scheduled,
      takenCount: r.taken,
      onTimeCount: r.onTime,
      missedCount: r.missed,
      skippedCount: r.skipped,
      adherenceRate: r.adherenceRate,
      onTimeRate: r.onTimeRate,
    };
  },
  calendar: async (memberId: string, month: string): Promise<AdherenceCalendarDay[]> => {
    const r = await http.get<{
      days: {
        date: string;
        scheduled: number;
        taken: number;
        onTime: number;
        missed: number;
        skipped: number;
        adherenceRate: number | null;
      }[];
    }>(`/members/${memberId}/adherence/calendar${qs({ month })}`);
    return (r.days ?? []).map((d) => ({
      date: d.date,
      scheduledCount: d.scheduled,
      takenCount: d.taken,
      onTimeCount: d.onTime,
      missedCount: d.missed,
      skippedCount: d.skipped,
      adherenceRate: d.adherenceRate,
    }));
  },
};

export const stockApi = {
  /** 后端分页包装且主键名为 memberMedicationId、预警为 alerts/expiryStatus，在此对齐页面 StockItem 口径。 */
  list: async (memberId: string): Promise<StockItem[]> => {
    type Raw = {
      memberMedicationId: string;
      memberId: string;
      drugId: string;
      drug?: { genericName: string; brandName: string | null; specification: string; dosageForm: string; unit: string };
      stockQuantity: number;
      stockUnit: string;
      currentBatchExpiryDate?: string | null;
      storageLocation?: string | null;
      status: string;
      estimatedDaysLeft?: number | null;
      expiryStatus?: string;
      alerts?: string[];
    };
    const rows = unpage(await http.get<Paged<Raw>>(`/members/${memberId}/stock`));
    return rows.map((r) => ({
      id: r.memberMedicationId,
      memberId: r.memberId,
      drugId: r.drugId,
      drugName: r.drug?.brandName ?? r.drug?.genericName,
      genericName: r.drug?.genericName,
      brandName: r.drug?.brandName,
      specification: r.drug?.specification,
      stockQuantity: r.stockQuantity,
      stockUnit: r.stockUnit,
      currentBatchExpiryDate: r.currentBatchExpiryDate,
      storageLocation: r.storageLocation,
      status: r.status,
      daysLeftEstimate: r.estimatedDaysLeft,
      lowStock: (r.alerts ?? []).includes('low_stock'),
      expiringSoon: r.expiryStatus === 'expiring_soon',
      expired: r.expiryStatus === 'expired',
      drug: r.drug as StockItem['drug'],
    }));
  },
  adjust: (memberId: string, body: StockAdjustPayload) =>
    http.post<StockItem>(`/members/${memberId}/stock/adjust`, body),
};

export const ehrApi = {
  getAllergies: async (memberId: string): Promise<Allergy[]> =>
    unpage(await http.get<Paged<Allergy> | Allergy[]>(`/members/${memberId}/allergies`)),
  putAllergies: async (memberId: string, items: Allergy[]): Promise<Allergy[]> =>
    unpage(await http.put<Paged<Allergy> | Allergy[]>(`/members/${memberId}/allergies`, { items })),
  listAdverse: async (memberId: string): Promise<AdverseRecord[]> =>
    unpage(await http.get<Paged<AdverseRecord>>(`/members/${memberId}/adverse-records`)),
  createAdverse: (memberId: string, body: { symptomTags: string[]; description?: string; severity: string; occurredAt: string; planItemId?: string }) =>
    http.post<AdverseRecord>(`/members/${memberId}/adverse-records`, body),
  listContacts: async (memberId: string): Promise<EmergencyContact[]> =>
    unpage(await http.get<Paged<EmergencyContact> | EmergencyContact[]>(`/members/${memberId}/emergency-contacts`)),
  createContact: (memberId: string, body: Omit<EmergencyContact, 'id'>) =>
    http.post<EmergencyContact>(`/members/${memberId}/emergency-contacts`, body),
  updateContact: (memberId: string, id: string, body: Partial<EmergencyContact>) =>
    http.patch<EmergencyContact>(`/members/${memberId}/emergency-contacts/${id}`, body),
  removeContact: (memberId: string, id: string) =>
    http.del<{ ok: boolean }>(`/members/${memberId}/emergency-contacts/${id}`),
  /** 病历在后端为「每位成员一条健康概况」（血型/身高/体重/常去医院/健康摘要 upsert），非条目列表。 */
  getMedicalProfile: (memberId: string) => http.get<MedicalProfile | null>(`/members/${memberId}/medical-records`),
  upsertMedicalProfile: (
    memberId: string,
    body: { bloodType?: string; heightCm?: number; weightKg?: number; primaryHospital?: string; summary?: string },
  ) => http.post<MedicalProfile>(`/members/${memberId}/medical-records`, body),
};

export const notificationApi = {
  list: async (page = 1, pageSize = 30): Promise<PageResult<NotificationItem>> => {
    const res = await http.get<PageResult<NotificationItem> | NotificationItem[]>(
      `/notifications${qs({ page, pageSize })}`,
    );
    if (Array.isArray(res)) return { items: res, total: res.length, page, pageSize };
    return {
      items: res?.items ?? [],
      total: res?.total ?? (res?.items?.length ?? 0),
      page: res?.page ?? page,
      pageSize: res?.pageSize ?? pageSize,
      unreadCount: res?.unreadCount,
    };
  },
  markRead: (id: string) => http.post<{ ok: boolean }>(`/notifications/${id}/read`),
  getPrefs: () => http.get<NotificationPrefs>('/notification-prefs'),
  putPrefs: (body: NotificationPrefs) => http.put<NotificationPrefs>('/notification-prefs', body),
};
