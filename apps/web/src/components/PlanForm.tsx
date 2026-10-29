import { FormEvent, useEffect, useState } from 'react';
import { planApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Button, ErrorText, Field, Select, TextInput } from './ui';
import { DrugPicker } from './DrugPicker';
import { COURSE_LABELS, FREQUENCY_LABELS, MEAL_LABELS, WEEKDAY_LABELS } from '../lib/dict';
import { todayInTz } from '../lib/time';
import { CYCLE_PRESETS, STRONG_ALERT_LABELS, type AllergyWarning, type CyclePresetKey, type Drug, type Plan, type PlanItemInput, type PlanPayload, type PlanPhaseInput, type StrongAlertMode } from '../lib/types';

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
    doseUnit: '片',
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
          genericName: item.drugNameSnapshot || '已选药品',
          dosageForm: '',
          specification: item.doseUnit ? `单位：${item.doseUnit}` : '',
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
      setError(new Error('每条明细都要先搜索选择药品'));
      return;
    }
    setBusy(true);
    setError(null);
    const payload: PlanPayload = {
      name: name || items[0]?.drug?.genericName || '用药计划',
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
        cycleOverride === 'member' ? null : CYCLE_PRESETS[cycleOverride as CyclePresetKey].windowMinutes,
      cycleIntervalMinutes:
        cycleOverride === 'member' ? null : CYCLE_PRESETS[cycleOverride as CyclePresetKey].intervalMinutes,
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
      actions.toast('success', plan ? '计划已更新，变更会记入变更史' : '计划已创建');
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
        <Field label="计划名称">
          <TextInput value={name} onChange={setName} placeholder="如：早晨降压药" />
        </Field>
        <Field label="计划类型">
          <Select
            value={planType}
            onChange={setPlanType}
            options={[
              { value: 'scheduled', label: '常规计划（按时提醒）' },
              { value: 'prn', label: 'PRN 按需（不生成提醒，服药时记录）' },
            ]}
          />
        </Field>
        <Field label="开始日期">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="结束日期（长期计划可留空）">
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      {planType === 'prn' && (
        <div className="grid gap-4 rounded-xl bg-amber-50 p-4 sm:grid-cols-2">
          <Field label="最短间隔（分钟）" hint="两次按需服药之间至少间隔">
            <TextInput value={prnMinInterval} onChange={setPrnMinInterval} type="number" />
          </Field>
          <Field label="每日最多次数">
            <TextInput value={prnMaxPerDay} onChange={setPrnMaxPerDay} type="number" />
          </Field>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-medgreen-dark">药品明细</h3>
          <Button variant="soft" onClick={() => setItems((l) => [...l, emptyItem()])}>
            + 再加一种药
          </Button>
        </div>
        {items.map((item, idx) => (
          <div key={item.key} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">药品 {idx + 1}</span>
              {items.length > 1 && (
                <Button variant="ghost" onClick={() => setItems((l) => l.filter((x) => x.key !== item.key))}>
                  移除
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
              <Field label="每次剂量">
                <div className="flex gap-2">
                  <TextInput
                    value={String(item.doseAmount)}
                    onChange={(v) => patchItem(item.key, { doseAmount: Number(v) || 0 })}
                    type="number"
                  />
                  <TextInput value={item.doseUnit} onChange={(v) => patchItem(item.key, { doseUnit: v })} />
                </div>
              </Field>
              <Field label="与餐关系">
                <Select
                  value={item.mealRelation}
                  onChange={(v) => patchItem(item.key, { mealRelation: v })}
                  options={Object.entries(MEAL_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label="疗程">
                <Select
                  value={item.courseType}
                  onChange={(v) => patchItem(item.key, { courseType: v })}
                  options={Object.entries(COURSE_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </Field>
            </div>
            {item.courseType === 'fixed_days' && (
              <Field label="疗程天数">
                <TextInput
                  value={String(item.courseDays ?? '')}
                  onChange={(v) => patchItem(item.key, { courseDays: Number(v) || null })}
                  type="number"
                />
              </Field>
            )}
            {planType !== 'prn' && (
              <>
                <Field label="频次">
                  <Select
                    value={item.frequencyType}
                    onChange={(v) => patchItem(item.key, { frequencyType: v })}
                    options={Object.entries(FREQUENCY_LABELS)
                      .filter(([value]) => value !== 'on_demand' && value !== 'course_cycle')
                      .map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                {(item.frequencyType === 'daily' || item.frequencyType === 'times_per_day') && (
                  <div>
                    <span className="field-label">服用时刻</span>
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
                              aria-label="删除时刻"
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
                        + 时刻
                      </Button>
                    </div>
                  </div>
                )}
                {item.frequencyType === 'weekly' && (
                  <div>
                    <span className="field-label">每周哪几天</span>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_LABELS.map((label, i) => {
                        const day = i + 1;
                        const active = (item.frequencyRule.weekdays ?? []).includes(day);
                        return (
                          <button
                            type="button"
                            key={day}
                            className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => toggleWeekday(item.key, day)}
                          >
                            周{label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3">
                      <span className="field-label">服用时刻</span>
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
                  <Field label="每隔几天服一次">
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
            <h3 className="font-semibold text-medgreen-dark">剂量阶段（疗程递减/递增，可选）</h3>
            <Button
              variant="soft"
              onClick={() =>
                setPhases((p) => [
                  ...p,
                  { stageNo: p.length + 1, durationDays: 7, dailyDoseAmount: 1, dailyDoseUnit: items[0]?.doseUnit ?? '片', note: '' },
                ])
              }
            >
              + 添加阶段
            </Button>
          </div>
          {phases.map((ph, i) => (
            <div key={i} className="grid items-end gap-3 rounded-xl bg-neutral-50 p-3 sm:grid-cols-5">
              <Field label={`第 ${i + 1} 阶段 · 持续天数`}>
                <TextInput
                  value={String(ph.durationDays)}
                  onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, durationDays: Number(v) || 0 } : x)))}
                  type="number"
                />
              </Field>
              <Field label="每日总剂量">
                <TextInput
                  value={String(ph.dailyDoseAmount)}
                  onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, dailyDoseAmount: Number(v) || 0 } : x)))}
                  type="number"
                />
              </Field>
              <Field label="单位">
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
                末阶段停药
              </label>
              <Button variant="ghost" onClick={() => setPhases((p) => p.filter((_, xi) => xi !== i).map((x, xi) => ({ ...x, stageNo: xi + 1 })))}>
                删除阶段
              </Button>
            </div>
          ))}
          {phases.length === 0 && <p className="text-sm text-neutral-500">不设阶段时全程按明细剂量执行。</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="存放位置（R-1）" hint="会显示在具体提醒里，如：客厅药盒">
          <TextInput value={storageLocation} onChange={setStorageLocation} placeholder="如：卧室床头柜第二层" />
        </Field>
        <Field label="提醒周期覆盖">
          <Select
            value={cycleOverride}
            onChange={(v) => setCycleOverride(v as 'member' | CyclePresetKey)}
            options={[
              { value: 'member', label: '跟随成员设置' },
              ...Object.entries(CYCLE_PRESETS).map(([value, p]) => ({ value, label: p.label })),
            ]}
          />
        </Field>
        <Field label="强提醒方式覆盖（安卓/桌面端）" hint="闹钟与语音互斥，二选一">
          <Select
            value={strongAlert}
            onChange={(v) => setStrongAlert(v as 'member' | StrongAlertMode)}
            options={[
              { value: 'member', label: '跟随成员设置' },
              ...(Object.keys(STRONG_ALERT_LABELS) as StrongAlertMode[]).map((value) => ({
                value,
                label: STRONG_ALERT_LABELS[value],
              })),
            ]}
          />
        </Field>
      </div>
      <Field label="附加备注（R-1）" hint="如：需整片吞服、不可掰开">
        <TextInput value={additionalNote} onChange={setAdditionalNote} placeholder="补充说明，可留空" />
      </Field>

      <ErrorText error={error} />
      {allergyWarnings ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="font-semibold text-red-800">⚠ 过敏风险警告（计划已保存）</p>
          <ul className="flex flex-col gap-1 text-sm text-red-700">
            {allergyWarnings.map((w) => (
              <li key={`${w.allergyId}-${w.drugId}`}>
                「{w.drugName}」与过敏档案「{w.allergen}」命中
                （{w.matchType === 'drug' ? '同一药品' : '同类药品'}
                {w.severity ? `，严重程度：${w.severity}` : ''}）
              </li>
            ))}
          </ul>
          <p className="text-sm text-red-700">
            请确认您已知晓上述过敏风险。如系误报或病情已变化，请先到健康档案修正过敏信息，或删除该计划重新制定。
          </p>
          <Button
            type="button"
            onClick={() => {
              actions.toast('success', plan ? '计划已更新，变更会记入变更史' : '计划已创建');
              onSaved();
            }}
          >
            我已知晓
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? '保存中…' : plan ? '保存修改' : '创建计划'}
          </Button>
        </div>
      )}
    </form>
  );
}
