import { useCallback, useEffect, useState } from 'react';
import { planApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Modal, Spinner } from '../components/ui';
import { PlanForm } from '../components/PlanForm';
import { frequencyLabels, operatorTypeLabels, planStatusLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
import { fmtDate, fmtDateTime } from '../lib/time';
import type { Plan, PlanChangeHistoryEntry } from '../lib/types';

export default function Plans() {
  const tr = useT();
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
        actions.toast('success', tr('plan.resumedToast'));
      } else {
        await planApi.pause(plan.id);
        actions.toast('success', tr('plan.pausedToast'));
      }
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('common.operationFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (plan: Plan) => {
    if (!window.confirm(tr('plan.deleteConfirm', { name: plan.name }))) return;
    try {
      await planApi.remove(plan.id);
      actions.toast('success', tr('plan.deletedToast'));
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('plan.deleteFailed'));
    }
  };

  if (!memberId) {
    return (
      <Card>
        <EmptyState text={tr('plan.noMember')} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-medgreen-dark">{tr('plan.title')}</h1>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {tr('plan.create')}
          </Button>
        )}
      </div>
      {!canEdit && <p className="text-neutral-600">{tr('plan.readonlyNote')}</p>}
      <ErrorText error={error} />
      {plans === null ? (
        <Spinner text={tr('plan.loading')} />
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState text={tr('plan.empty')} />
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
                        {plan.planType === 'prn' ? tr('plan.typePrn') : tr('plan.typeRegular')}
                      </Badge>
                    </span>
                    <span className="ml-2 align-middle">
                      <Badge tone={plan.status === 'active' ? 'green' : plan.status === 'paused' ? 'amber' : 'gray'}>
                        {planStatusLabels()[plan.status] ?? plan.status}
                      </Badge>
                    </span>
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {tr('plan.fromDate', { start: fmtDate(plan.startDate) })} {plan.endDate ? tr('plan.toDate', { end: fmtDate(plan.endDate) }) : tr('plan.longTerm')}
                    {plan.storageLocation ? ` · ${tr('plan.storedShort', { location: plan.storageLocation })}` : ''}
                  </p>
                  {plan.additionalNote && <p className="mt-0.5 text-neutral-600">{tr('plan.note', { note: plan.additionalNote })}</p>}
                </div>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {(plan.items ?? []).map((item) => (
                  <li key={item.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                    <span className="font-medium">{item.drugNameSnapshot}</span>{' '}
                    <span className="text-neutral-600">
                      {tr('plan.perDose', { amount: Number(item.doseAmount), unit: item.doseUnit })} · {frequencyLabels()[item.frequencyType] ?? item.frequencyType}
                      {item.frequencyRule?.times?.length ? ` ${item.frequencyRule.times.join(tr('common.listSeparator'))}` : ''}
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
                    {tr('common.edit')}
                  </Button>
                )}
                {canEdit && (plan.status === 'active' || plan.status === 'paused') && (
                  <Button variant="soft" disabled={busyId === plan.id} onClick={() => togglePause(plan)}>
                    {plan.status === 'paused' ? tr('plan.resume') : tr('plan.pause')}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setHistoryOf(plan)}>
                  {tr('plan.history')}
                </Button>
                {canEdit && (
                  <Button variant="ghost" onClick={() => remove(plan)}>
                    {tr('common.delete')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} title={editing ? tr('plan.editTitle') : tr('plan.createTitle')} wide onClose={() => setFormOpen(false)}>
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
    <Modal open title={tr('plan.historyTitle', { name: plan.name })} wide onClose={onClose}>
      <ErrorText error={error} />
      {entries === null ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState text={tr('plan.historyEmpty')} />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="font-medium">
                {e.changedField}
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {operatorTypeLabels()[e.operatorType] ?? e.operatorType}
                  {e.operatorLevel ? ` · ${e.operatorLevel}` : ''} · {fmtDateTime(e.createdAt)}
                </span>
              </p>
              <p className="mt-1 break-words text-neutral-600">
                {e.oldValue ?? tr('plan.emptyValue')} → {e.newValue ?? tr('plan.emptyValue')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
