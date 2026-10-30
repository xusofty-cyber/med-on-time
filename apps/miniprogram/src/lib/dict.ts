/** 枚举 → 标签字典（i18n 化：全部改为函数，调用时按当前语言现取；取值一律来自 packages/shared 枚举与 DB 附录 B 口径）。 */
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
    active: tr('enum.planStatus.active'),
    paused: tr('enum.planStatus.paused'),
    finished: tr('enum.planStatus.finished'),
    stopped: tr('enum.planStatus.stopped'),
  };
}

export function instanceStatusLabels(): Record<string, string> {
  return {
    pending: tr('enum.instanceStatus.pending'),
    reminded: tr('enum.instanceStatus.reminded'),
    taken: tr('enum.instanceStatus.taken'),
    snoozed: tr('enum.instanceStatus.snoozed'),
    skipped: tr('enum.instanceStatus.skipped'),
    missed: tr('enum.instanceStatus.missed'),
    cancelled: tr('enum.instanceStatus.cancelled'),
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
    drug_category: tr('enum.allergenType.drug_category'),
    drug: tr('enum.allergenType.drug'),
    other: tr('enum.allergenType.other'),
  };
}

export function authStatusLabels(): Record<string, string> {
  return {
    pending_accept: tr('enum.authStatus.pending_accept'),
    active: tr('enum.authStatus.active'),
    suspended: tr('enum.authStatus.suspended'),
    revoked: tr('enum.authStatus.revoked'),
    expired: tr('enum.authStatus.expired'),
    rejected: tr('enum.authStatus.rejected'),
  };
}

export function levelLabels(): Record<string, string> {
  return {
    L1: tr('enum.level.L1'),
    L2: tr('enum.level.L2'),
    L3: tr('enum.level.L3'),
  };
}

export function operatorTypeLabels(): Record<string, string> {
  return {
    member_self: tr('enum.operatorType.member_self'),
    caregiver: tr('enum.operatorType.caregiver'),
    admin_cs: tr('enum.operatorType.admin_cs'),
    system: tr('enum.operatorType.system'),
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
    restock: tr('enum.stockChange.restock'),
    manual_adjust: tr('enum.stockChange.manual_adjust'),
    expiry_writeoff: tr('enum.stockChange.expiry_writeoff'),
    intake_deduct: tr('enum.stockChange.intake_deduct'),
  };
}

export function accountStatusLabels(): Record<string, string> {
  return {
    active: tr('enum.accountStatus.active'),
    frozen: tr('enum.accountStatus.frozen'),
    cancelling: tr('enum.accountStatus.cancelling'),
    cancelled: tr('enum.accountStatus.cancelled'),
  };
}

/** 周一为首的星期标签（索引 0=周一 … 6=周日）。 */
export function weekdayLabels(): string[] {
  return [
    tr('enum.weekday.1'),
    tr('enum.weekday.2'),
    tr('enum.weekday.3'),
    tr('enum.weekday.4'),
    tr('enum.weekday.5'),
    tr('enum.weekday.6'),
    tr('enum.weekday.0'),
  ];
}
