import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Taro, { useDidHide, useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { reminderApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { getState, useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { requestReminderSubscribe } from '../../lib/notify';
import { INSTANCE_STATUS_LABELS, MEAL_LABELS } from '../../lib/dict';
import { fmtTime, wallTime } from '../../lib/time';
import type { ReminderInstance } from '../../lib/types';
import { Badge, Btn, Card, EmptyState, ErrorLine, Field, Loading, PageShell, Sheet, TxtInput } from '../../components/ui';
import { MemberBar } from '../../components/MemberBar';

const DONE = new Set(['taken', 'skipped', 'cancelled']);

function statusTone(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === 'taken') return 'green';
  if (status === 'missed') return 'red';
  if (status === 'snoozed') return 'blue';
  if (status === 'reminded' || status === 'pending') return 'amber';
  return 'gray';
}

/** 状态图标（颜色 + 图标 + 文字三重表达）：✓ 已服用 / ! 已漏服 / ◷ 已稍后；待提醒无图标，时间线圆点 + 徽标颜色 + 文字已是三重。 */
function statusIcon(status: string): string | undefined {
  if (status === 'taken') return '✓';
  if (status === 'missed') return '!';
  if (status === 'snoozed') return '◷';
  return undefined;
}

function dotColor(status: string, isDue: boolean): string {
  if (status === 'taken') return 'var(--color-brand-primary)';
  if (status === 'missed') return 'var(--color-status-danger)';
  if (isDue) return 'var(--color-status-warning)';
  return 'var(--color-chart-status-pending)';
}

/**
 * 今日提醒（tab）：时间线 + 打卡 / 稍后提醒 / 跳过，与 Web 端 Today 同逻辑。
 * 到点本地提示（前台占位）：页面打开期间 30 秒轮询刷新，到点未处理实例进横幅并震动一次；
 * 小程序关闭后无法本地定时通知，正式到点触达走微信订阅消息（服务端下发，需模板 ID 配置，
 * 见 lib/notify.ts 与「我的 → 设置」订阅入口）。
 */
export default function Index() {
  const { booted, account } = useSessionGuard();
  const memberId = useApp((s) => s.currentMemberId);
  const members = useApp((s) => s.members);
  const care = useApp((s) => s.careSettings);
  const member = members.find((m) => m.id === memberId) ?? null;
  const canOperate = !member?.accessLevel || member.accessLevel !== 'L1'; // L1 仅查看，不显示操作按钮
  const [items, setItems] = useState<ReminderInstance[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skipTarget, setSkipTarget] = useState<ReminderInstance | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const notifiedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      const data = await reminderApi.today(memberId);
      if (getState().currentMemberId !== memberId) return;
      setItems([...data].sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc)));
      setError(null);
    } catch (e) {
      if (getState().currentMemberId !== memberId) return;
      setError(e);
    }
  }, [memberId]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  /* 页面可见期间轮询（30 秒，对齐 Web 端）；隐藏/卸载时停表 */
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30000);
  }, [load]);
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useDidShow(startTimer);
  useDidHide(stopTimer);
  useEffect(() => stopTimer, [stopTimer]);

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  const due = useMemo(
    () => (items ?? []).filter((i) => !DONE.has(i.status) && new Date(i.scheduledAtUtc).getTime() <= now),
    [items, now],
  );

  /* 到点本地提示（前台占位实现）：每个到点实例只震动提醒一次 */
  useEffect(() => {
    due.forEach((i) => {
      if (notifiedRef.current.has(i.id)) return;
      notifiedRef.current.add(i.id);
      Taro.vibrateLong().catch(() => undefined);
    });
  }, [due]);

  const act = async (id: string, fn: () => Promise<unknown>, okText: string) => {
    setBusyId(id);
    try {
      await fn();
      toastOk(okText);
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  if (!booted) return <Loading text='正在恢复会话…' />;
  if (!account) return <Loading text='正在前往登录…' />;

  const takenCount = (items ?? []).filter((i) => i.status === 'taken').length;
  const totalCount = (items ?? []).filter((i) => i.status !== 'cancelled').length;

  return (
    <PageShell>
      <MemberBar />
      <View className='row-between'>
        <View className='col' style={{ gap: '6rpx' }}>
          <Text className='tx-title'>{member?.displayName ?? ''} · 今日提醒</Text>
          <Text className='tx-md tx-sub'>
            今天共 {totalCount} 次服药，已完成 {takenCount} 次
          </Text>
        </View>
      </View>
      <Btn variant='soft' onClick={() => void requestReminderSubscribe()}>
        订阅微信到点提醒
      </Btn>
      <ErrorLine error={error} />

      {due.length > 0 && (
        <View className='due-banner'>
          <Text className='tx-h' style={{ color: 'var(--color-status-warning-text)' }}>
            ⏰ 到吃药的时间了
          </Text>
          <View className='col' style={{ gap: '6rpx', marginTop: '10rpx' }}>
            {due.map((i) => (
              <Text key={i.id} className='tx-md' style={{ color: 'var(--color-status-warning-text-deep)' }}>
                {wallTime(i.localTime)} · {i.drugNameSnapshot} {i.doseAmount}
                {i.doseUnit}
                {care?.lockScreenShowDrugDetail && i.storageLocation ? ` · 存放于 ${i.storageLocation}` : ''}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!memberId ? (
        <Card>
          <EmptyState text='还没有成员。请先添加本人或要照护的家人。' />
          <Btn block onClick={() => Taro.navigateTo({ url: '/pages/members/index' })}>
            去添加成员
          </Btn>
        </Card>
      ) : (
        <Card>
          {items === null ? (
            <Loading text='正在加载今日提醒…' />
          ) : items.length === 0 ? (
            <EmptyState text='今天没有用药安排。可在「计划」页为该成员添加计划。' />
          ) : (
            <View className='col'>
              {items.map((item, idx) => {
                const done = DONE.has(item.status);
                const isDue = !done && new Date(item.scheduledAtUtc).getTime() <= now;
                return (
                  <View key={item.id} className='row' style={{ alignItems: 'stretch', gap: '18rpx' }}>
                    <View className='col' style={{ alignItems: 'center' }}>
                      <View className='tl-dot' style={{ background: dotColor(item.status, isDue) }} />
                      {idx < items.length - 1 && <View className='tl-line' />}
                    </View>
                    <View className='grow' style={{ paddingBottom: idx < items.length - 1 ? '36rpx' : '0' }}>
                      <View className='row-wrap'>
                        <Text className='tx-h'>{wallTime(item.localTime)}</Text>
                        <Text className='tx-h' style={{ fontWeight: 500 }}>
                          {item.drugNameSnapshot} {item.doseAmount}
                          {item.doseUnit}
                        </Text>
                        <Badge tone={statusTone(item.status)} icon={statusIcon(item.status)}>
                          {INSTANCE_STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                        {item.mealRelation && item.mealRelation !== 'none' && (
                          <Badge tone='gray'>{MEAL_LABELS[item.mealRelation] ?? item.mealRelation}</Badge>
                        )}
                      </View>
                      <View className='col' style={{ gap: '4rpx', marginTop: '8rpx' }}>
                        {item.storageLocation && <Text className='tx-sm tx-sub'>存放位置：{item.storageLocation}</Text>}
                        {item.additionalNote && <Text className='tx-sm tx-sub'>备注：{item.additionalNote}</Text>}
                        {item.status === 'snoozed' && item.snoozeUntil && (
                          <Text className='tx-sm tx-sub'>已顺延至 {fmtTime(item.snoozeUntil, item.timezone)} 再次提醒</Text>
                        )}
                      </View>
                      {!done && canOperate && (
                        <View className='row' style={{ gap: '12rpx', marginTop: '18rpx' }}>
                          <View className='grow'>
                            <Btn
                              variant='success'
                              block
                              disabled={busyId === item.id}
                              onClick={() => void act(item.id, () => reminderApi.checkin(item.id), '已打卡，服药记录完成')}
                            >
                              ✓ 已服用
                            </Btn>
                          </View>
                          <View className='grow'>
                            <Btn
                              variant='soft'
                              block
                              disabled={busyId === item.id}
                              onClick={() => void act(item.id, () => reminderApi.snooze(item.id), '已稍后提醒（按周期顺延）')}
                            >
                              ◷ 稍后提醒
                            </Btn>
                          </View>
                          <Btn variant='ghost' disabled={busyId === item.id} onClick={() => setSkipTarget(item)}>
                            ✕ 跳过
                          </Btn>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      )}

      <Sheet open={skipTarget !== null} title='跳过这次服药' onClose={() => setSkipTarget(null)}>
        <View className='col' style={{ gap: '24rpx' }}>
          <Text className='tx-md tx-sub'>
            将把「{skipTarget?.drugNameSnapshot}」本次标记为跳过，并计入依从统计。请确认不是误操作。
          </Text>
          <Field label='跳过原因（选填）'>
            <TxtInput value={skipReason} onChange={setSkipReason} placeholder='如：医生嘱咐暂停' />
          </Field>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <Btn variant='ghost' block onClick={() => setSkipTarget(null)}>
                取消
              </Btn>
            </View>
            <View className='grow'>
              <Btn
                variant='danger'
                block
                onClick={() => {
                  const target = skipTarget;
                  setSkipTarget(null);
                  if (target) void act(target.id, () => reminderApi.skip(target.id, skipReason || undefined), '已跳过本次');
                  setSkipReason('');
                }}
              >
                确认跳过
              </Btn>
            </View>
          </View>
        </View>
      </Sheet>
    </PageShell>
  );
}
