/**
 * 跨端共享枚举 —— 与《数据库表结构设计》V1.2 附录 B「核心枚举速查」逐字对齐。
 *
 * 纪律（附录 B）：
 * - 枚举值一律小写蛇形英文，禁止数字编码状态。
 * - 数据库侧以 VARCHAR + CHECK 落地，不用 PG 原生 enum；本文件是跨端唯一口径来源，
 *   后端校验、客户端字典都从这里取，改值必须先改 DB 文档与 CHECK。
 * - 预留值（*_RESERVED）只登记、不启用：MVP 任一端提交预留值，服务端必须拒绝并记审计；
 *   启用时走「先放开校验、再发功能」的兼容变更，不改表结构。
 */

/** 照护授权级别：L1 仅查看 / L2 可协助 / L3 可配置 */
export const CaregiverLevel = {
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
} as const;
export type CaregiverLevel = (typeof CaregiverLevel)[keyof typeof CaregiverLevel];

/** 授权状态（caregiver_authorization.status） */
export const AuthorizationStatus = {
  PendingAccept: 'pending_accept',
  Active: 'active',
  Suspended: 'suspended',
  Revoked: 'revoked',
  Expired: 'expired',
  Rejected: 'rejected',
} as const;
export type AuthorizationStatus =
  (typeof AuthorizationStatus)[keyof typeof AuthorizationStatus];

/** 提醒实例状态（reminder_instance.status） */
export const ReminderInstanceStatus = {
  Pending: 'pending',
  Reminded: 'reminded',
  Taken: 'taken',
  Snoozed: 'snoozed',
  Skipped: 'skipped',
  Missed: 'missed',
  Cancelled: 'cancelled',
} as const;
export type ReminderInstanceStatus =
  (typeof ReminderInstanceStatus)[keyof typeof ReminderInstanceStatus];

/** 用药计划状态（medication_plan.status） */
export const PlanStatus = {
  Active: 'active',
  Paused: 'paused',
  Finished: 'finished',
  Stopped: 'stopped',
} as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

/** 计划明细状态（medication_plan_item.status） */
export const PlanItemStatus = {
  Active: 'active',
  Paused: 'paused',
  Stopped: 'stopped',
} as const;
export type PlanItemStatus = (typeof PlanItemStatus)[keyof typeof PlanItemStatus];

/** 计划类型（medication_plan.plan_type，V1.2 新增）：prn 不生成提醒实例 */
export const PlanType = {
  Scheduled: 'scheduled',
  Prn: 'prn',
} as const;
export type PlanType = (typeof PlanType)[keyof typeof PlanType];

