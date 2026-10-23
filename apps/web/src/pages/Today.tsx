import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reminderApi } from '../lib/endpoints';
import { actions, getState, useApp } from '../lib/store';
import { syncDesktopReminders } from '../lib/desktop';
import { Badge, Button, Card, EmptyState, ErrorText, Modal, Spinner } from '../components/ui';
import { INSTANCE_STATUS_LABELS, MEAL_LABELS } from '../lib/dict';
import { fmtTime, wallTime } from '../lib/time';
import type { ReminderInstance } from '../lib/types';

const DONE = new Set(['taken', 'skipped', 'cancelled']);

/** 桌面桥同步载荷（形状以 apps/desktop preload 契约为准）。 */
function desktopPayload(
  list: ReminderInstance[],
  showDrugDetail: boolean,
  memberDisplayName?: string,
) {
  return {
    localDate: list[0]?.localDate ?? '',
    showDrugDetail,
    items: list.map((i) => ({
      id: i.id,
      scheduledAtUtc: i.scheduledAtUtc,
      drugNameSnapshot: i.drugNameSnapshot,
      doseAmount: i.doseAmount,
      doseUnit: i.doseUnit,
      storageLocation: i.storageLocation ?? null,
      memberDisplayName,
    })),
  };
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === 'taken') return 'green';
  if (status === 'missed') return 'red';
  if (status === 'snoozed') return 'blue';
  if (status === 'reminded' || status === 'pending') return 'amber';
  return 'gray';
}

