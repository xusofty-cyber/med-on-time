/**
 * 枚举 → 标签字典（i18n 化）：取值一律来自 packages/shared 枚举与 DB 附录 B 口径。
 * 每组标签是一个函数：按当前界面语言现取（词条在 lib/i18n/*.ts 的 enum.* 命名空间），
 * 语言切换后随组件重渲染生效。键集合与改造前的静态字典完全一致。
 */
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
import { tr } from './i18n';

export function relationshipLabels(): Record<string, string> {
  return {
    self: tr('enum.relationship.self'),
    father: tr('enum.relationship.father'),
    mother: tr('enum.relationship.mother'),
    spouse: tr('enum.relationship.spouse'),
    child: tr('enum.relationship.child'),
    grandparent: tr('enum.relationship.grandparent'),
    other_family: tr('enum.relationship.other_family'),
    employer: tr('enum.relationship.employer'),
    other: tr('enum.relationship.other'),
  };
}

export function genderLabels(): Record<string, string> {
  return {
    male: tr('enum.gender.male'),
    female: tr('enum.gender.female'),
    unknown: tr('enum.gender.unknown'),
  };
}

export function planStatusLabels(): Record<string, string> {
  return {
    [PlanStatus.Active]: tr('enum.planStatus.active'),
    [PlanStatus.Paused]: tr('enum.planStatus.paused'),
    [PlanStatus.Finished]: tr('enum.planStatus.finished'),
    [PlanStatus.Stopped]: tr('enum.planStatus.stopped'),
  };
}

export function instanceStatusLabels(): Record<string, string> {
  return {
    [ReminderInstanceStatus.Pending]: tr('enum.instanceStatus.pending'),
    [ReminderInstanceStatus.Reminded]: tr('enum.instanceStatus.reminded'),
    [ReminderInstanceStatus.Taken]: tr('enum.instanceStatus.taken'),
    [ReminderInstanceStatus.Snoozed]: tr('enum.instanceStatus.snoozed'),
    [ReminderInstanceStatus.Skipped]: tr('enum.instanceStatus.skipped'),
    [ReminderInstanceStatus.Missed]: tr('enum.instanceStatus.missed'),
    [ReminderInstanceStatus.Cancelled]: tr('enum.instanceStatus.cancelled'),
  };
}

export function frequencyLabels(): Record<string, string> {
  return {
    daily: tr('enum.frequency.daily'),
    times_per_day: tr('enum.frequency.times_per_day'),
    weekly: tr('enum.frequency.weekly'),
    interval_days: tr('enum.frequency.interval_days'),
    on_demand: tr('enum.frequency.on_demand'),
    course_cycle: tr('enum.frequency.course_cycle'),
  };
}

export function mealLabels(): Record<string, string> {
  return {
    before_meal: tr('enum.meal.before_meal'),
    with_meal: tr('enum.meal.with_meal'),
    after_meal: tr('enum.meal.after_meal'),
    before_sleep: tr('enum.meal.before_sleep'),
    none: tr('enum.meal.none'),
  };
}

export function courseLabels(): Record<string, string> {
  return {
    long_term: tr('enum.course.long_term'),
    fixed_days: tr('enum.course.fixed_days'),
    until_finished: tr('enum.course.until_finished'),
  };
}

export function dosageFormLabels(): Record<string, string> {
  return {
    tablet: tr('enum.dosageForm.tablet'),
    capsule: tr('enum.dosageForm.capsule'),
    granule: tr('enum.dosageForm.granule'),
    oral_liquid: tr('enum.dosageForm.oral_liquid'),
    injection: tr('enum.dosageForm.injection'),
    external: tr('enum.dosageForm.external'),
    other: tr('enum.dosageForm.other'),
  };
}

export function severityLabels(): Record<string, string> {
  return {
    mild: tr('enum.severity.mild'),
    moderate: tr('enum.severity.moderate'),
    severe: tr('enum.severity.severe'),
  };
}

export function allergenTypeLabels(): Record<string, string> {
  return {
    [AllergenType.DrugCategory]: tr('enum.allergenType.drug_category'),
    [AllergenType.Drug]: tr('enum.allergenType.drug'),
    [AllergenType.Other]: tr('enum.allergenType.other'),
  };
}

export function authStatusLabels(): Record<string, string> {
  return {
    [AuthorizationStatus.PendingAccept]: tr('enum.authStatus.pending_accept'),
    [AuthorizationStatus.Active]: tr('enum.authStatus.active'),
    [AuthorizationStatus.Suspended]: tr('enum.authStatus.suspended'),
    [AuthorizationStatus.Revoked]: tr('enum.authStatus.revoked'),
    [AuthorizationStatus.Expired]: tr('enum.authStatus.expired'),
    [AuthorizationStatus.Rejected]: tr('enum.authStatus.rejected'),
  };
}

export function levelLabels(): Record<string, string> {
  return {
    [CaregiverLevel.L1]: tr('enum.level.L1'),
    [CaregiverLevel.L2]: tr('enum.level.L2'),
    [CaregiverLevel.L3]: tr('enum.level.L3'),
  };
}

export function operatorTypeLabels(): Record<string, string> {
  return {
    [OperatorType.MemberSelf]: tr('enum.operatorType.member_self'),
    [OperatorType.Caregiver]: tr('enum.operatorType.caregiver'),
    [OperatorType.AdminCs]: tr('enum.operatorType.admin_cs'),
    [OperatorType.System]: tr('enum.operatorType.system'),
  };
}

export function symptomTags(): { value: string; label: string }[] {
  return [
    { value: 'dizzy', label: tr('enum.symptom.dizzy') },
    { value: 'nausea', label: tr('enum.symptom.nausea') },
    { value: 'rash', label: tr('enum.symptom.rash') },
    { value: 'palpitation', label: tr('enum.symptom.palpitation') },
    { value: 'stomachache', label: tr('enum.symptom.stomachache') },
    { value: 'sleepiness', label: tr('enum.symptom.sleepiness') },
    { value: 'other', label: tr('enum.symptom.other') },
  ];
}

export function stockChangeLabels(): Record<string, string> {
  return {
    [StockChangeType.Restock]: tr('enum.stockChange.restock'),
    [StockChangeType.ManualAdjust]: tr('enum.stockChange.manual_adjust'),
    [StockChangeType.ExpiryWriteoff]: tr('enum.stockChange.expiry_writeoff'),
    [StockChangeType.IntakeDeduct]: tr('enum.stockChange.intake_deduct'),
  };
}

export function accountStatusLabels(): Record<string, string> {
  return {
    [AccountStatus.Active]: tr('enum.accountStatus.active'),
    [AccountStatus.Frozen]: tr('enum.accountStatus.frozen'),
    [AccountStatus.Cancelling]: tr('enum.accountStatus.cancelling'),
    [AccountStatus.Cancelled]: tr('enum.accountStatus.cancelled'),
  };
}

/** 周一到周日 */
export function weekdayLabels(): string[] {
  return [
    tr('enum.weekday.1'),
    tr('enum.weekday.2'),
    tr('enum.weekday.3'),
    tr('enum.weekday.4'),
    tr('enum.weekday.5'),
    tr('enum.weekday.6'),
    tr('enum.weekday.7'),
  ];
}