/** 账号状态（user_account.status）；cancelling = 注销冷静期（30 天）进行中 */
export const AccountStatus = {
  Active: 'active',
  Frozen: 'frozen',
  Cancelling: 'cancelling',
  Cancelled: 'cancelled',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

/** 投递通道（reminder_delivery_log.channel）——现行启用值 */
export const DeliveryChannel = {
  AppPush: 'app_push',
  WechatSubscribe: 'wechat_subscribe',
  Sms: 'sms',
  VoiceCall: 'voice_call',
  InApp: 'in_app',
  PcPopup: 'pc_popup',
} as const;
export type DeliveryChannel =
  (typeof DeliveryChannel)[keyof typeof DeliveryChannel];

/** 投递通道预留值（V1.2 登记，MVP 未启用，提交即拒绝并记审计） */
export const DeliveryChannelReserved = {
  Smartwatch: 'smartwatch',
  SmartSpeaker: 'smart_speaker',
} as const;
export type DeliveryChannelReserved =
  (typeof DeliveryChannelReserved)[keyof typeof DeliveryChannelReserved];

/** 打卡确认方式（V1.2）：现行仅 tap 启用 */
export const ConfirmationMethod = {
  Tap: 'tap',
} as const;
export type ConfirmationMethod =
  (typeof ConfirmationMethod)[keyof typeof ConfirmationMethod];

/** 打卡确认方式预留值（MVP 未启用） */
export const ConfirmationMethodReserved = {
  Photo: 'photo',
  Voice: 'voice',
} as const;
export type ConfirmationMethodReserved =
  (typeof ConfirmationMethodReserved)[keyof typeof ConfirmationMethodReserved];

/** 库存变动类型（medication_stock_ledger.change_type，V1.2 新增） */
export const StockChangeType = {
  IntakeDeduct: 'intake_deduct',
  ManualAdjust: 'manual_adjust',
  Restock: 'restock',
  ExpiryWriteoff: 'expiry_writeoff',
} as const;
export type StockChangeType =
  (typeof StockChangeType)[keyof typeof StockChangeType];

/** 过敏原类型（member_allergy.allergen_type，V1.2 新增） */
export const AllergenType = {
  DrugCategory: 'drug_category',
  Drug: 'drug',
  Other: 'other',
} as const;
export type AllergenType = (typeof AllergenType)[keyof typeof AllergenType];

/** 变更操作人类型（plan_change_history.operator_type，V1.2 新增） */
export const OperatorType = {
  MemberSelf: 'member_self',
  Caregiver: 'caregiver',
  AdminCs: 'admin_cs',
  System: 'system',
} as const;
export type OperatorType = (typeof OperatorType)[keyof typeof OperatorType];

/** 内容语言维度（BCP 47；zh-TW 口径为台湾用语，E-3 定版） */
export const AppLocale = {
  ZhCN: 'zh-CN',
  ZhTW: 'zh-TW',
  En: 'en',
} as const;
export type AppLocale = (typeof AppLocale)[keyof typeof AppLocale];

/** 同意文本类型（consent_document.doc_type，V1.2 新增） */
export const ConsentDocType = {
  UserAgreement: 'user_agreement',
  PrivacyPolicy: 'privacy_policy',
  AiDataUse: 'ai_data_use',
  HealthDataProcessing: 'health_data_processing',
} as const;
export type ConsentDocType =
  (typeof ConsentDocType)[keyof typeof ConsentDocType];

/**
 * AI 能力（ai_* .capability）。
 * 附录 B 记为六项（含 P2 两项）；其中四项已由 DB 文档 9.1 同意范围确证，
 * 其余两项为 P2、文档未给取值，待 AI 子系统定版时按同一口径补入本文件，禁止先行臆造。
 */
export const AiCapability = {
  HealthQa: 'health_qa',
  LabReportInterpretation: 'lab_report_interpretation',
  MedicalRecordAnalysis: 'medical_record_analysis',
  SymptomAnalysis: 'symptom_analysis',
} as const;
export type AiCapability = (typeof AiCapability)[keyof typeof AiCapability];

/** AI 紧急程度分级 */
export const AiTriageLevel = {
  EmergencyNow: 'emergency_now',
  Urgent2448: 'urgent_24_48',
  Observe: 'observe',
} as const;
export type AiTriageLevel = (typeof AiTriageLevel)[keyof typeof AiTriageLevel];

/** AI 输出安全处置 */
export const AiSafetyAction = {
  Pass: 'pass',
  Blocked: 'blocked',
  Rewritten: 'rewritten',
} as const;
export type AiSafetyAction =
  (typeof AiSafetyAction)[keyof typeof AiSafetyAction];

/** AI 安全规则处置（安全处置三项 + 规则侧两项） */
export const AiSafetyRuleAction = {
  ...AiSafetyAction,
  InterruptEmergency: 'interrupt_emergency',
  FlagReview: 'flag_review',
} as const;
export type AiSafetyRuleAction =
  (typeof AiSafetyRuleAction)[keyof typeof AiSafetyRuleAction];

/** AI 模型配置状态（ai_model_config.status，DB 9.2） */
export const AiModelConfigStatus = {
  Enabled: 'enabled',
  Disabled: 'disabled',
  EmergencyStopped: 'emergency_stopped',
} as const;
export type AiModelConfigStatus =
  (typeof AiModelConfigStatus)[keyof typeof AiModelConfigStatus];

/** AI 提示词模板状态（ai_prompt_template.status，DB 9.3） */
export const AiPromptTemplateStatus = {
  Draft: 'draft',
  PendingReview: 'pending_review',
  Published: 'published',
  Retired: 'retired',
} as const;
export type AiPromptTemplateStatus =
  (typeof AiPromptTemplateStatus)[keyof typeof AiPromptTemplateStatus];

/** AI 同意动作（ai_consent.action，DB 9.1；本表只追加，效力取成员最新一行） */
export const AiConsentAction = {
  Granted: 'granted',
  Withdrawn: 'withdrawn',
} as const;
export type AiConsentAction =
  (typeof AiConsentAction)[keyof typeof AiConsentAction];

/** AI 会话发起端（ai_session.channel，DB 第 9 章） */
export const AiSessionChannel = {
  Web: 'web',
  WechatMiniapp: 'wechat_miniapp',
  Android: 'android',
  Ios: 'ios',
  Pc: 'pc',
} as const;
export type AiSessionChannel =
  (typeof AiSessionChannel)[keyof typeof AiSessionChannel];
