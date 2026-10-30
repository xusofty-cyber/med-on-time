/**
 * 枚举 → 标签 / 状态色字典（i18n 化：全部改为函数，调用时按当前语言现取）。
 * 取值口径优先取自 packages/shared（与 DB 附录 B 对齐）；
 * shared 未收录的后台域枚举（药品核验、文章/协议状态、工单裁决、审计、应用版本）
 * 按 services/api/prisma/schema.prisma 字段注释登记于此，禁止自创取值。
 */
import {
  AccountStatus,
  AppLocale,
  AuthorizationStatus,
  CaregiverLevel,
  ConsentDocType,
  OperatorType,
  PlanStatus,
  PlanType,
} from '@med-on-time/shared';
import { tr } from '../i18n';

export interface StatusMeta {
  text: string;
  /** antd Tag color */
  color: string;
}

function meta(map: Record<string, StatusMeta>) {
  return (value?: string | null): StatusMeta =>
    (value ? map[value] : undefined) ?? { text: value ?? '-', color: 'default' };
}

function text(map: Record<string, string>) {
  return (value?: string | null): string => (value ? map[value] : undefined) ?? value ?? '-';
}

function enumOf(map: Record<string, StatusMeta>): Record<string, { text: string }> {
  const out: Record<string, { text: string }> = {};
  Object.entries(map).forEach(([key, v]) => {
    out[key] = { text: v.text };
  });
  return out;
}

/* ---------------- 账号 / 成员 ---------------- */

/** user_account.status（shared AccountStatus） */
export function accountStatusMap(): Record<string, StatusMeta> {
  return {
    [AccountStatus.Active]: { text: tr('enum.accountStatus.active'), color: 'green' },
    [AccountStatus.Frozen]: { text: tr('enum.accountStatus.frozen'), color: 'red' },
    [AccountStatus.Cancelling]: { text: tr('enum.accountStatus.cancelling'), color: 'orange' },
    [AccountStatus.Cancelled]: { text: tr('enum.accountStatus.cancelled'), color: 'default' },
  };
}
export const accountStatusMeta = (value?: string | null): StatusMeta => meta(accountStatusMap())(value);
export const accountStatusEnum = (): Record<string, { text: string }> => enumOf(accountStatusMap());

/** user_account.register_channel */
export const registerChannelText = (value?: string | null): string =>
  text({
    wechat_miniapp: tr('enum.registerChannel.wechat_miniapp'),
    android: tr('enum.registerChannel.android'),
    ios: tr('enum.registerChannel.ios'),
    web: tr('enum.registerChannel.web'),
    pc: tr('enum.registerChannel.pc'),
  })(value);

/** member.status */
export function memberStatusMap(): Record<string, StatusMeta> {
  return {
    active: { text: tr('enum.memberStatus.active'), color: 'green' },
    archived: { text: tr('enum.memberStatus.archived'), color: 'orange' },
    removed: { text: tr('enum.memberStatus.removed'), color: 'default' },
  };
}
export const memberStatusMeta = (value?: string | null): StatusMeta => meta(memberStatusMap())(value);
export const memberStatusEnum = (): Record<string, { text: string }> => enumOf(memberStatusMap());

/** member.relationship */
export const relationshipText = (value?: string | null): string =>
  text({
    self: tr('enum.relationship.self'),
    father: tr('enum.relationship.father'),
    mother: tr('enum.relationship.mother'),
    spouse: tr('enum.relationship.spouse'),
    child: tr('enum.relationship.child'),
    grandparent: tr('enum.relationship.grandparent'),
    other_family: tr('enum.relationship.other_family'),
    employer: tr('enum.relationship.employer'),
    other: tr('enum.relationship.other'),
  })(value);

export const genderText = (value?: string | null): string =>
  text({
    male: tr('enum.gender.male'),
    female: tr('enum.gender.female'),
    unknown: tr('enum.gender.unknown'),
  })(value);

/* ---------------- 授权 ---------------- */

/** caregiver_authorization.status（shared AuthorizationStatus） */
export function authorizationStatusMap(): Record<string, StatusMeta> {
  return {
    [AuthorizationStatus.PendingAccept]: { text: tr('enum.authStatus.pending_accept'), color: 'orange' },
    [AuthorizationStatus.Active]: { text: tr('enum.authStatus.active'), color: 'green' },
    [AuthorizationStatus.Suspended]: { text: tr('enum.authStatus.suspended'), color: 'gold' },
    [AuthorizationStatus.Revoked]: { text: tr('enum.authStatus.revoked'), color: 'red' },
    [AuthorizationStatus.Expired]: { text: tr('enum.authStatus.expired'), color: 'default' },
    [AuthorizationStatus.Rejected]: { text: tr('enum.authStatus.rejected'), color: 'default' },
  };
}
export const authorizationStatusMeta = (value?: string | null): StatusMeta =>
  meta(authorizationStatusMap())(value);

