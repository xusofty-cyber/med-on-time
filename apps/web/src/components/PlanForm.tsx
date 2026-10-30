import { FormEvent, useEffect, useState } from 'react';
import { planApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Button, ErrorText, Field, Select, TextInput } from './ui';
import { DrugPicker } from './DrugPicker';
import { courseLabels, frequencyLabels, mealLabels, weekdayLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
import { todayInTz } from '../lib/time';
import { cyclePresets, strongAlertLabels, type AllergyWarning, type CyclePresetKey, type Drug, type Plan, type PlanItemInput, type PlanPayload, type PlanPhaseInput, type StrongAlertMode } from '../lib/types';

interface ItemDraft extends PlanItemInput {
  key: number;
  drug: Drug | null;
}

let keySeq = 1;
function emptyItem(): ItemDraft {
  return {
    key: keySeq++,
    drug: null,
    drugId: '',
    doseAmount: 1,
    doseUnit: tr('planForm.defaultUnit'),
    frequencyType: 'daily',
    frequencyRule: { times: ['08:00'] },
    mealRelation: 'none',
    courseType: 'long_term',
    courseDays: null,
  };
}

function itemFromPlan(item: NonNullable<Plan['items']>[number]): ItemDraft {
  const fallbackDrug: Drug | null =
    item.drug ??
    (item.drugId
      ? {
          id: item.drugId,
          genericName: item.drugNameSnapshot || tr('planForm.selectedDrug'),
          dosageForm: '',
          specification: item.doseUnit ? tr('planForm.unitPrefix', { unit: item.doseUnit }) : '',
          unit: item.doseUnit,
        }
      : null);
  return {
    key: keySeq++,
    drug: fallbackDrug,
    drugId: item.drugId,
    doseAmount: Number(item.doseAmount),
    doseUnit: item.doseUnit,
    frequencyType: item.frequencyType,
    frequencyRule: item.frequencyRule ?? { times: ['08:00'] },
    mealRelation: item.mealRelation,
    courseType: item.courseType,
    courseDays: item.courseDays ?? null,
  };
}

/** 计划新建/编辑表单：药品明细（可多条）、疗程与剂量阶段、PRN、存放位置/备注、提醒周期覆盖。 */
export function PlanForm({
  memberId,
  plan,
  onClose,
  onSaved,
}: {
  memberId: string;
  plan: Plan | null; // null = 新建
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState('scheduled');
  const [startDate, setStartDate] = useState(() => todayInTz());
  const [endDate, setEndDate] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [phases, setPhases] = useState<PlanPhaseInput[]>([]);
  const [prnMinInterval, setPrnMinInterval] = useState('240');
  const [prnMaxPerDay, setPrnMaxPerDay] = useState('3');
  const [storageLocation, setStorageLocation] = useState('');
  const [additionalNote, setAdditionalNote] = useState('');
  const [cycleOverride, setCycleOverride] = useState<'member' | CyclePresetKey>('member');
  const [strongAlert, setStrongAlert] = useState<'member' | StrongAlertMode>('member');
  const tr = useT();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [allergyWarnings, setAllergyWarnings] = useState<AllergyWarning[] | null>(null);

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setPlanType(plan.planType);
      setStartDate(plan.startDate.slice(0, 10));
      setEndDate(plan.endDate ? plan.endDate.slice(0, 10) : '');
      setItems(plan.items && plan.items.length > 0 ? plan.items.map(itemFromPlan) : [emptyItem()]);
      setPhases(
        (plan.phases ?? []).map((p) => ({
          stageNo: p.stageNo,
          durationDays: p.durationDays,
          dailyDoseAmount: Number(p.dailyDoseAmount),
          dailyDoseUnit: p.dailyDoseUnit,
          isFinalStop: p.isFinalStop,
          note: p.note ?? '',
        })),
      );
      setPrnMinInterval(String(plan.prnMinIntervalMinutes ?? 240));
      setPrnMaxPerDay(String(plan.prnMaxPerDay ?? 3));
      setStorageLocation(plan.storageLocation ?? '');
      setAdditionalNote(plan.additionalNote ?? plan.note ?? '');
      setCycleOverride(plan.cyclePreset ?? 'member');
      setStrongAlert(plan.strongAlertModeOverride ?? 'member');
    }
  }, [plan]);

  const patchItem = (key: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const setTimes = (key: number, times: string[]) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, frequencyRule: { ...it.frequencyRule, times } } : it)));

  const toggleWeekday = (key: number, day: number) =>
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        const cur = new Set(it.frequencyRule.weekdays ?? []);
        if (cur.has(day)) cur.delete(day);
        else cur.add(day);
        return { ...it, frequencyRule: { ...it.frequencyRule, weekdays: [...cur].sort() } };
      }),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = items.find((it) => !it.drug && !it.drugId);
    if (invalid) {
      setError(new Error(tr('planForm.needDrug')));
      return;
    }
    setBusy(true);
    setError(null);
    const payload: PlanPayload = {
      name: name || items[0]?.drug?.genericName || tr('plan.title'),
      planType,
      startDate,
      endDate: endDate || null,
      storageLocation: storageLocation.trim() ? storageLocation.trim() : plan ? null : undefined,
      additionalNote: additionalNote.trim() ? additionalNote.trim() : plan ? null : undefined,
      /* 非 PRN 计划必须整字段缺省：传 null 会被后端按「已提供」拒绝（prn 参数仅限 prn 计划） */
      ...(planType === 'prn'
        ? { prnMinIntervalMinutes: Number(prnMinInterval), prnMaxPerDay: Number(prnMaxPerDay) }
        : {}),
      cyclePreset: cycleOverride === 'member' ? null : cycleOverride,
      cycleWindowMinutes:
        cycleOverride === 'member' ? null : cyclePresets()[cycleOverride as CyclePresetKey].windowMinutes,
      cycleIntervalMinutes:
        cycleOverride === 'member' ? null : cyclePresets()[cycleOverride as CyclePresetKey].intervalMinutes,
      strongAlertMode: strongAlert === 'member' ? null : strongAlert,
      items: items.map((it) => ({
        drugId: it.drug?.id ?? it.drugId,
        doseAmount: Number(it.doseAmount),
        doseUnit: it.doseUnit,
        frequencyType: planType === 'prn' ? 'on_demand' : it.frequencyType,
        frequencyRule: it.frequencyRule,
        mealRelation: it.mealRelation,
        courseType: it.courseType,
        courseDays: it.courseType === 'fixed_days' ? Number(it.courseDays) : null,
      })),
      phases: planType === 'prn' ? [] : phases,
    };
    try {
      const saved = plan
        ? await planApi.update(plan.id, payload)
        : await planApi.create(memberId, payload);
      if (saved.allergyWarnings && saved.allergyWarnings.length > 0) {
        // 过敏强警告：计划已保存，但必须由用户看完警告并点「我已知晓」才关闭表单
        setAllergyWarnings(saved.allergyWarnings);
        return;
      }
      actions.toast('success', plan ? tr('planForm.updatedToast') : tr('planForm.createdToast'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('planForm.nameLabel')}>
          <TextInput value={name} onChange={setName} placeholder={tr('planForm.namePlaceholder')} />
        </Field>
        <Field label={tr('planForm.typeLabel')}>
          <Select
            value={planType}
            onChange={setPlanType}
            options={[
              { value: 'scheduled', label: tr('planForm.typeScheduled') },
              { value: 'prn', label: tr('planForm.typePrn') },
            ]}
          />
        </Field>
        <Field label={tr('planForm.startDate')}>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label={tr('planForm.endDate')}>
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      {planType === 'prn' && (
        <div className="grid gap-4 rounded-xl bg-amber-50 p-4 sm:grid-cols-2">
          <Field label={tr('planForm.prnMinInterval')} hint={tr('planForm.prnMinIntervalHint')}>
            <TextInput value={prnMinInterval} onChange={setPrnMinInterval} type="number" />
          </Field>
          <Field label={tr('planForm.prnMaxPerDay')}>
            <TextInput value={prnMaxPerDay} onChange={setPrnMaxPerDay} type="number" />
          </Field>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-medgreen-dark">{tr('planForm.itemsTitle')}</h3>
          <Button variant="soft" onClick={() => setItems((l) => [...l, emptyItem()])}>
            {tr('planForm.addDrug')}
          </Button>
        </div>
        {items.map((item, idx) => (
          <div key={item.key} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{tr('planForm.drugN', { n: idx + 1 })}</span>
              {items.length > 1 && (
                <Button variant="ghost" onClick={() => setItems((l) => l.filter((x) => x.key !== item.key))}>
                  {tr('planForm.remove')}
                </Button>
              )}
            </div>
            <DrugPicker
              memberId={memberId}
              value={item.drug}
              onChange={(drug) =>
                patchItem(item.key, {
                  drug,
                  drugId: drug?.id ?? '',
                  doseUnit: drug?.unit ?? item.doseUnit,
                })
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={tr('planForm.doseLabel')}>
                <div className="flex gap-2">
                  <TextInput
                    value={String(item.doseAmount)}
                    onChange={(v) => patchItem(item.key, { doseAmount: Number(v) || 0 })}
                    type="number"
                  />
                  <TextInput value={item.doseUnit} onChange={(v) => patchItem(item.key, { doseUnit: v })} />
                </div>
              </Field>
              <Field label={tr('planForm.mealLabel')}>
                <Select
                  value={item.mealRelation}
                  onChange={(v) => patchItem(item.key, { mealRelation: v })}
                  options={Object.entries(mealLabels()).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label={tr('planForm.courseLabel')}>
                <Select
                  value={item.courseType}
                  onChange={(v) => patchItem(item.key, { courseType: v })}
                  options={Object.entries(courseLabels()).map(([value, label]) => ({ value, label }))}
                />
              </Field>
            </div>
            {item.courseType === 'fixed_days' && (
              <Field label={tr('planForm.courseDays')}>
                <TextInput
                  value={String(item.courseDays ?? '')}
                  onChange={(v) => patchItem(item.key, { courseDays: Number(v) || null })}
                  type="number"
                />
              </Field>
            )}
            {planType !== 'prn' && (
              <>
                <Field label={tr('planForm.frequency')}>
                  <Select
                    value={item.frequencyType}
                    onChange={(v) => patchItem(item.key, { frequencyType: v })}
                    options={Object.entries(frequencyLabels())
                      .filter(([value]) => value !== 'on_demand' && value !== 'course_cycle')
                      .map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                {(item.frequencyType === 'daily' || item.frequencyType === 'times_per_day') && (
                  <div>
                    <span className="field-label">{tr('planForm.timesLabel')}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {(item.frequencyRule.times ?? ['08:00']).map((t, ti) => (
                        <span key={ti} className="flex items-center gap-1">
                          <input
                            className="input w-[130px]"
                            type="time"
                            value={t}
                            onChange={(e) => {
                              const next = [...(item.frequencyRule.times ?? [])];
                              next[ti] = e.target.value;
                              setTimes(item.key, next);
                            }}
                          />
                          {(item.frequencyRule.times ?? []).length > 1 && (
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={tr('planForm.deleteTimeAria')}
                              onClick={() => setTimes(item.key, (item.frequencyRule.times ?? []).filter((_, x) => x !== ti))}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      <Button
                        variant="ghost"
                        onClick={() => setTimes(item.key, [...(item.frequencyRule.times ?? []), '20:00'])}
                      >
                        {tr('planForm.addTime')}
                      </Button>
                    </div>
                  </div>
                )}
                {item.frequencyType === 'weekly' && (
                  <div>
                    <span className="field-label">{tr('planForm.weekdaysLabel')}</span>
                    <div className="flex flex-wrap gap-2">
                      {weekdayLabels().map((label, i) => {
                        const day = i + 1;
                        const active = (item.frequencyRule.weekdays ?? []).includes(day);
                        return (
                          <button
                            type="button"
                            key={day}
                            className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => toggleWeekday(item.key, day)}
                          >
                            {tr('planForm.weekdayBtn', { label })}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3">
                      <span className="field-label">{tr('planForm.timesLabel')}</span>
                      <input
                        className="input w-[130px]"
                        type="time"
                        value={(item.frequencyRule.times ?? ['08:00'])[0] ?? '08:00'}
                        onChange={(e) => setTimes(item.key, [e.target.value])}
                      />
                    </div>
                  </div>
                )}
                {item.frequencyType === 'interval_days' && (
                  <Field label={tr('planForm.intervalDays')}>
                    <TextInput
                      value={String(item.frequencyRule.intervalDays ?? 2)}
                      onChange={(v) =>
                        patchItem(item.key, { frequencyRule: { ...item.frequencyRule, intervalDays: Number(v) || 2 } })
                      }
                      type="number"
                    />
                  </Field>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {planType !== 'prn' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-medgreen-dark">{tr('planForm.phasesTitle')}</h3>
            <Button
              variant="soft"
              onClick={() =>
                setPhases((p) => [
                  ...p,
                  { stageNo: p.length + 1, durationDays: 7, dailyDoseAmount: 1, dailyDoseUnit: items[0]?.doseUnit ?? tr('planForm.defaultUnit'), note: '' },
                ])
              }
            >
              {tr('planForm.addPhase')}
            </Button>
          </div>
          {phases.map((ph, i) => (
            <div key={i} className="grid items-end gap-3 rounded-xl bg-neutral-50 p-3 sm:grid-cols-5">
              <Field label={tr('planForm.phaseDays', { n: i + 1 })}>
                <TextInput
                  value={String(ph.durationDays)}
                  onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, durationDays: Number(v) || 0 } : x)))}
                  type="number"
                />
              </Field>
              <Field label={tr('planForm.dailyDose')}>
                <TextInput
                  value={String(ph.dailyDoseAmount)}
                  onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, dailyDoseAmount: Number(v) || 0 } : x)))}
                  type="number"
                />
              </Field>
              <Field label={tr('planForm.unit')}>
                <TextInput
                  value={ph.dailyDoseUnit}
                  onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, dailyDoseUnit: v } : x)))}
                />
              </Field>
              <label className="flex min-h-[44px] items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-brand-primary)]"
                  checked={!!ph.isFinalStop}
                  onChange={(e) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, isFinalStop: e.target.checked } : x)))}
                />
                {tr('planForm.finalStop')}
              </label>
              <Button variant="ghost" onClick={() => setPhases((p) => p.filter((_, xi) => xi !== i).map((x, xi) => ({ ...x, stageNo: xi + 1 })))}>
                {tr('planForm.deletePhase')}
              </Button>
            </div>
          ))}
          {phases.length === 0 && <p className="text-sm text-neutral-500">{tr('planForm.phasesEmpty')}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('planForm.storageLabel')} hint={tr('planForm.storageHint')}>
          <TextInput value={storageLocation} onChange={setStorageLocation} placeholder={tr('planForm.storagePlaceholder')} />
        </Field>
        <Field label={tr('planForm.cycleOverride')}>
          <Select
            value={cycleOverride}
            onChange={(v) => setCycleOverride(v as 'member' | CyclePresetKey)}
            options={[
              { value: 'member', label: tr('planForm.followMember') },
              ...Object.entries(cyclePresets()).map(([value, p]) => ({ value, label: p.label })),
            ]}
          />
        </Field>
        <Field label={tr('planForm.strongAlertOverride')} hint={tr('planForm.strongAlertHint')}>
          <Select
            value={strongAlert}
            onChange={(v) => setStrongAlert(v as 'member' | StrongAlertMode)}
            options={[
              { value: 'member', label: tr('planForm.followMember') },
              ...(Object.keys(strongAlertLabels()) as StrongAlertMode[]).map((value) => ({
                value,
                label: strongAlertLabels()[value],
              })),
            ]}
          />
        </Field>
      </div>
      <Field label={tr('planForm.noteLabel')} hint={tr('planForm.noteHint')}>
        <TextInput value={additionalNote} onChange={setAdditionalNote} placeholder={tr('planForm.notePlaceholder')} />
      </Field>

      <ErrorText error={error} />
      {allergyWarnings ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="font-semibold text-red-800">{tr('planForm.allergyTitle')}</p>
          <ul className="flex flex-col gap-1 text-sm text-red-700">
            {allergyWarnings.map((w) => (
              <li key={`${w.allergyId}-${w.drugId}`}>
                {tr('planForm.allergyLine', {
                  drug: w.drugName,
                  allergen: w.allergen,
                  match: w.matchType === 'drug' ? tr('planForm.allergyMatchDrug') : tr('planForm.allergyMatchCategory'),
                  severity: w.severity ? tr('planForm.allergySeverity', { severity: w.severity }) : '',
                })}
              </li>
            ))}
          </ul>
          <p className="text-sm text-red-700">
            {tr('planForm.allergyAdvice')}
          </p>
          <Button
            type="button"
            onClick={() => {
              actions.toast('success', plan ? tr('planForm.updatedToast') : tr('planForm.createdToast'));
              onSaved();
            }}
          >
            {tr('planForm.acknowledge')}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {tr('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? tr('planForm.saving') : plan ? tr('planForm.saveChanges') : tr('planForm.createPlan')}
          </Button>
        </div>
      )}
    </form>
  );
}
