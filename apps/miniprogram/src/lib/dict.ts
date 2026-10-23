/** 枚举 → 中文标签字典（取值一律来自 packages/shared 枚举与 DB 附录 B 口径）。 */

export const RELATIONSHIP_LABELS: Record<string, string> = {
  self: '本人',
  father: '父亲',
  mother: '母亲',
  spouse: '配偶',
  child: '子女',
  grandparent: '祖辈',
  other_family: '其他家人',
  employer: '雇主',
  other: '其他',
};

export const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  unknown: '未填写',
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  paused: '已暂停',
  finished: '已完成',
  stopped: '已停止',
};

export const INSTANCE_STATUS_LABELS: Record<string, string> = {
  pending: '待提醒',
  reminded: '待服用',
  taken: '已服用',
  snoozed: '已稍后',
  skipped: '已跳过',
  missed: '已漏服',
  cancelled: '已取消',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: '每日',
  times_per_day: '每日多次',
  weekly: '每周',
  interval_days: '间隔天数',
  on_demand: '按需',
  course_cycle: '疗程循环',
};

export const MEAL_LABELS: Record<string, string> = {
  before_meal: '饭前',
  with_meal: '随餐',
  after_meal: '饭后',
  before_sleep: '睡前',
  none: '不限',
};

export const COURSE_LABELS: Record<string, string> = {
  long_term: '长期',
  fixed_days: '固定天数',
  until_finished: '服完为止',
};

export const DOSAGE_FORM_LABELS: Record<string, string> = {
  tablet: '片剂',
  capsule: '胶囊',
  granule: '颗粒',
  oral_liquid: '口服液',
  injection: '注射剂',
  external: '外用',
  other: '其他',
};

export const SEVERITY_LABELS: Record<string, string> = {
  mild: '轻微',
  moderate: '中等',
  severe: '严重',
};

export const ALLERGEN_TYPE_LABELS: Record<string, string> = {
  drug_category: '药物类别',
  drug: '具体药品',
  other: '其他过敏原',
};

export const AUTH_STATUS_LABELS: Record<string, string> = {
  pending_accept: '待接受',
  active: '生效中',
  suspended: '已暂停',
  revoked: '已撤销',
  expired: '已过期',
  rejected: '已拒绝',
};

export const LEVEL_LABELS: Record<string, string> = {
  L1: 'L1 仅查看',
  L2: 'L2 可协助打卡',
  L3: 'L3 可配置计划',
};

export const OPERATOR_TYPE_LABELS: Record<string, string> = {
  member_self: '成员本人',
  caregiver: '照护人',
  admin_cs: '客服',
  system: '系统',
};

export const SYMPTOM_TAGS: { value: string; label: string }[] = [
  { value: 'dizzy', label: '头晕' },
  { value: 'nausea', label: '恶心' },
  { value: 'rash', label: '皮疹' },
  { value: 'palpitation', label: '心悸' },
  { value: 'stomachache', label: '胃痛' },
  { value: 'sleepiness', label: '嗜睡' },
  { value: 'other', label: '其他' },
];

export const STOCK_CHANGE_LABELS: Record<string, string> = {
  restock: '补货入库',
  manual_adjust: '手动调整',
  expiry_writeoff: '过期作废',
  intake_deduct: '服药扣减',
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  frozen: '已冻结',
  cancelling: '注销冷静期中',
  cancelled: '已注销',
};

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
