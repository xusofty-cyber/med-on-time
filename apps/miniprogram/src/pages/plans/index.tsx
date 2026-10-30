import { useCallback, useEffect, useState } from 'react';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { planApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { getState, useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { frequencyLabels, operatorTypeLabels, planStatusLabels } from '../../lib/dict';
import { fmtDate, fmtDateTime } from '../../lib/time';
import type { Plan, PlanChangeHistoryEntry } from '../../lib/types';
import { Badge, Btn, Card, EmptyState, ErrorLine, Loading, PageShell, Sheet } from '../../components/ui';
import { MemberBar } from '../../components/MemberBar';
import { tr, useNavTitle, useT } from '../../lib/i18n';

/** 用药计划（tab）：列表、新建/编辑入口、暂停/恢复、变更史、删除。与 Web 端 Plans 同逻辑。 */
export default function Plans() {
  const t = useT();
  useNavTitle('nav.plans');
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
      const data = await planApi.list(memberId);
      if (getState().currentMemberId !== memberId) return;
      setPlans(data);
      setError(null);
    } catch (e) {
      if (getState().currentMemberId !== memberId) return;
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
        toastOk(t('plan.resumedOk'));
      } else {
        await planApi.pause(plan.id);
        toastOk(t('plan.pausedOk'));
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
      title: t('plan.deleteTitle'),
      content: t('plan.deleteContent', { name: plan.name }),
      confirmText: t('common.delete'),
      confirmColor: '#DC2626',
    });
    if (!res.confirm) return;
    try {
      await planApi.remove(plan.id);
      toastOk(t('plan.deletedOk'));
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  const openEdit = (planId?: string) => {
    Taro.navigateTo({ url: `/pages/plan-edit/index${planId ? `?planId=${planId}` : ''}` });
  };

  return (
    <PageShell>
      <MemberBar />
      <View className='row-between'>
        <Text className='tx-title'>{t('plan.title')}</Text>
        {canEdit && memberId && <Btn onClick={() => openEdit()}>{t('plan.new')}</Btn>}
      </View>
      {!canEdit && memberId && (
        <Text className='tx-md tx-sub'>{t('plan.noEditNote')}</Text>
      )}
      <ErrorLine error={error} />
      {!memberId ? (
        <Card>
          <EmptyState text={t('plan.noMember')} />
        </Card>
      ) : plans === null ? (
        <Loading text={t('plan.loading')} />
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState text={t('plan.empty')} />
        </Card>
      ) : (
        <View className='col' style={{ gap: '24rpx' }}>
          {plans.map((plan) => (
            <Card key={plan.id}>
              <View className='row-wrap'>
                <Text className='tx-h'>{plan.name}</Text>
                <Badge tone={plan.planType === 'prn' ? 'blue' : 'green'}>
                  {plan.planType === 'prn' ? t('plan.prnBadge') : t('plan.scheduledBadge')}
                </Badge>
                <Badge tone={plan.status === 'active' ? 'green' : plan.status === 'paused' ? 'amber' : 'gray'}>
                  {planStatusLabels()[plan.status] ?? plan.status}
                </Badge>
              </View>
              <Text className='tx-md tx-sub' style={{ display: 'block', marginTop: '8rpx' }}>
                {t('plan.courseLine', { start: fmtDate(plan.startDate), end: plan.endDate ? t('plan.courseEnd', { end: fmtDate(plan.endDate) }) : t('plan.courseLongTerm') })}
                {plan.storageLocation ? t('plan.storedShort', { location: plan.storageLocation }) : ''}
              </Text>
              {plan.additionalNote && (
                <Text className='tx-md tx-sub' style={{ display: 'block', marginTop: '4rpx' }}>
                  {t('plan.noteLabel', { note: plan.additionalNote })}
                </Text>
              )}
              <View className='col' style={{ gap: '10rpx', marginTop: '16rpx' }}>
                {(plan.items ?? []).map((item) => (
                  <View key={item.id} style={{ background: 'var(--color-background-page)', borderRadius: '16rpx', padding: '14rpx 18rpx' }}>
                    <Text className='tx-md'>
                      <Text className='tx-strong'>{item.drugNameSnapshot}</Text>
                      <Text className='tx-sub'>
                        {' '}
                        {t('plan.perDose', { amount: Number(item.doseAmount), unit: item.doseUnit })} · {frequencyLabels()[item.frequencyType] ?? item.frequencyType}
                        {item.frequencyRule?.times?.length ? ` ${item.frequencyRule.times.join(t('common.listSeparator'))}` : ''}
                      </Text>
                    </Text>
                  </View>
                ))}
              </View>
              <View className='row-wrap' style={{ marginTop: '20rpx' }}>
                {canEdit && (
                  <Btn variant='ghost' onClick={() => openEdit(plan.id)}>
                    {t('plan.edit')}
                  </Btn>
                )}
                {canEdit && (plan.status === 'active' || plan.status === 'paused') && (
                  <Btn variant='soft' disabled={busyId === plan.id} onClick={() => void togglePause(plan)}>
                    {plan.status === 'paused' ? t('plan.resume') : t('plan.pause')}
                  </Btn>
                )}
                <Btn variant='ghost' onClick={() => setHistoryOf(plan)}>
                  {t('plan.history')}
                </Btn>
                {canEdit && (
                  <Btn variant='ghost' onClick={() => void remove(plan)}>
                    {t('common.delete')}
                  </Btn>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
      {historyOf && <HistorySheet plan={historyOf} onClose={() => setHistoryOf(null)} />}
    </PageShell>
  );
}

function HistorySheet({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const t = useT();
  const [entries, setEntries] = useState<PlanChangeHistoryEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    planApi
      .history(plan.id)
      .then(setEntries)
      .catch(setError);
  }, [plan.id]);
  return (
    <Sheet open title={t('plan.historyTitle', { name: plan.name })} onClose={onClose}>
      <ErrorLine error={error} />
      {entries === null ? (
        <Loading />
      ) : entries.length === 0 ? (
        <EmptyState text={t('plan.noHistory')} />
      ) : (
        <View className='col' style={{ gap: '16rpx' }}>
          {entries.map((e) => (
            <View key={e.id} style={{ background: 'var(--color-background-page)', borderRadius: '16rpx', padding: '18rpx 20rpx' }}>
              <Text className='tx-md tx-strong'>
                {e.changedField}
                <Text className='tx-sm tx-sub'>
                  {' '}
                  {operatorTypeLabels()[e.operatorType] ?? e.operatorType}
                  {e.operatorLevel ? ` · ${e.operatorLevel}` : ''} · {fmtDateTime(e.createdAt)}
                </Text>
              </Text>
              <Text className='tx-md tx-sub' style={{ display: 'block', marginTop: '6rpx' }}>
                {e.oldValue ?? t('plan.emptyValue')} → {e.newValue ?? t('plan.emptyValue')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