/** caregiver_authorization.level（shared CaregiverLevel） */
export const authLevelText = (value?: string | null): string =>
  text({
    [CaregiverLevel.L1]: tr('enum.authLevel.L1'),
    [CaregiverLevel.L2]: tr('enum.authLevel.L2'),
    [CaregiverLevel.L3]: tr('enum.authLevel.L3'),
  })(value);

/* ---------------- 药品 ---------------- */

/** drug.review_status（schema 注释：draft / pending_review / approved / rejected / off_shelf） */
export function drugReviewStatusMap(): Record<string, StatusMeta> {
  return {
    draft: { text: tr('enum.drugReview.draft'), color: 'default' },
    pending_review: { text: tr('enum.drugReview.pending_review'), color: 'orange' },
    approved: { text: tr('enum.drugReview.approved'), color: 'green' },
    rejected: { text: tr('enum.drugReview.rejected'), color: 'red' },
    off_shelf: { text: tr('enum.drugReview.off_shelf'), color: 'default' },
  };
}
export const drugReviewMeta = (value?: string | null): StatusMeta => meta(drugReviewStatusMap())(value);
export const drugReviewEnum = (): Record<string, { text: string }> => enumOf(drugReviewStatusMap());

/** drug.dosage_form */
export const dosageFormText = (value?: string | null): string =>
  text({
    tablet: tr('enum.dosageForm.tablet'),
    capsule: tr('enum.dosageForm.capsule'),
    granule: tr('enum.dosageForm.granule'),
    oral_liquid: tr('enum.dosageForm.oral_liquid'),
    injection: tr('enum.dosageForm.injection'),
    external: tr('enum.dosageForm.external'),
    other: tr('enum.dosageForm.other'),
  })(value);

/** drug.source_type */
export const drugSourceText = (value?: string | null): string =>
  text({
    platform: tr('enum.drugSource.platform'),
    user_custom: tr('enum.drugSource.user_custom'),
  })(value);

/* ---------------- 计划 ---------------- */

/** medication_plan.status（shared PlanStatus） */
export function planStatusMap(): Record<string, StatusMeta> {
  return {
    [PlanStatus.Active]: { text: tr('enum.planStatus.active'), color: 'green' },
    [PlanStatus.Paused]: { text: tr('enum.planStatus.paused'), color: 'orange' },
    [PlanStatus.Finished]: { text: tr('enum.planStatus.finished'), color: 'blue' },
    [PlanStatus.Stopped]: { text: tr('enum.planStatus.stopped'), color: 'default' },
  };
}
export const planStatusMeta = (value?: string | null): StatusMeta => meta(planStatusMap())(value);
export const planStatusEnum = (): Record<string, { text: string }> => enumOf(planStatusMap());

/** medication_plan.plan_type（shared PlanType） */
export const planTypeText = (value?: string | null): string =>
  text({
    [PlanType.Scheduled]: tr('enum.planType.scheduled'),
    [PlanType.Prn]: tr('enum.planType.prn'),
  })(value);

/** plan_change_history.operator_type（shared OperatorType） */
export function operatorTypeMap(): Record<string, StatusMeta> {
  return {
    [OperatorType.MemberSelf]: { text: tr('enum.operatorType.member_self'), color: 'green' },
    [OperatorType.Caregiver]: { text: tr('enum.operatorType.caregiver'), color: 'purple' },
    [OperatorType.AdminCs]: { text: tr('enum.operatorType.admin_cs'), color: 'red' },
    [OperatorType.System]: { text: tr('enum.operatorType.system'), color: 'default' },
  };
}
export const operatorTypeMeta = (value?: string | null): StatusMeta => meta(operatorTypeMap())(value);

/* ---------------- 内容 ---------------- */

/** content_article.status */
export function articleStatusMap(): Record<string, StatusMeta> {
  return {
    draft: { text: tr('enum.articleStatus.draft'), color: 'default' },
    published: { text: tr('enum.articleStatus.published'), color: 'green' },
    offline: { text: tr('enum.articleStatus.offline'), color: 'orange' },
  };
}
export const articleStatusMeta = (value?: string | null): StatusMeta => meta(articleStatusMap())(value);
export const articleStatusEnum = (): Record<string, { text: string }> => enumOf(articleStatusMap());

/** 语言（shared AppLocale） */
export const localeText = (value?: string | null): string =>
  text({
    [AppLocale.ZhCN]: tr('common.langZhCN'),
    [AppLocale.ZhTW]: tr('common.langZhTW'),
    [AppLocale.En]: tr('common.langEn'),
  })(value);
export const LOCALES = [AppLocale.ZhCN, AppLocale.ZhTW, AppLocale.En] as const;

