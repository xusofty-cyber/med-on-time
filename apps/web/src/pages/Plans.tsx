import { useCallback, useEffect, useState } from 'react';
import { planApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Modal, Spinner } from '../components/ui';
import { PlanForm } from '../components/PlanForm';
import { FREQUENCY_LABELS, OPERATOR_TYPE_LABELS, PLAN_STATUS_LABELS } from '../lib/dict';
import { fmtDate, fmtDateTime } from '../lib/time';
import type { Plan, PlanChangeHistoryEntry } from '../lib/types';

export default function Plans() {
  const memberId = useApp((s) => s.currentMemberId);
  const members = useApp((s) => s.members);
  const current = members.find((m) => m.id === memberId) ?? null;
  const canEdit = !current?.accessLevel || current.accessLevel === 'owner' || current.accessLevel === 'L3'; // L3 才可配置计划
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
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
    load();
  }, [load]);

  const togglePause = async (plan: Plan) => {
    setBusyId(plan.id);
    try {
      if (plan.status === 'paused') {
        await planApi.resume(plan.id);
        actions.toast('success', '计划已恢复，提醒将继续生成');
      } else {
        await planApi.pause(plan.id);
        actions.toast('success', '计划已暂停，暂停期间不再提醒');
      }
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (plan: Plan) => {
    if (!window.confirm(`确定删除计划「${plan.name}」吗？历史打卡与变更史仍会保留。`)) return;
    try {
      await planApi.remove(plan.id);
      actions.toast('success', '计划已删除');
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  if (!memberId) {
    return (
      <Card>
        <EmptyState text="请先添加成员，再为其建立用药计划。" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-medgreen-dark">用药计划</h1>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + 新建计划
          </Button>
        )}
      </div>
      {!canEdit && <p className="text-neutral-600">当前授权级别为仅查看/协助，不能新建或编辑计划（需 L3 或成员本人账号）。</p>}
      <ErrorText error={error} />
      {plans === null ? (
        <Spinner text="正在加载计划…" />
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState text="该成员还没有用药计划，点击「新建计划」添加第一种药。" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold">
                    {plan.name}
                    <span className="ml-2 align-middle">
                      <Badge tone={plan.planType === 'prn' ? 'blue' : 'green'}>
                        {plan.planType === 'prn' ? 'PRN 按需' : '常规'}
                      </Badge>
                    </span>
                    <span className="ml-2 align-middle">
                      <Badge tone={plan.status === 'active' ? 'green' : plan.status === 'paused' ? 'amber' : 'gray'}>
                        {PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                      </Badge>
                    </span>
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {fmtDate(plan.startDate)} 起{plan.endDate ? ` 至 ${fmtDate(plan.endDate)}` : '（长期）'}
                    {plan.storageLocation ? ` · 存放：${plan.storageLocation}` : ''}
                  </p>
                  {plan.additionalNote && <p className="mt-0.5 text-neutral-600">备注：{plan.additionalNote}</p>}
                </div>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {(plan.items ?? []).map((item) => (
                  <li key={item.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                    <span className="font-medium">{item.drugNameSnapshot}</span>{' '}
                    <span className="text-neutral-600">
                      每次 {Number(item.doseAmount)}
                      {item.doseUnit} · {FREQUENCY_LABELS[item.frequencyType] ?? item.frequencyType}
                      {item.frequencyRule?.times?.length ? ` ${item.frequencyRule.times.join('、')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {canEdit && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(plan);
                      setFormOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                )}
                {canEdit && (plan.status === 'active' || plan.status === 'paused') && (
                  <Button variant="soft" disabled={busyId === plan.id} onClick={() => togglePause(plan)}>
                    {plan.status === 'paused' ? '恢复' : '暂停'}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setHistoryOf(plan)}>
                  变更史
                </Button>
                {canEdit && (
                  <Button variant="ghost" onClick={() => remove(plan)}>
                    删除
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} title={editing ? '编辑计划' : '新建计划'} wide onClose={() => setFormOpen(false)}>
        <PlanForm
          memberId={memberId}
          plan={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await load();
          }}
        />
      </Modal>

      {historyOf && <HistoryModal plan={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}

function HistoryModal({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [entries, setEntries] = useState<PlanChangeHistoryEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    planApi
      .history(plan.id)
      .then(setEntries)
      .catch(setError);
  }, [plan.id]);

  return (
    <Modal open title={`变更史 · ${plan.name}`} wide onClose={onClose}>
      <ErrorText error={error} />
      {entries === null ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState text="暂无变更记录。" />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="font-medium">
                {e.changedField}
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {OPERATOR_TYPE_LABELS[e.operatorType] ?? e.operatorType}
                  {e.operatorLevel ? ` · ${e.operatorLevel}` : ''} · {fmtDateTime(e.createdAt)}
                </span>
              </p>
              <p className="mt-1 break-words text-neutral-600">
                {e.oldValue ?? '（空）'} → {e.newValue ?? '（空）'}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
