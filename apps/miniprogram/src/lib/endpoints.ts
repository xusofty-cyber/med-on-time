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
  PhotoRecognizeResult,
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

/** 后端分页包装 {items,total,...} 或裸数组 → 裸数组（与 Web 端 unpage 同口径）。 */
type Paged<T> = { items: T[]; total?: number; page?: number; pageSize?: number };
const unpage = <T>(p: Paged<T> | T[]): T[] => (Array.isArray(p) ? p : (p?.items ?? []));

export const authApi = {
  sendSmsCode: (phone: string, scene: 'register' | 'login' | 'reset') =>
    http.post<{ sent: boolean }>('/auth/sms/send', { phone, scene }),
  register: (body: { phone: string; password: string; code: string; nickname?: string }) =>
    http.post<AuthResult>('/auth/register', body),
  /** 密码登录：account 可为手机号或邮箱（与 Web 同口径，后端按 @ 分流查账号） */
  login: (body: { account: string; password: string }) => http.post<AuthResult>('/auth/login', body),
  loginByCode: (body: { phone: string; code: string }) => http.post<AuthResult>('/auth/login/code', body),
  resetPassword: (body: { phone: string; code: string; newPassword: string }) =>
    http.post<{ ok: boolean }>('/auth/password/reset', body),
  logout: () => http.post<{ ok: boolean }>('/auth/logout'),
  me: () => http.get<Account>('/auth/me'),
  /** 微信小程序一键登录：code 来自 Taro.login()，phoneCode（可选）来自 getPhoneNumber。后端未配 appid/secret 时返回业务码 40312，message 直接透出。 */
  wechatMiniappLogin: (body: { code: string; phoneCode?: string }) =>
    http.post<AuthResult>('/auth/wechat/miniapp/login', body),
  /** 微信核验手机号（需登录）：phoneCode 来自 getPhoneNumber；与账号已登记号码不一致时返回业务码 40910，message 直接透出。 */
  verifyPhoneByWechat: (phoneCode: string) => http.post<Account>('/auth/phone/verify/wechat', { phoneCode }),
  /** 绑定微信（需登录）：code 来自 Taro.login()。 */
  wechatBind: (code: string) => http.post<{ ok: boolean; message?: string }>('/auth/wechat/bind', { code }),
  /** 扫码登录网页版（需登录）：确认当前账号登录 Web 端；票据过期/已被他人确认时后端给出业务提示。 */
  confirmScanTicket: (ticketId: string) =>
    http.post<{ status: 'confirmed'; nickname: string }>('/auth/scan-login/confirm', { ticketId }),
  /** @deprecated 旧占位名，改调正式 /auth/wechat/bind 且必须传 Taro.login() 的 code；新代码请用 wechatBind。 */
  bindWechat: (code: string) => http.post<{ ok: boolean; message?: string }>('/auth/wechat/bind', { code }),
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
  /** 后端返回 {granted, received} 分组且字段名为 memberDisplayName/grantedByNickname，在此归一化并合并为扁平数组（页面按 grantedByAccountId 自行分两组）。 */
  list: async (): Promise<Authorization[]> => {
    type Raw = Authorization & { memberDisplayName?: string | null; grantedByNickname?: string | null };
    const r = await http.get<{ granted: Raw[]; received: Raw[] }>('/authorizations');
    const norm = (a: Raw): Authorization => ({
      ...a,
      memberName: a.memberDisplayName ?? undefined,
      grantorNickname: a.grantedByNickname ?? undefined,
      caregiverNickname: a.caregiverNickname ?? undefined,
    });
    return [...(r.granted ?? []).map(norm), ...(r.received ?? []).map(norm)];
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
  search: (q: string, page = 1) => http.get<PageResult<Drug>>(`/drugs/search${qs({ q, page, pageSize: 20 })}`),
  /** 拍照录入：照片 base64 直传识别药名候选（不落盘），命中项仍须用户点选确认 */
  photoRecognize: (imageBase64: string, mimeType: string) =>
    http.post<PhotoRecognizeResult>('/drugs/photo-recognize', { imageBase64, mimeType }),
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
  /** 后端计数字段为 scheduled/taken/onTime/missed/skipped（无 Count 后缀），在此对齐页面口径（与 Web 同口径）。 */
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
  /** 后端分页包装且主键名为 memberMedicationId、预警为 alerts/expiryStatus，在此对齐页面 StockItem 口径（与 Web 同口径）。 */
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
  getAllergies: (memberId: string) => http.get<Allergy[]>(`/members/${memberId}/allergies`),
  putAllergies: (memberId: string, items: Allergy[]) =>
    http.put<Allergy[]>(`/members/${memberId}/allergies`, { items }),
  listAdverse: async (memberId: string): Promise<AdverseRecord[]> =>
    unpage(await http.get<Paged<AdverseRecord>>(`/members/${memberId}/adverse-records`)),
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