/** consent_document.doc_type（shared ConsentDocType） */
export const consentDocTypeText = (value?: string | null): string =>
  text({
    [ConsentDocType.UserAgreement]: tr('enum.consentDocType.user_agreement'),
    [ConsentDocType.PrivacyPolicy]: tr('enum.consentDocType.privacy_policy'),
    [ConsentDocType.AiDataUse]: tr('enum.consentDocType.ai_data_use'),
    [ConsentDocType.HealthDataProcessing]: tr('enum.consentDocType.health_data_processing'),
  })(value);
export const consentDocTypeEnum = (): Record<string, { text: string }> => ({
  [ConsentDocType.UserAgreement]: { text: tr('enum.consentDocType.user_agreement') },
  [ConsentDocType.PrivacyPolicy]: { text: tr('enum.consentDocType.privacy_policy') },
  [ConsentDocType.AiDataUse]: { text: tr('enum.consentDocType.ai_data_use') },
  [ConsentDocType.HealthDataProcessing]: { text: tr('enum.consentDocType.health_data_processing') },
});

/** consent_document.status */
export function consentStatusMap(): Record<string, StatusMeta> {
  return {
    draft: { text: tr('enum.consentStatus.draft'), color: 'default' },
    effective: { text: tr('enum.consentStatus.effective'), color: 'green' },
    superseded: { text: tr('enum.consentStatus.superseded'), color: 'orange' },
  };
}
export const consentStatusMeta = (value?: string | null): StatusMeta => meta(consentStatusMap())(value);
export const consentStatusEnum = (): Record<string, { text: string }> => enumOf(consentStatusMap());

/* ---------------- 客服裁决（disputes） ---------------- */

export function disputeStatusMap(): Record<string, StatusMeta> {
  return {
    pending: { text: tr('enum.disputeStatus.pending'), color: 'orange' },
    processing: { text: tr('enum.disputeStatus.processing'), color: 'blue' },
    resolved: { text: tr('enum.disputeStatus.resolved'), color: 'green' },
    closed: { text: tr('enum.disputeStatus.closed'), color: 'default' },
  };
}
export const disputeStatusMeta = (value?: string | null): StatusMeta => meta(disputeStatusMap())(value);
export const disputeStatusEnum = (): Record<string, { text: string }> => enumOf(disputeStatusMap());

/** 裁决结论选项（提交给 POST /admin/disputes/:id/resolve 的 decision） */
export const disputeDecisionOptions = (): { label: string; value: string }[] => [
  { label: tr('enum.disputeDecision.uphold_before'), value: 'uphold_before' },
  { label: tr('enum.disputeDecision.uphold_after'), value: 'uphold_after' },
  { label: tr('enum.disputeDecision.custom'), value: 'custom' },
];

/* ---------------- 审计 ---------------- */

/** audit_log.actor_type */
export const actorTypeText = (value?: string | null): string =>
  text({
    admin: tr('enum.actorType.admin'),
    account: tr('enum.actorType.account'),
    system: tr('enum.actorType.system'),
  })(value);

/** audit_log.result */
export function auditResultMap(): Record<string, StatusMeta> {
  return {
    success: { text: tr('enum.auditResult.success'), color: 'green' },
    denied: { text: tr('enum.auditResult.denied'), color: 'orange' },
    failed: { text: tr('enum.auditResult.failed'), color: 'red' },
  };
}
export const auditResultMeta = (value?: string | null): StatusMeta => meta(auditResultMap())(value);
export const auditResultEnum = (): Record<string, { text: string }> => enumOf(auditResultMap());

/* ---------------- 应用版本 ---------------- */

/** app_version.platform */
export const platformText = (value?: string | null): string =>
  text({
    wechat_miniapp: tr('enum.platform.wechat_miniapp'),
    android: tr('enum.platform.android'),
    ios: tr('enum.platform.ios'),
    windows: tr('enum.platform.windows'),
    linux: tr('enum.platform.linux'),
    macos: tr('enum.platform.macos'),
    web: tr('enum.platform.web'),
  })(value);
export const platformEnum = (): Record<string, { text: string }> => ({
  wechat_miniapp: { text: tr('enum.platform.wechat_miniapp') },
  android: { text: tr('enum.platform.android') },
  ios: { text: tr('enum.platform.ios') },
  windows: { text: tr('enum.platform.windows') },
  linux: { text: tr('enum.platform.linux') },
  macos: { text: tr('enum.platform.macos') },
  web: { text: tr('enum.platform.web') },
});

/** app_version.status */
export function appVersionStatusMap(): Record<string, StatusMeta> {
  return {
    active: { text: tr('enum.appVersionStatus.active'), color: 'green' },
    deprecated: { text: tr('enum.appVersionStatus.deprecated'), color: 'default' },
  };
}
export const appVersionStatusMeta = (value?: string | null): StatusMeta =>
  meta(appVersionStatusMap())(value);
export const appVersionStatusEnum = (): Record<string, { text: string }> => enumOf(appVersionStatusMap());
