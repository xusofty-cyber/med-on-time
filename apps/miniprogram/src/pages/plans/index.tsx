import { useCallback, useEffect, useState } from 'react';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { planApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { FREQUENCY_LABELS, OPERATOR_TYPE_LABELS, PLAN_STATUS_LABELS } from '../../lib/dict';
import { fmtDate, fmtDateTime } from '../../lib/time';
import type { Plan, PlanChangeHistoryEntry } from '../../lib/types';
import { Badge, Btn, Card, EmptyState, ErrorLine, Loading, Sheet } from '../../components/ui';
import { MemberBar } from '../../components/MemberBar';

/** 用药计划（tab）：列表、新建/编辑入口、暂停/恢复、变更史、删除。与 Web 端 Plans 同逻辑。 */
export default function Plans() {
  useSessionGuard();
  const memberId = useApp((s) => s.currentMemberId);
  const members = useApp((s) => s.members);
  const current = members.find((m) => m.id === memberId) ?? null;
  const canEdit = !current?.accessLevel || current.accessLevel === 'owner' || current.accessLevel === 'L3';
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [historyOf, setHistoryOf] = useState<Plan | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      setPlans(await planApi.list(memberId));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [memberId]);

  useEffect(() => {
    setPlans(null);
    void load();
  }, [load]);
  useDidShow(() => void load());
  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  const togglePause = async (plan: Plan) => {
    setBusyId(plan.id);
    try {
      if (plan.status === 'paused') {
        await planApi.resume(plan.id);
        toastOk('计划已恢复，提醒将继续生成');
      } else {
        await planApi.pause(plan.id);
        toastOk('计划已暂停，暂停期间不再提醒');
      }
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (plan: Plan) => {
    const res = await Taro.showModal({
      title: '删除计划',
      content: `确定删除计划「${plan.name}」吗？历史打卡与变更史仍会保留。`,
      confirmText: '删除',
      confirmColor: '#DC2626',
    });
    if (!res.confirm) return;
    try {
      await planApi.remove(plan.id);
      toastOk('计划已删除');
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  const openEdit = (planId?: string) => {
    Taro.navigateTo({ url: `/pages/plan-edit/index${planId ? `?planId=${planId}` : ''}` });
  };

  return (
    <View className='pg'>
      <MemberBar />
      <View className='row-between'>
        <Text className='tx-title'>用药计划</Text>
        {canEdit && memberId && <Btn onClick={() => openEdit()}>+ 新建计划</Btn>}
      </View>
      {!canEdit && memberId && (
        <Text className='tx-md tx-sub'>当前授权级别为仅查看/协助，不能新建或编辑计划（需 L3 或成员本人账号）。</Text>
      )}
      <ErrorLine error={error} />
      {!memberId ? (
        <Card>
          <EmptyState text='请先添加成员，再为其建立用药计划。' />
        </Card>
      ) : plans === null ? (
        <Loading text='正在加载计划…' />
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState text='该成员还没有用药计划，点击「新建计划」添加第一种药。' />
        </Card>
      ) : (
        <View className='col' style={{ gap: '24rpx' }}>
          {plans.map((plan) => (
            <Card key={plan.id}>
              <View className='row-wrap'>
                <Text className='tx-h'>{plan.name}</Text>
                <Badge tone={plan.planType === 'prn' ? 'blue' : 'green'}>
                  {plan.planType === 'prn' ? 'PRN 按需' : '常规'}
                </Badge>
                <Badge tone={plan.status === 'active' ? 'green' : plan.status === 'paused' ? 'amber' : 'gray'}>
                  {PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                </Badge>
              </View>
              <Text className='tx-md tx-sub' style={{ display: 'block', marginTop: '8rpx' }}>
                {fmtDate(plan.startDate)} 起{plan.endDate ? ` 至 ${fmtDate(plan.endDate)}` : '（长期）'}
                {plan.storageLocation ? ` · 存放：${plan.storageLocation}` : ''}
              </Text>
              {plan.additionalNote && (
                <Text className='tx-md tx-sub' style={{ display: 'block', marginTop: '4rpx' }}>
                  备注：{plan.additionalNote}
                </Text>
              )}
              <View className='col' style={{ gap: '10rpx', marginTop: '16rpx' }}>
                {(plan.items ?? []).map((item) => (
                  <View key={item.id} style={{ background: '#F6F8F7', borderRadius: '16rpx', padding: '14rpx 18rpx' }}>
                    <Text className='tx-md'>
                      <Text className='tx-strong'>{item.drugNameSnapshot}</Text>
                      <Text className='tx-sub'>
                        {' '}
                        每次 {Number(item.doseAmount)}
                        {item.doseUnit} · {FREQUENCY_LABELS[item.frequencyType] ?? item.frequencyType}
                        {item.frequencyRule?.times?.length ? ` ${item.frequencyRule.times.join('、')}` : ''}
                      </Text>
                    </Text>
                  </View>
                ))}
              </View>
              <View className='row-wrap' style={{ marginTop: '20rpx' }}>
                {canEdit && (
                  <Btn variant='ghost' onClick={() => openEdit(plan.id)}>
                    编辑
                  </Btn>
                )}
                {canEdit && (plan.status === 'active' || plan.status === 'paused') && (
                  <Btn variant='soft' disabled={busyId === plan.id} onClick={() => void togglePause(plan)}>
                    {plan.status === 'paused' ? '恢复' : '暂停'}
                  </Btn>
                )}
                <Btn variant='ghost' onClick={() => setHistoryOf(plan)}>
                  变更史
                </Btn>
                {canEdit && (
                  <Btn variant='ghost' onClick={() => void remove(plan)}>
                    删除
                  </Btn>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
      {historyOf && <HistorySheet plan={historyOf} onClose={() => setHistoryOf(null)} />}
    </View>
  );
}

function HistorySheet({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [entries, setEntries] = useState<PlanChangeHistoryEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    planApi
      .history(plan.id)
      .then(setEntries)
      .catch(setError);
  }, [plan.id]);
  return (
    <Sheet open title={`变更史 · ${plan.name}`} onClose={onClose}>
      <ErrorLine error={error} />
      {entries === null ? (
        <Loading />
      ) : entries.length === 0 ? (
        <EmptyState text='暂无变更记录。' />
      ) : (
        <View className='col' style={{ gap: '16rpx' }}>
          {entries.map((e) => (
            <View key={e.id} style={{ background: '#F6F8F7', borderRadius: '16rpx', padding: '18rpx 20rpx' }}>
              <Text className='tx-md tx-strong'>
                {e.changedField}
                <Text className='tx-sm tx-sub'>
                  {' '}
                  {OPERATOR_TYPE_LABELS[e.operatorType] ?? e.operatorType}
                  {e.operatorLevel ? ` · ${e.operatorLevel}` : ''} · {fmtDateTime(e.createdAt)}
                </Text>
              </Text>
              <Text className='tx-md tx-sub' style={{ display: 'block', marginTop: '6rpx' }}>
                {e.oldValue ?? '（空）'} → {e.newValue ?? '（空）'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
