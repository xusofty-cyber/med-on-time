/**
 * 枚举 → 中文标签 / 状态色字典。
 * 取值口径优先取自 packages/shared（与 DB 附录 B 对齐）；
 * shared 未收录的后台域枚举（药品核验、文章/协议状态、工单裁决、审计、应用版本）
 * 按 services/api/prisma/schema.prisma 字段注释登记于此，禁止自创取值。
 */

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
export const accountStatusMap: Record<string, StatusMeta> = {
  active: { text: '正常', color: 'green' },
  frozen: { text: '已冻结', color: 'red' },
  cancelling: { text: '注销冷静期', color: 'orange' },
  cancelled: { text: '已注销', color: 'default' },
};
export const accountStatusMeta = meta(accountStatusMap);
export const accountStatusEnum = enumOf(accountStatusMap);

/** user_account.register_channel */
export const registerChannelText = text({
  wechat_miniapp: '微信小程序',
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
  pc: 'PC 桌面端',
});

/** member.status */
export const memberStatusMap: Record<string, StatusMeta> = {
  active: { text: '正常', color: 'green' },
  archived: { text: '已归档', color: 'orange' },
  removed: { text: '已移除', color: 'default' },
};
export const memberStatusMeta = meta(memberStatusMap);
export const memberStatusEnum = enumOf(memberStatusMap);

/** member.relationship */
export const relationshipText = text({
  self: '本人',
  father: '父亲',
  mother: '母亲',
  spouse: '配偶',
  child: '子女',
  grandparent: '祖辈',
  other_family: '其他家人',
  employer: '雇主',
  other: '其他',
});

export const genderText = text({ male: '男', female: '女', unknown: '未知' });

/* ---------------- 授权 ---------------- */

/** caregiver_authorization.status（shared AuthorizationStatus） */
export const authorizationStatusMap: Record<string, StatusMeta> = {
  pending_accept: { text: '待接受', color: 'orange' },
  active: { text: '生效中', color: 'green' },
  suspended: { text: '已暂停', color: 'gold' },
  revoked: { text: '已撤销', color: 'red' },
  expired: { text: '已过期', color: 'default' },
  rejected: { text: '已拒绝', color: 'default' },
};
export const authorizationStatusMeta = meta(authorizationStatusMap);

/** caregiver_authorization.level（shared CaregiverLevel） */
export const authLevelText = text({
  L1: 'L1 仅查看',
  L2: 'L2 可协助',
  L3: 'L3 可配置',
});

/* ---------------- 药品 ---------------- */

/** drug.review_status（schema 注释：draft / pending_review / approved / rejected / off_shelf） */
export const drugReviewStatusMap: Record<string, StatusMeta> = {
  draft: { text: '草稿', color: 'default' },
  pending_review: { text: '待核验', color: 'orange' },
  approved: { text: '已发布', color: 'green' },
  rejected: { text: '已驳回', color: 'red' },
  off_shelf: { text: '已下架', color: 'default' },
};
export const drugReviewMeta = meta(drugReviewStatusMap);
export const drugReviewEnum = enumOf(drugReviewStatusMap);

/** drug.dosage_form */
export const dosageFormText = text({
  tablet: '片剂',
  capsule: '胶囊剂',
  granule: '颗粒剂',
  oral_liquid: '口服液',
  injection: '注射剂',
  external: '外用',
  other: '其他',
});

/** drug.source_type */
export const drugSourceText = text({ platform: '平台药品库', user_custom: '用户自建' });

/* ---------------- 计划 ---------------- */

/** medication_plan.status（shared PlanStatus） */
export const planStatusMap: Record<string, StatusMeta> = {
  active: { text: '进行中', color: 'green' },
  paused: { text: '已暂停', color: 'orange' },
  finished: { text: '已完成', color: 'blue' },
  stopped: { text: '已停止', color: 'default' },
};
export const planStatusMeta = meta(planStatusMap);
export const planStatusEnum = enumOf(planStatusMap);

/** medication_plan.plan_type（shared PlanType） */
export const planTypeText = text({ scheduled: '常规计划', prn: '按需（PRN）' });

