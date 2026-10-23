/**
 * 用户端 API DTO 类型 —— 形状以 docs/dev/API_CONTRACT.md 为准，
 * 字段命名与 services/api/prisma/schema.prisma 的 camelCase 对齐。
 * 后端个别字段可能增补，读取时一律做可选处理，避免渲染崩溃。
 */

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  traceId: string;
  data: T;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Account {
  id: string;
  nickname: string;
  phoneMasked?: string;
  status: string; // active / frozen / cancelling / cancelled
  timezone: string;
  registeredAt?: string;
  lastLoginAt?: string | null;
  cancelApplyAt?: string | null;
  // 注册验证通道新增字段（可选，兼容旧后端数据缺失时不渲染/不崩溃）
  phoneVerified?: boolean;
  hasPhone?: boolean;
  emailMasked?: string | null;
  emailVerified?: boolean;
  hasEmail?: boolean;
  hasWechat?: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  account?: Account;
}

export interface Member {
  id: string;
  accountId: string;
  displayName: string;
  relationship: string; // self / father / mother / spouse / child / grandparent / other_family / employer / other
  gender?: string | null;
  birthDate?: string | null;
  timezone: string;
  status: string; // active / archived / removed
  sortOrder?: number;
  /** 非本人成员（被授权照护）时由后端附带：owner=自有成员，否则为授权级别 L1/L2/L3 */
  accessLevel?: string;
  authorizationId?: string;
}

export type CyclePresetKey = 'standard' | 'gentle' | 'strict';

/** 强提醒方式（2026-10-24 定版，原生/桌面端）：弹窗打底 + 三态单选，闹钟与语音互斥 */
export type StrongAlertMode = 'none' | 'alarm' | 'voice';

export const STRONG_ALERT_LABELS: Record<StrongAlertMode, string> = {
  none: '无（仅弹窗通知）',
  alarm: '闹钟（全屏 + 持续响铃）',
  voice: '语音播报',
};

export interface CareSettings {
  careMode: boolean;
  cyclePreset: CyclePresetKey;
  cycleWindowMinutes: number;
  cycleIntervalMinutes: number;
  lockScreenShowDrugDetail: boolean;
  strongAlertMode: StrongAlertMode;
}

export const CYCLE_PRESETS: Record<CyclePresetKey, { label: string; windowMinutes: number; intervalMinutes: number }> = {
  standard: { label: '标准（90 分钟内每 15 分钟）', windowMinutes: 90, intervalMinutes: 15 },
  gentle: { label: '温和（120 分钟内每 30 分钟）', windowMinutes: 120, intervalMinutes: 30 },
  strict: { label: '严格（60 分钟内每 10 分钟）', windowMinutes: 60, intervalMinutes: 10 },
};

export interface Drug {
  id: string;
  genericName: string;
  brandName?: string | null;
  manufacturer?: string | null;
  approvalNumber?: string | null;
  dosageForm: string;
  specification: string;
  unit: string;
  efficacy?: string | null;
  contraindications?: string | null;
  adverseReactions?: string | null;
  interactions?: string | null;
  storageCondition?: string | null;
  isOtc?: boolean;
  sourceType?: string;
  reviewStatus?: string;
}

export interface DrugInteractions {
  interactions?: string | null;
  hardWarnings?: string[];
}

export interface PlanPhaseInput {
  stageNo: number;
  durationDays: number;
  dailyDoseAmount: number;
  dailyDoseUnit: string;
  isFinalStop?: boolean;
  note?: string;
}

export interface PlanItemInput {
  drugId: string;
  doseAmount: number;
  doseUnit: string;
  frequencyType: string; // daily / times_per_day / weekly / interval_days
  frequencyRule: { times?: string[]; weekdays?: number[]; intervalDays?: number };
  mealRelation: string; // before_meal / with_meal / after_meal / before_sleep / none
  courseType: string; // long_term / fixed_days / until_finished
  courseDays?: number | null;
}

export interface Plan {
  id: string;
  memberId: string;
  name: string;
  planType: string; // scheduled / prn
  status: string; // active / paused / finished / stopped
  startDate: string;
  endDate?: string | null;
  note?: string | null;
  storageLocation?: string | null;
  additionalNote?: string | null;
  prnMinIntervalMinutes?: number | null;
  prnMaxPerDay?: number | null;
  cyclePreset?: CyclePresetKey | null;
  cycleWindowMinutes?: number | null;
  cycleIntervalMinutes?: number | null;
  /** 强提醒方式覆盖原值：null = 跟随成员关怀设置 */
  strongAlertModeOverride?: StrongAlertMode | null;
  items?: PlanItem[];
  phases?: PlanPhase[];
  createdAt?: string;
}

