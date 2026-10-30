import { useEffect, useState } from 'react';
import { Switch, Text, View } from '@tarojs/components';
import { planApi } from '../lib/endpoints';
import { toastOk } from '../lib/api';
import { currentMember, useApp } from '../lib/store';
import { themeSwitchColor } from '../lib/theme';
import { todayInTz } from '../lib/time';
import { courseLabels, frequencyLabels, mealLabels, weekdayLabels } from '../lib/dict';
import {
  cyclePresets,
  strongAlertLabels,
  type CyclePresetKey,
  type Drug,
  type Plan,
  type PlanItemInput,
  type PlanPayload,
  type PlanPhaseInput,
  type StrongAlertMode,
} from '../lib/types';
import { Btn, DatePick, ErrorLine, Field, Pick, TimePick, TxtInput } from './ui';
import { tr, useT } from '../lib/i18n';
import { DrugPicker } from './DrugPicker';

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
    doseUnit: tr('pf.defaultUnit'),
    frequencyType: 'daily',
    frequencyRule: { times: ['08:00'] },
    mealRelation: 'none',
    courseType: 'long_term',
    courseDays: null,
  };
}

function itemFromPlan(item: NonNullable<Plan['items']>[number]): ItemDraft {
  return {
    key: keySeq++,
    drug: item.drug ?? null,
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

/** 计划新建/编辑表单：药品明细（可多条）、疗程与剂量阶段、PRN、存放位置/备注、提醒周期覆盖。与 Web 端 PlanForm 同字段同口径。 */
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
  const t = useT();
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState('scheduled');
  const [startDate, setStartDate] = useState(() => todayInTz(currentMember()?.timezone ?? 'Asia/Shanghai'));
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
  const themeId = useApp((s) => s.themeId);

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
    setItems((list) =>
      list.map((it) => (it.key === key ? { ...it, frequencyRule: { ...it.frequencyRule, times } } : it)),
    );

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

  const submit = async () => {
    const invalid = items.find((it) => !it.drug && !it.drugId);
    if (invalid) {
      setError(new Error(t('pf.errNoDrug')));
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (!(Number(it.doseAmount) > 0)) {
        setError(new Error(t('pf.errDose', { n: i + 1 })));
        return;
      }
      if (it.courseType === 'fixed_days' && !(Number(it.courseDays) >= 1)) {
        setError(new Error(t('pf.errCourseDays', { n: i + 1 })));
        return;
      }
      if (planType !== 'prn' && it.frequencyType === 'weekly' && !(it.frequencyRule.weekdays?.length)) {
        setError(new Error(t('pf.errWeekday', { n: i + 1 })));
        return;
      }
    }
    if (planType !== 'prn') {
      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i]!;
        if (!(Number(ph.durationDays) >= 1 && Number(ph.dailyDoseAmount) > 0)) {
          setError(new Error(t('pf.errPhase', { n: i + 1 })));
          return;
        }
      }
    }
    setBusy(true);
    setError(null);
    const payload: PlanPayload = {
      name: name || items[0]?.drug?.genericName || t('pf.defaultName'),
      planType,
      startDate,
      endDate: endDate || null,
      storageLocation: storageLocation || undefined,
      additionalNote: additionalNote || undefined,
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
      if (plan) await planApi.update(plan.id, payload);
      else await planApi.create(memberId, payload);
      toastOk(plan ? t('pf.updatedOk') : t('pf.createdOk'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className='col' style={{ gap: '28rpx' }}>
      <Field label={t('pf.name')}>
        <TxtInput value={name} onChange={setName} placeholder={t('pf.namePlaceholder')} />
      </Field>
      <Field label={t('pf.type')}>
        <Pick
          value={planType}
          onChange={setPlanType}
          options={[
            { value: 'scheduled', label: t('pf.typeScheduled') },
            { value: 'prn', label: t('pf.typePrn') },
          ]}
        />
      </Field>
      <Field label={t('pf.startDate')}>
        <DatePick value={startDate} onChange={setStartDate} />
      </Field>
      <Field label={t('pf.endDate')}>
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <DatePick value={endDate} onChange={setEndDate} placeholder={t('pf.endDatePlaceholder')} />
          </View>
          {endDate && (
            <Btn variant='ghost' onClick={() => setEndDate('')}>
              {t('pf.clear')}
            </Btn>
          )}
        </View>
      </Field>

      {planType === 'prn' && (
        <View className='col' style={{ gap: '24rpx', background: 'var(--color-status-warning-background)', borderRadius: '20rpx', padding: '24rpx' }}>
          <Field label={t('pf.prnMinInterval')} hint={t('pf.prnMinIntervalHint')}>
            <TxtInput value={prnMinInterval} onChange={setPrnMinInterval} type='number' />
          </Field>
          <Field label={t('pf.prnMaxPerDay')}>
            <TxtInput value={prnMaxPerDay} onChange={setPrnMaxPerDay} type='number' />
          </Field>
        </View>
      )}

      <View className='col' style={{ gap: '20rpx' }}>
        <View className='row-between'>
          <Text className='tx-h' style={{ color: 'var(--color-brand-strong)' }}>
            {t('pf.itemsHead')}
          </Text>
          <Btn variant='soft' onClick={() => setItems((l) => [...l, emptyItem()])}>
            {t('pf.addItem')}
          </Btn>
        </View>
        {items.map((item, idx) => (
          <View
            key={item.key}
            className='col'
            style={{ gap: '20rpx', border: '1rpx solid var(--color-border-subtle)', borderRadius: '20rpx', padding: '24rpx' }}
          >
            <View className='row-between'>
              <Text className='tx-md tx-strong'>{t('pf.itemN', { n: idx + 1 })}</Text>
              {items.length > 1 && (
                <Btn variant='ghost' onClick={() => setItems((l) => l.filter((x) => x.key !== item.key))}>
                  {t('pf.remove')}
                </Btn>
              )}
            </View>
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
            <View className='row' style={{ gap: '16rpx', alignItems: 'flex-start' }}>
              <View className='grow'>
                <Field label={t('pf.doseAmount')}>
                  <TxtInput
                    value={String(item.doseAmount)}
                    onChange={(v) => patchItem(item.key, { doseAmount: Number(v) || 0 })}
                    type='digit'
                  />
                </Field>
              </View>
              <View className='grow'>
                <Field label={t('pf.doseUnit')}>
                  <TxtInput value={item.doseUnit} onChange={(v) => patchItem(item.key, { doseUnit: v })} />
                </Field>
              </View>
            </View>
            <Field label={t('pf.meal')}>
              <Pick
                value={item.mealRelation}
                onChange={(v) => patchItem(item.key, { mealRelation: v })}
                options={Object.entries(mealLabels()).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label={t('pf.course')}>
              <Pick
                value={item.courseType}
                onChange={(v) => patchItem(item.key, { courseType: v })}
                options={Object.entries(courseLabels()).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            {item.courseType === 'fixed_days' && (
              <Field label={t('pf.courseDays')}>
                <TxtInput
                  value={String(item.courseDays ?? '')}
                  onChange={(v) => patchItem(item.key, { courseDays: Number(v) || null })}
                  type='number'
                />
              </Field>
            )}
            {planType !== 'prn' && (
              <>
                <Field label={t('pf.frequency')}>
                  <Pick
                    value={item.frequencyType}
                    onChange={(v) => patchItem(item.key, { frequencyType: v })}
                    options={Object.entries(frequencyLabels())
                      .filter(([value]) => value !== 'on_demand' && value !== 'course_cycle')
                      .map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                {(item.frequencyType === 'daily' || item.frequencyType === 'times_per_day') && (
                  <View className='col' style={{ gap: '12rpx' }}>
                    <Text className='field-label'>{t('pf.times')}</Text>
                    {(item.frequencyRule.times ?? ['08:00']).map((tm, ti) => (
                      <View key={ti} className='row' style={{ gap: '12rpx' }}>
                        <TimePick
                          value={tm}
                          onChange={(v) => {
                            const next = [...(item.frequencyRule.times ?? [])];
                            next[ti] = v;
                            setTimes(item.key, next);
                          }}
                        />
                        {(item.frequencyRule.times ?? []).length > 1 && (
                          <Btn
                            variant='ghost'
                            onClick={() =>
                              setTimes(item.key, (item.frequencyRule.times ?? []).filter((_, x) => x !== ti))
                            }
                          >
                            {t('pf.delete')}
                          </Btn>
                        )}
                      </View>
                    ))}
                    <View>
                      <Btn variant='ghost' onClick={() => setTimes(item.key, [...(item.frequencyRule.times ?? []), '20:00'])}>
                        {t('pf.addTime')}
                      </Btn>
                    </View>
                  </View>
                )}
                {item.frequencyType === 'weekly' && (
                  <View className='col' style={{ gap: '12rpx' }}>
                    <Text className='field-label'>{t('pf.weekdays')}</Text>
                    <View className='row-wrap'>
                      {weekdayLabels().map((label, i) => {
                        const day = i + 1;
                        const active = (item.frequencyRule.weekdays ?? []).includes(day);
                        return (
                          <Btn
                            key={day}
                            variant={active ? 'primary' : 'ghost'}
                            onClick={() => toggleWeekday(item.key, day)}
                          >
                            {t('pf.weekdayBtn', { label })}
                          </Btn>
                        );
                      })}
                    </View>
                    <Text className='field-label'>{t('pf.times')}</Text>
                    <TimePick
                      value={(item.frequencyRule.times ?? ['08:00'])[0] ?? '08:00'}
                      onChange={(v) => setTimes(item.key, [v])}
                    />
                  </View>
                )}
                {item.frequencyType === 'interval_days' && (
                  <Field label={t('pf.intervalDays')}>
                    <TxtInput
                      value={String(item.frequencyRule.intervalDays ?? 2)}
                      onChange={(v) =>
                        patchItem(item.key, { frequencyRule: { ...item.frequencyRule, intervalDays: Number(v) || 2 } })
                      }
                      type='number'
                    />
                  </Field>
                )}
              </>
            )}
          </View>
        ))}
      </View>

      {planType !== 'prn' && (
        <View className='col' style={{ gap: '16rpx' }}>
          <View className='row-between'>
            <Text className='tx-h' style={{ color: 'var(--color-brand-strong)' }}>
              {t('pf.phasesHead')}
            </Text>
            <Btn
              variant='soft'
              onClick={() =>
                setPhases((p) => [
                  ...p,
                  {
                    stageNo: p.length + 1,
                    durationDays: 7,
                    dailyDoseAmount: 1,
                    dailyDoseUnit: items[0]?.doseUnit ?? t('pf.defaultUnit'),
                    note: '',
                  },
                ])
              }
            >
              {t('pf.addPhase')}
            </Btn>
          </View>
          {phases.map((ph, i) => (
            <View
              key={i}
              className='col'
              style={{ gap: '16rpx', background: 'var(--color-background-page)', borderRadius: '20rpx', padding: '20rpx' }}
            >
              <Field label={t('pf.phaseDuration', { n: i + 1 })}>
                <TxtInput
                  value={String(ph.durationDays)}
                  onChange={(v) =>
                    setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, durationDays: Number(v) || 0 } : x)))
                  }
                  type='number'
                />
              </Field>
              <View className='row' style={{ gap: '16rpx', alignItems: 'flex-start' }}>
                <View className='grow'>
                  <Field label={t('pf.phaseDailyDose')}>
                    <TxtInput
                      value={String(ph.dailyDoseAmount)}
                      onChange={(v) =>
                        setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, dailyDoseAmount: Number(v) || 0 } : x)))
                      }
                      type='digit'
                    />
                  </Field>
                </View>
                <View className='grow'>
                  <Field label={t('pf.phaseUnit')}>
                    <TxtInput
                      value={ph.dailyDoseUnit}
                      onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, dailyDoseUnit: v } : x)))}
                    />
                  </Field>
                </View>
              </View>
              <View className='row-between'>
                <Text className='tx-md'>{t('pf.phaseFinalStop')}</Text>
                <Switch
                  checked={!!ph.isFinalStop}
                  color={themeSwitchColor(themeId)}
                  onChange={(e) =>
                    setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, isFinalStop: e.detail.value } : x)))
                  }
                />
              </View>
              <Btn
                variant='ghost'
                onClick={() =>
                  setPhases((p) => p.filter((_, xi) => xi !== i).map((x, xi) => ({ ...x, stageNo: xi + 1 })))
                }
              >
                {t('pf.deletePhase')}
              </Btn>
            </View>
          ))}
          {phases.length === 0 && <Text className='tx-sm tx-sub'>{t('pf.phasesEmpty')}</Text>}
        </View>
      )}

      <Field label={t('pf.storage')} hint={t('pf.storageHint')}>
        <TxtInput value={storageLocation} onChange={setStorageLocation} placeholder={t('pf.storagePlaceholder')} />
      </Field>
      <Field label={t('pf.cycleOverride')}>
        <Pick
          value={cycleOverride}
          onChange={(v) => setCycleOverride(v as 'member' | CyclePresetKey)}
          options={[
            { value: 'member', label: t('pf.followMember') },
            ...Object.entries(cyclePresets()).map(([value, p]) => ({ value, label: p.label })),
          ]}
        />
      </Field>
      <Field label={t('pf.strongAlert')} hint={t('pf.strongAlertHint')}>
        <Pick
          value={strongAlert}
          onChange={(v) => setStrongAlert(v as 'member' | StrongAlertMode)}
          options={[
            { value: 'member', label: t('pf.followMember') },
            ...(Object.keys(strongAlertLabels()) as StrongAlertMode[]).map((value) => ({
              value,
              label: strongAlertLabels()[value],
            })),
          ]}
        />
      </Field>
      <Field label={t('pf.note')} hint={t('pf.noteHint')}>
        <TxtInput value={additionalNote} onChange={setAdditionalNote} placeholder={t('pf.notePlaceholder')} />
      </Field>

      <ErrorLine error={error} />
      <View className='row' style={{ gap: '12rpx' }}>
        <View className='grow'>
          <Btn variant='ghost' block onClick={onClose}>
            {tr('common.cancel')}
          </Btn>
        </View>
        <View className='grow'>
          <Btn block disabled={busy} onClick={submit}>
            {busy ? t('pf.saving') : plan ? t('pf.saveChanges') : t('pf.create')}
          </Btn>
        </View>
      </View>
    </View>
  );
}
