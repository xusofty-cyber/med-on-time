import type { PageData } from '../services/request';

export type { PageData };

/**
 * 后台接口 DTO —— 形状以 docs/dev/API_CONTRACT.md「后台接口」为准，
 * 字段名对齐 services/api/prisma/schema.prisma 的 camelCase 序列化命名。
 * 后端并行开发中，个别聚合字段（计数、双人核验信息、纠纷前后值）按契约语义预定义，
 * 联调时如有出入以本文件为前端侧修订点。
 */

/* ---------------- 鉴权 / 仪表盘 ---------------- */

export interface AdminProfile {
  id: string;
  username: string;
  realName: string;
  roles: string[];
  status?: string;
  lastLoginAt?: string | null;
}

export interface AdminLoginResult {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  admin: AdminProfile;
}

export interface DashboardData {
  accounts: {
    total: number;
    active: number;
    frozen: number;
    cancelling?: number;
    newToday: number;
    newThisWeek?: number;
  };
  members: { total: number; active?: number };
  reminders: {
    deliveredToday: number;
    failedToday?: number;
    missedToday?: number;
    /** 0~1 */
    deliveryRateToday?: number;
  };
  drugs: {
    total: number;
    pendingReview: number;
    approved?: number;
    rejected?: number;
  };
  disputes?: { pending: number };
}

/* ---------------- 账号 / 成员 ---------------- */