export interface PlanItem extends PlanItemInput {
  id: string;
  planId: string;
  drugNameSnapshot: string;
  status: string;
  drug?: Drug;
}

export interface PlanPhase extends PlanPhaseInput {
  id: string;
  planId: string;
  planItemId?: string | null;
}

export interface PlanPayload {
  name: string;
  planType: string;
  startDate: string;
  endDate?: string | null;
  note?: string;
  storageLocation?: string;
  additionalNote?: string;
  prnMinIntervalMinutes?: number | null;
  prnMaxPerDay?: number | null;
  cyclePreset?: CyclePresetKey | null;
  cycleWindowMinutes?: number | null;
  cycleIntervalMinutes?: number | null;
  strongAlertMode?: StrongAlertMode | null;
  items: PlanItemInput[];
  phases?: PlanPhaseInput[];
}

export interface PlanChangeHistoryEntry {
  id: string;
  createdAt: string;
  changedField: string;
  oldValue?: string | null;
  newValue?: string | null;
  operatorType: string; // member_self / caregiver / admin_cs / system
  operatorLevel?: string | null;
  planItemId?: string | null;
}

export interface ReminderInstance {
  id: string;
  memberId: string;
  planId: string;
  planItemId: string;
  drugId: string;
  drugNameSnapshot: string;
  doseAmount: number | string;
  doseUnit: string;
  scheduledAtUtc: string;
  localDate: string;
  localTime: string;
  timezone: string;
  status: string; // pending / reminded / taken / snoozed / skipped / missed / cancelled
  snoozeUntil?: string | null;
  snoozeCount?: number;
  storageLocation?: string | null;
  additionalNote?: string | null;
  mealRelation?: string | null;
}

export interface AdherenceSummary {
  range: string;
  scheduledCount: number;
  takenCount: number;
  onTimeCount: number;
  missedCount: number;
  skippedCount: number;
  adherenceRate?: number | null; // 0-1
  onTimeRate?: number | null; // 0-1
}

export interface AdherenceCalendarDay {
  date: string; // YYYY-MM-DD
  scheduledCount: number;
  takenCount: number;
  onTimeCount: number;
  missedCount: number;
  skippedCount: number;
  adherenceRate?: number | null;
}

export interface StockItem {
  id: string;
  memberId: string;
  drugId: string;
  drugName?: string;
  genericName?: string;
  brandName?: string | null;
  specification?: string;
  stockQuantity: number | string;
  stockUnit: string;
  currentBatchExpiryDate?: string | null;
  storageLocation?: string | null;
  status: string; // in_use / depleted / expired / archived
  daysLeftEstimate?: number | null;
  lowStock?: boolean;
  expiringSoon?: boolean;
  expired?: boolean;
  drug?: Drug;
}

export interface StockAdjustPayload {
  drugId: string;
  changeType: string; // restock / manual_adjust / expiry_writeoff
  changeAmount: number;
  expiryDate?: string | null;
  note?: string;
}

export interface Allergy {
  id?: string;
  allergen: string;
  allergenType: string; // drug_category / drug / other
  severity?: string | null; // mild / moderate / severe
  reaction?: string | null;
  note?: string | null;
}

export interface AdverseRecord {
  id: string;
  symptomTags: string[];
  description?: string | null;
  severity: string;
  occurredAt: string;
  drugNameSnapshot?: string | null;
  planItemId?: string | null;
  createdAt?: string;
}

export interface EmergencyContact {
  id: string;
  contactName: string;
  phone?: string;
  phoneMasked?: string;
  relationship: string;
  priority: number;
  note?: string | null;
}

/** 健康概况（后端 member_medical_record：每位成员一条，upsert 语义；summary 正文加密存储） */
export interface MedicalProfile {
  id: string;
  memberId: string;
  bloodType?: string | null; // A / B / AB / O / unknown
  heightCm?: number | null;
  weightKg?: number | null;
  primaryHospital?: string | null;
  summary?: string | null;
  updatedAt?: string;
}

export interface Authorization {
  id: string;
  memberId: string;
  memberName?: string;
  caregiverAccountId: string;
  caregiverNickname?: string;
  caregiverPhoneMasked?: string;
  grantedByAccountId: string;
  grantorNickname?: string;
  level: string; // L1 / L2 / L3
  status: string; // pending_accept / active / suspended / revoked / expired / rejected
  invitedAt: string;
  acceptedAt?: string | null;
  expiresAt?: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  type?: string;
  memberId?: string | null;
  isRead?: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPrefs {
  inApp: boolean;
  sms: boolean;
  wechat: boolean;
}

export interface UserSession {
  id: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt?: string;
  lastActiveAt?: string;
  current?: boolean;
}