export default function Today() {
  const memberId = useApp((s) => s.currentMemberId);
  const members = useApp((s) => s.members);
  const member = members.find((m) => m.id === memberId) ?? null;
  const canOperate = !member?.accessLevel || member.accessLevel !== 'L1'; // L1 仅查看，不显示操作按钮
  const care = useApp((s) => s.careSettings);
  const [items, setItems] = useState<ReminderInstance[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skipTarget, setSkipTarget] = useState<ReminderInstance | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const notifiedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      const data = await reminderApi.today(memberId);
      const sorted = [...data].sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc));
      setItems(sorted);
      setError(null);
      // 桌面桥：数据加载后把今日时间线同步给 Electron 主进程做本地通知调度
      // （无桥环境自动跳过）。showDrugDetail 取当前成员 care-settings（默认 OFF）。
      const state = getState();
      const current = state.members.find((m) => m.id === memberId) ?? null;
      syncDesktopReminders(
        desktopPayload(sorted, state.careSettings?.lockScreenShowDrugDetail ?? false, current?.displayName),
      );
    } catch (e) {
      setError(e);
    }
  }, [memberId]);

  useEffect(() => {
    setItems(null);
    load();
    const t = setInterval(() => {
      setNow(Date.now());
      load();
    }, 30000);
    return () => clearInterval(t);
  }, [load]);

  /* care-settings 晚于今日数据到达（或被修改）时，用最新 lockScreenShowDrugDetail 重同步桌面调度 */
  const careShowDetail = care?.lockScreenShowDrugDetail;
  useEffect(() => {
    if (!items || items.length === 0 || careShowDetail === undefined) return;
    syncDesktopReminders(desktopPayload(items, careShowDetail, member?.displayName));
  }, [careShowDetail, items, member]);

  /* 到点本地提示：已到点且未处理的实例进入横幅，并尝试系统通知（需用户授权） */
  const due = useMemo(
    () =>
      (items ?? []).filter(
        (i) => !DONE.has(i.status) && new Date(i.scheduledAtUtc).getTime() <= now,
      ),
    [items, now],
  );

  useEffect(() => {
    due.forEach((i) => {
      if (notifiedRef.current.has(i.id)) return;
      notifiedRef.current.add(i.id);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const showDetail = care?.lockScreenShowDrugDetail;
        new Notification('药准时提醒', {
          body: showDetail
            ? `${i.drugNameSnapshot} ${i.doseAmount}${i.doseUnit}，该吃药了`
            : '有一条用药提醒，点击查看',
        });
      }
    });
  }, [due, care]);

  useEffect(() => {
    document.title = due.length > 0 ? `(${due.length}) 该吃药了 · 药准时` : '药准时 MedOnTime';
  }, [due.length]);

  const act = async (id: string, fn: () => Promise<unknown>, okText: string) => {
    setBusyId(id);
    try {
      await fn();
      actions.toast('success', okText);
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  if (!memberId) {
    return (
      <Card>
        <EmptyState text="还没有成员。请先在「成员」页添加本人或要照护的家人。" />
      </Card>
    );
  }

  const takenCount = (items ?? []).filter((i) => i.status === 'taken').length;
  const totalCount = (items ?? []).filter((i) => i.status !== 'cancelled').length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-medgreen-dark">{member?.displayName ?? ''} · 今日提醒</h1>
          <p className="mt-1 text-neutral-600">
            今天共 {totalCount} 次服药，已完成 {takenCount} 次
          </p>
        </div>
        {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <Button variant="soft" onClick={() => Notification.requestPermission()}>
            开启浏览器通知
          </Button>
        )}
      </div>

      <ErrorText error={error} />

      {due.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4" role="alert">
          <p className="text-lg font-semibold text-amber-800">⏰ 到吃药的时间了</p>
          <ul className="mt-2 flex flex-col gap-1">
            {due.map((i) => (
              <li key={i.id} className="text-amber-900">
                {wallTime(i.localTime)} · {i.drugNameSnapshot} {i.doseAmount}
                {i.doseUnit}
                {i.storageLocation ? ` · 存放于 ${i.storageLocation}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        {items === null ? (
          <Spinner text="正在加载今日提醒…" />
        ) : items.length === 0 ? (
          <EmptyState text="今天没有用药安排。可在「用药计划」为该成员添加计划。" />
        ) : (
          <ol className="flex flex-col">
            {items.map((item, idx) => {
              const done = DONE.has(item.status);
              const isDue = !done && new Date(item.scheduledAtUtc).getTime() <= now;
              return (
                <li key={item.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`timeline-dot ${
                        item.status === 'taken'
                          ? 'bg-medgreen'
                          : item.status === 'missed'
                            ? 'bg-red-500'
                            : isDue
                              ? 'bg-amber-500'
                              : 'bg-neutral-300'
                      }`}
                    />
                    {idx < items.length - 1 && <span className="w-px flex-1 bg-neutral-200" />}
                  </div>
                  <div className={`min-w-0 flex-1 ${idx < items.length - 1 ? 'pb-5' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{wallTime(item.localTime)}</span>
                      <span className="text-lg">
                        {item.drugNameSnapshot} {item.doseAmount}
                        {item.doseUnit}
                      </span>
                      <Badge tone={statusTone(item.status)}>
                        {INSTANCE_STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                      {item.mealRelation && item.mealRelation !== 'none' && (
                        <Badge tone="gray">{MEAL_LABELS[item.mealRelation] ?? item.mealRelation}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5 text-neutral-600">
                      {item.storageLocation && <span>存放位置：{item.storageLocation}</span>}
                      {item.additionalNote && <span>备注：{item.additionalNote}</span>}
                      {item.status === 'snoozed' && item.snoozeUntil && (
                        <span>已顺延至 {fmtTime(item.snoozeUntil, item.timezone)} 再次提醒</span>
                      )}
                    </div>
                    {!done && canOperate && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          disabled={busyId === item.id}
                          onClick={() => act(item.id, () => reminderApi.checkin(item.id), '已打卡，服药记录完成')}
                        >
                          ✓ 已服用
                        </Button>
                        <Button
                          variant="soft"
                          disabled={busyId === item.id}
                          onClick={() => act(item.id, () => reminderApi.snooze(item.id), '已稍后提醒（按提醒周期顺延）')}
                        >
                          稍后提醒
                        </Button>
                        <Button variant="ghost" disabled={busyId === item.id} onClick={() => setSkipTarget(item)}>
                          跳过
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Modal open={skipTarget !== null} title="跳过这次服药" onClose={() => setSkipTarget(null)}>
        <div className="flex flex-col gap-4">
          <p className="text-neutral-600">
            将把「{skipTarget?.drugNameSnapshot}」本次标记为跳过，并计入依从统计。请确认不是误操作。
          </p>
          <label className="block">
            <span className="field-label">跳过原因（选填）</span>
            <input className="input" value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="如：医生嘱咐暂停" />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setSkipTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                const target = skipTarget;
                setSkipTarget(null);
                if (target) act(target.id, () => reminderApi.skip(target.id, skipReason || undefined), '已跳过本次');
                setSkipReason('');
              }}
            >
              确认跳过
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