export interface AccountItem {
  id: string;
  nickname: string;
  /** 后端返回脱敏手机号（日志脱敏红线），phone 仅作同义回退 */
  phoneMasked?: string;
  phone?: string;
  registerChannel: string;
  status: string;
  registeredAt: string;
  lastLoginAt?: string | null;
  timezone?: string;
  memberCount?: number;
  cancelApplyAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberSummary {
  id: string;
  displayName: string;
  relationship: string;
  status: string;
}

export interface AccountDetail extends AccountItem {
  members: MemberSummary[];
  oauthBindings?: { provider: string; boundAt?: string }[];
}

export interface AuthorizationItem {
  id: string;
  memberId: string;
  caregiverAccountId: string;
  caregiverNickname?: string;
  grantedByAccountId: string;
  level: string;
  status: string;
  invitedAt: string;
  acceptedAt?: string | null;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
}

export interface MemberItem {
  id: string;
  accountId: string;
  displayName: string;
  relationship: string;
  gender?: string | null;
  birthDate?: string | null;
  timezone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  account?: { id: string; nickname: string; phoneMasked?: string; status?: string };
  /** 该成员被授权的照护关系（授权我的照护人列表） */
  authorizations?: AuthorizationItem[];
}

/* ---------------- 药品 ---------------- */

export interface DrugReviewStageInfo {
  adminId?: string;
  adminName?: string;
  at?: string | null;
  decision?: string | null;
  comment?: string | null;
}

/** 双人核验两段：reviewer 初核 + verifier 复核（API_CONTRACT 药品库口径） */
export interface DrugReviewInfo {
  stage?: 'review' | 'verify' | 'done' | string;
  reviewer?: DrugReviewStageInfo;
  verifier?: DrugReviewStageInfo;
}

export interface DrugItem {
  id: string;
  genericName: string;
  brandName?: string | null;
  manufacturer?: string | null;
  approvalNumber?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  dosageForm: string;
  specification: string;
  packageDesc?: string | null;
  unit: string;
  efficacy?: string | null;
  /** 用法用量（schema 为 Json：可能为文本或结构化对象） */
  usageDefault?: unknown;
  contraindications?: string | null;
  adverseReactions?: string | null;
  interactions?: string | null;
  storageCondition?: string | null;
  isOtc: boolean;
  sourceType: string;
  reviewStatus: string;
  review?: DrugReviewInfo;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewDrugPayload {
  /** 当前核验段：review 初核 / verify 复核 */
  stage: 'review' | 'verify';
  decision: 'approved' | 'rejected';
  comment?: string;
}

export interface ImportSeedResult {
  total?: number;
  imported: number;
  updated?: number;
  skipped?: number;
  /** 以 pending（未发布）状态导入的条数 */
  pendingUnpublished?: number;
  message?: string;
}

/* ---------------- 计划监管 ---------------- */

export interface PlanItemSummary {
  id: string;
  drugNameSnapshot: string;
  doseAmount: string | number;
  doseUnit: string;
  frequencyType: string;
  mealRelation?: string;
  status: string;
}

export interface PlanItemRow {
  id: string;
  memberId: string;
  memberName?: string;
  name: string;
  planType: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  storageLocation?: string | null;
  additionalNote?: string | null;
  note?: string | null;
  createdByAccountId: string;
  createdByNickname?: string;
  items?: PlanItemSummary[];
  createdAt: string;
  updatedAt: string;
}

/** plan_change_history 字段级变更（与变更日志双写，后台时间线展示此表） */
export interface PlanHistoryItem {
  id: string;
  createdAt: string;
  planId: string;
  planItemId?: string | null;
  memberId: string;
  changedField: string;
  oldValue?: string | null;
  newValue?: string | null;
  operatorAccountId?: string | null;
  operatorName?: string;
  operatorType: string;
  operatorLevel?: string | null;
}

/* ---------------- 内容 ---------------- */

export interface ArticleItem {
  id: string;
  title: string;
  category: string;
  body: string;
  locale: string;
  contentGroupId: string;
  status: string;
  publishedAt?: string | null;
  authorAdminId?: string | null;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleUpsertPayload {
  title: string;
  category: string;
  body: string;
  locale: string;
  contentGroupId?: string;
  status: string;
}

export interface ConsentItem {
  id: string;
  docType: string;
  docVersion: string;
  locale: string;
  title: string;
  /** 正文不存本表：对象存储键或内容 ID */
  contentRef: string;
  contentSha256?: string | null;
  effectiveDate: string;
  isMaterialChange: boolean;
  status: string;
  publishedBy?: string | null;
  publisherName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentUpsertPayload {
  docType: string;
  docVersion: string;
  locale: string;
  title: string;
  contentRef: string;
  contentSha256?: string;
  effectiveDate: string;
  isMaterialChange: boolean;
  status: string;
}

/* ---------------- 客服裁决 ---------------- */

/**
 * 纠纷（授权/代操作争议）：裁决须保留争议变更的前后值双记录，
 * 裁决后由后端以 operator_type=admin_cs 写入对应变更史。
 */
export interface DisputeItem {
  id: string;
  category: string;
  subject: string;
  description?: string | null;
  accountId: string;
  accountNickname?: string;
  memberId?: string | null;
  memberName?: string;
  targetType?: string | null;
  targetId?: string | null;
  /** 争议变更前值（双记录之一） */
  beforeValue?: unknown;
  /** 争议变更后值（双记录之一） */
  afterValue?: unknown;
  status: string;
  decision?: string | null;
  resolution?: string | null;
  finalValue?: unknown;
  resolvedBy?: string | null;
  resolvedByName?: string;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveDisputePayload {
  /** uphold_before / uphold_after / custom */
  decision: string;
  resolution: string;
  /** decision=custom 时的裁定值（文本或 JSON） */
  finalValue?: string;
}

/* ---------------- 审计 ---------------- */

export interface AuditLogItem {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  memberId?: string | null;
  detail?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  result: string;
}

/* ---------------- 系统：应用版本 ---------------- */

export interface AppVersionItem {
  id: string;
  platform: string;
  version: string;
  minSupportedVersion?: string | null;
  releaseNote?: string | null;
  downloadUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppVersionPayload {
  platform: string;
  version: string;
  minSupportedVersion?: string;
  releaseNote?: string;
  downloadUrl?: string;
  status: string;
}

/** 大模型配置（2026-10-24）：apiKey 只写不回显，列表只回掩码 */
export interface AiProviderItem {
  id: string;
  name: string;
  modelName: string;
  baseUrl: string;
  apiKeyMasked: string;
  capability: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderPayload {
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey?: string;
  capability?: string;
  isActive?: boolean;
}

/** 列表查询通用参数（契约分页 ?page=&pageSize=） */
export interface ListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  [key: string]: string | number | boolean | undefined;
}