/** plan_change_history.operator_type（shared OperatorType） */
export const operatorTypeMap: Record<string, StatusMeta> = {
  member_self: { text: '成员本人', color: 'green' },
  caregiver: { text: '照护人代操作', color: 'purple' },
  admin_cs: { text: '客服裁决', color: 'red' },
  system: { text: '系统', color: 'default' },
};
export const operatorTypeMeta = meta(operatorTypeMap);

/* ---------------- 内容 ---------------- */

/** content_article.status */
export const articleStatusMap: Record<string, StatusMeta> = {
  draft: { text: '草稿', color: 'default' },
  published: { text: '已发布', color: 'green' },
  offline: { text: '已下线', color: 'orange' },
};
export const articleStatusMeta = meta(articleStatusMap);
export const articleStatusEnum = enumOf(articleStatusMap);

/** 语言（shared AppLocale） */
export const localeText = text({ 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English' });
export const LOCALES = ['zh-CN', 'zh-TW', 'en'] as const;

/** consent_document.doc_type（shared ConsentDocType） */
export const consentDocTypeText = text({
  user_agreement: '用户协议',
  privacy_policy: '隐私政策',
  ai_data_use: 'AI 数据使用',
  health_data_processing: '健康数据处理',
});
export const consentDocTypeEnum: Record<string, { text: string }> = {
  user_agreement: { text: '用户协议' },
  privacy_policy: { text: '隐私政策' },
  ai_data_use: { text: 'AI 数据使用' },
  health_data_processing: { text: '健康数据处理' },
};

/** consent_document.status */
export const consentStatusMap: Record<string, StatusMeta> = {
  draft: { text: '草稿', color: 'default' },
  effective: { text: '已生效', color: 'green' },
  superseded: { text: '已被替代', color: 'orange' },
};
export const consentStatusMeta = meta(consentStatusMap);
export const consentStatusEnum = enumOf(consentStatusMap);

/* ---------------- 客服裁决（disputes） ---------------- */

export const disputeStatusMap: Record<string, StatusMeta> = {
  pending: { text: '待裁决', color: 'orange' },
  processing: { text: '处理中', color: 'blue' },
  resolved: { text: '已裁决', color: 'green' },
  closed: { text: '已关闭', color: 'default' },
};
export const disputeStatusMeta = meta(disputeStatusMap);
export const disputeStatusEnum = enumOf(disputeStatusMap);

/** 裁决结论选项（提交给 POST /admin/disputes/:id/resolve 的 decision） */
export const disputeDecisionOptions = [
  { label: '维持变更前值（申诉方成立）', value: 'uphold_before' },
  { label: '维持变更后值（被申诉方成立）', value: 'uphold_after' },
  { label: '自定义裁定值', value: 'custom' },
];

/* ---------------- 审计 ---------------- */

/** audit_log.actor_type */
export const actorTypeText = text({ admin: '管理员', account: '用户账号', system: '系统' });

/** audit_log.result */
export const auditResultMap: Record<string, StatusMeta> = {
  success: { text: '成功', color: 'green' },
  denied: { text: '被拒绝', color: 'orange' },
  failed: { text: '失败', color: 'red' },
};
export const auditResultMeta = meta(auditResultMap);
export const auditResultEnum = enumOf(auditResultMap);

/* ---------------- 应用版本 ---------------- */

/** app_version.platform */
export const platformText = text({
  wechat_miniapp: '微信小程序',
  android: 'Android',
  ios: 'iOS',
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
  web: 'Web',
});
export const platformEnum: Record<string, { text: string }> = {
  wechat_miniapp: { text: '微信小程序' },
  android: { text: 'Android' },
  ios: { text: 'iOS' },
  windows: { text: 'Windows' },
  linux: { text: 'Linux' },
  macos: { text: 'macOS' },
  web: { text: 'Web' },
};

/** app_version.status */
export const appVersionStatusMap: Record<string, StatusMeta> = {
  active: { text: '生效中', color: 'green' },
  deprecated: { text: '已弃用', color: 'default' },
};
export const appVersionStatusMeta = meta(appVersionStatusMap);
export const appVersionStatusEnum = enumOf(appVersionStatusMap);
