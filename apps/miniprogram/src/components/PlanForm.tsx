import { useEffect, useState } from 'react';
import { Switch, Text, View } from '@tarojs/components';
import { planApi } from '../lib/endpoints';
import { toastOk } from '../lib/api';
import { COURSE_LABELS, FREQUENCY_LABELS, MEAL_LABELS, WEEKDAY_LABELS } from '../lib/dict';
import {
  CYCLE_PRESETS,
  type CyclePresetKey,
  type Drug,
  type Plan,
  type PlanItemInput,
  type PlanPayload,
  type PlanPhaseInput,
} from '../lib/types';
import { Btn, DatePick, ErrorLine, Field, Pick, TimePick, TxtInput } from './ui';
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
    doseUnit: '片',
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
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState('scheduled');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [phases, setPhases] = useState<PlanPhaseInput[]>([]);
  const [prnMinInterval, setPrnMinInterval] = useState('240');
  const [prnMaxPerDay, setPrnMaxPerDay] = useState('3');
  const [storageLocation, setStorageLocation] = useState('');
  const [additionalNote, setAdditionalNote] = useState('');
  const [cycleOverride, setCycleOverride] = useState<'member' | CyclePresetKey>('member');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

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
      storageLocation: storageLocation || undefined,
      additionalNote: additionalNote || undefined,
      /* 非 PRN 计划必须整字段缺省：传 null 会被后端按「已提供」拒绝（prn 参数仅限 prn 计划） */
      ...(planType === 'prn'
        ? { prnMinIntervalMinutes: Number(prnMinInterval), prnMaxPerDay: Number(prnMaxPerDay) }
        : {}),
      cyclePreset: cycleOverride === 'member' ? null : cycleOverride,
      cycleWindowMinutes:
        cycleOverride === 'member' ? null : CYCLE_PRESETS[cycleOverride as CyclePresetKey].windowMinutes,
      cycleIntervalMinutes:
        cycleOverride === 'member' ? null : CYCLE_PRESETS[cycleOverride as CyclePresetKey].intervalMinutes,
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
      toastOk(plan ? '计划已更新，变更会记入变更史' : '计划已创建');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className='col' style={{ gap: '28rpx' }}>
      <Field label='计划名称'>
        <TxtInput value={name} onChange={setName} placeholder='如：早晨降压药' />
      </Field>
      <Field label='计划类型'>
        <Pick
          value={planType}
          onChange={setPlanType}
          options={[
            { value: 'scheduled', label: '常规计划（按时提醒）' },
            { value: 'prn', label: 'PRN 按需（不生成提醒，服药时记录）' },
          ]}
        />
      </Field>
      <Field label='开始日期'>
        <DatePick value={startDate} onChange={setStartDate} />
      </Field>
      <Field label='结束日期（长期计划可留空）'>
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <DatePick value={endDate} onChange={setEndDate} placeholder='长期（不设结束）' />
          </View>
          {endDate && (
            <Btn variant='ghost' onClick={() => setEndDate('')}>
              清除
            </Btn>
          )}
        </View>
      </Field>

      {planType === 'prn' && (
        <View className='col' style={{ gap: '24rpx', background: '#FFFBEB', borderRadius: '20rpx', padding: '24rpx' }}>
          <Field label='最短间隔（分钟）' hint='两次按需服药之间至少间隔'>
            <TxtInput value={prnMinInterval} onChange={setPrnMinInterval} type='number' />
          </Field>
          <Field label='每日最多次数'>
            <TxtInput value={prnMaxPerDay} onChange={setPrnMaxPerDay} type='number' />
          </Field>
        </View>
      )}

      <View className='col' style={{ gap: '20rpx' }}>
        <View className='row-between'>
          <Text className='tx-h' style={{ color: '#084C38' }}>
            药品明细
          </Text>
          <Btn variant='soft' onClick={() => setItems((l) => [...l, emptyItem()])}>
            + 再加一种药
          </Btn>
        </View>
        {items.map((item, idx) => (
          <View
            key={item.key}
            className='col'
            style={{ gap: '20rpx', border: '1rpx solid #E3E8E5', borderRadius: '20rpx', padding: '24rpx' }}
          >
            <View className='row-between'>
              <Text className='tx-md tx-strong'>药品 {idx + 1}</Text>
              {items.length > 1 && (
                <Btn variant='ghost' onClick={() => setItems((l) => l.filter((x) => x.key !== item.key))}>
                  移除
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
                <Field label='每次剂量'>
                  <TxtInput
                    value={String(item.doseAmount)}
                    onChange={(v) => patchItem(item.key, { doseAmount: Number(v) || 0 })}
                    type='digit'
                  />
                </Field>
              </View>
              <View className='grow'>
                <Field label='剂量单位'>
                  <TxtInput value={item.doseUnit} onChange={(v) => patchItem(item.key, { doseUnit: v })} />
                </Field>
              </View>
            </View>
            <Field label='与餐关系'>
              <Pick
                value={item.mealRelation}
                onChange={(v) => patchItem(item.key, { mealRelation: v })}
                options={Object.entries(MEAL_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label='疗程'>
              <Pick
                value={item.courseType}
                onChange={(v) => patchItem(item.key, { courseType: v })}
                options={Object.entries(COURSE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            {item.courseType === 'fixed_days' && (
              <Field label='疗程天数'>
                <TxtInput
                  value={String(item.courseDays ?? '')}
                  onChange={(v) => patchItem(item.key, { courseDays: Number(v) || null })}
                  type='number'
                />
              </Field>
            )}
            {planType !== 'prn' && (
              <>
                <Field label='频次'>
                  <Pick
                    value={item.frequencyType}
                    onChange={(v) => patchItem(item.key, { frequencyType: v })}
                    options={Object.entries(FREQUENCY_LABELS)
                      .filter(([value]) => value !== 'on_demand' && value !== 'course_cycle')
                      .map(([value, label]) => ({ value, label }))}
                  />
                </Field>
                {(item.frequencyType === 'daily' || item.frequencyType === 'times_per_day') && (
                  <View className='col' style={{ gap: '12rpx' }}>
                    <Text className='field-label'>服用时刻</Text>
                    {(item.frequencyRule.times ?? ['08:00']).map((t, ti) => (
                      <View key={ti} className='row' style={{ gap: '12rpx' }}>
                        <TimePick
                          value={t}
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
                            删除
                          </Btn>
                        )}
                      </View>
                    ))}
                    <View>
                      <Btn variant='ghost' onClick={() => setTimes(item.key, [...(item.frequencyRule.times ?? []), '20:00'])}>
                        + 时刻
                      </Btn>
                    </View>
                  </View>
                )}
                {item.frequencyType === 'weekly' && (
                  <View className='col' style={{ gap: '12rpx' }}>
                    <Text className='field-label'>每周哪几天</Text>
                    <View className='row-wrap'>
                      {WEEKDAY_LABELS.map((label, i) => {
                        const day = i + 1;
                        const active = (item.frequencyRule.weekdays ?? []).includes(day);
                        return (
                          <Btn
                            key={day}
                            variant={active ? 'primary' : 'ghost'}
                            onClick={() => toggleWeekday(item.key, day)}
                          >
                            周{label}
                          </Btn>
                        );
                      })}
                    </View>
                    <Text className='field-label'>服用时刻</Text>
                    <TimePick
                      value={(item.frequencyRule.times ?? ['08:00'])[0] ?? '08:00'}
                      onChange={(v) => setTimes(item.key, [v])}
                    />
                  </View>
                )}
                {item.frequencyType === 'interval_days' && (
                  <Field label='每隔几天服一次'>
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
            <Text className='tx-h' style={{ color: '#084C38' }}>
              剂量阶段（可选）
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
                    dailyDoseUnit: items[0]?.doseUnit ?? '片',
                    note: '',
                  },
                ])
              }
            >
              + 添加阶段
            </Btn>
          </View>
          {phases.map((ph, i) => (
            <View
              key={i}
              className='col'
              style={{ gap: '16rpx', background: '#F6F8F7', borderRadius: '20rpx', padding: '20rpx' }}
            >
              <Field label={`第 ${i + 1} 阶段 · 持续天数`}>
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
                  <Field label='每日总剂量'>
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
                  <Field label='单位'>
                    <TxtInput
                      value={ph.dailyDoseUnit}
                      onChange={(v) => setPhases((p) => p.map((x, xi) => (xi === i ? { ...x, dailyDoseUnit: v } : x)))}
                    />
                  </Field>
                </View>
              </View>
              <View className='row-between'>
                <Text className='tx-md'>末阶段停药</Text>
                <Switch
                  checked={!!ph.isFinalStop}
                  color='#0B6B4F'
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
                删除阶段
              </Btn>
            </View>
          ))}
          {phases.length === 0 && <Text className='tx-sm tx-sub'>不设阶段时全程按明细剂量执行。</Text>}
        </View>
      )}

      <Field label='存放位置（R-1）' hint='会显示在具体提醒里，如：客厅药盒'>
        <TxtInput value={storageLocation} onChange={setStorageLocation} placeholder='如：卧室床头柜第二层' />
      </Field>
      <Field label='提醒周期覆盖'>
        <Pick
          value={cycleOverride}
          onChange={(v) => setCycleOverride(v as 'member' | CyclePresetKey)}
          options={[
            { value: 'member', label: '跟随成员设置' },
            ...Object.entries(CYCLE_PRESETS).map(([value, p]) => ({ value, label: p.label })),
          ]}
        />
      </Field>
      <Field label='附加备注（R-1）' hint='如：需整片吞服、不可掰开'>
        <TxtInput value={additionalNote} onChange={setAdditionalNote} placeholder='补充说明，可留空' />
      </Field>

      <ErrorLine error={error} />
      <View className='row' style={{ gap: '12rpx' }}>
        <View className='grow'>
          <Btn variant='ghost' block onClick={onClose}>
            取消
          </Btn>
        </View>
        <View className='grow'>
          <Btn block disabled={busy} onClick={submit}>
            {busy ? '保存中…' : plan ? '保存修改' : '创建计划'}
          </Btn>
        </View>
      </View>
    </View>
  );
}
