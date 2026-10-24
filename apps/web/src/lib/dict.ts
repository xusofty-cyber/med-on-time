/** 枚举 → 中文标签字典（取值一律来自 packages/shared 枚举与 DB 附录 B 口径）。 */
import {
  AccountStatus,
  AllergenType,
  AuthorizationStatus,
  CaregiverLevel,
  OperatorType,
  PlanStatus,
  ReminderInstanceStatus,
  StockChangeType,
} from '@med-on-time/shared';

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
  [PlanStatus.Active]: '进行中',
  [PlanStatus.Paused]: '已暂停',
  [PlanStatus.Finished]: '已完成',
  [PlanStatus.Stopped]: '已停止',
};

export const INSTANCE_STATUS_LABELS: Record<string, string> = {
  [ReminderInstanceStatus.Pending]: '待提醒',
  [ReminderInstanceStatus.Reminded]: '待服用',
  [ReminderInstanceStatus.Taken]: '已服用',
  [ReminderInstanceStatus.Snoozed]: '已稍后',
  [ReminderInstanceStatus.Skipped]: '已跳过',
  [ReminderInstanceStatus.Missed]: '已漏服',
  [ReminderInstanceStatus.Cancelled]: '已取消',
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
  [AllergenType.DrugCategory]: '药物类别',
  [AllergenType.Drug]: '具体药品',
  [AllergenType.Other]: '其他过敏原',
};

export const AUTH_STATUS_LABELS: Record<string, string> = {
  [AuthorizationStatus.PendingAccept]: '待接受',
  [AuthorizationStatus.Active]: '生效中',
  [AuthorizationStatus.Suspended]: '已暂停',
  [AuthorizationStatus.Revoked]: '已撤销',
  [AuthorizationStatus.Expired]: '已过期',
  [AuthorizationStatus.Rejected]: '已拒绝',
};

export const LEVEL_LABELS: Record<string, string> = {
  [CaregiverLevel.L1]: 'L1 仅查看',
  [CaregiverLevel.L2]: 'L2 可协助打卡',
  [CaregiverLevel.L3]: 'L3 可配置计划',
};

export const OPERATOR_TYPE_LABELS: Record<string, string> = {
  [OperatorType.MemberSelf]: '成员本人',
  [OperatorType.Caregiver]: '照护人',
  [OperatorType.AdminCs]: '客服',
  [OperatorType.System]: '系统',
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
  [StockChangeType.Restock]: '补货入库',
  [StockChangeType.ManualAdjust]: '手动调整',
  [StockChangeType.ExpiryWriteoff]: '过期作废',
  [StockChangeType.IntakeDeduct]: '服药扣减',
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  [AccountStatus.Active]: '正常',
  [AccountStatus.Frozen]: '已冻结',
  [AccountStatus.Cancelling]: '注销冷静期中',
  [AccountStatus.Cancelled]: '已注销',
};

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
