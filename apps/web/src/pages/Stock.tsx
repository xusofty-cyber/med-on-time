import { FormEvent, useEffect, useState } from 'react';
import { stockApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { stockChangeLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
import { daysUntil, fmtDate } from '../lib/time';
import type { StockItem } from '../lib/types';

function warningsOf(item: StockItem): { label: string; tone: 'red' | 'amber' }[] {
  const out: { label: string; tone: 'red' | 'amber' }[] = [];
  const days = daysUntil(item.currentBatchExpiryDate);
  const expired = item.expired ?? (days !== null && days < 0) ?? item.status === 'expired';
  if (expired) out.push({ label: tr('stock.warnExpired'), tone: 'red' });
  else if (item.expiringSoon ?? (days !== null && days <= 30)) out.push({ label: tr('stock.warnExpiringSoon', { days: days ?? '' }), tone: 'amber' });
  const low = item.lowStock ?? (item.daysLeftEstimate !== null && item.daysLeftEstimate !== undefined && item.daysLeftEstimate < 7);
  if (low) out.push({ label: item.daysLeftEstimate != null ? tr('stock.warnLowDays', { days: Math.floor(item.daysLeftEstimate) }) : tr('stock.warnLow'), tone: 'amber' });
  if (Number(item.stockQuantity) <= 0) out.push({ label: tr('stock.warnEmpty'), tone: 'red' });
  return out;
}

export default function Stock() {
  const tr = useT();
  const memberId = useApp((s) => s.currentMemberId);
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);

  const load = async () => {
    if (!memberId) return;
    try {
      setItems(await stockApi.list(memberId));
      setError(null);
    } catch (e) {
      setError(e);
    }
  };

  useEffect(() => {
    setItems(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  if (!memberId) {
    return (
      <Card>
        <EmptyState text={tr('ehr.noMember')} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">{tr('stock.title')}</h1>
      <p className="text-neutral-600">{tr('stock.intro')}</p>
      <ErrorText error={error} />
      {items === null ? (
        <Spinner text={tr('stock.loading')} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState text={tr('stock.empty')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => {
            const warnings = warningsOf(item);
            const name = item.genericName ?? item.drug?.genericName ?? item.drugName ?? tr('stock.drugFallback');
            return (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">
                      {name}
                      {item.specification ? <span className="ml-2 text-base font-normal text-neutral-500">{item.specification}</span> : null}
                    </p>
                    <p className="mt-1 text-neutral-600">
                      {tr('stock.remaining')} <span className="text-xl font-bold text-medgreen-dark">{Number(item.stockQuantity)}</span> {item.stockUnit}
                      {item.daysLeftEstimate != null ? ` · ${tr('stock.daysLeft', { days: Math.floor(item.daysLeftEstimate) })}` : ''}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      {tr('stock.expiryLine', { date: fmtDate(item.currentBatchExpiryDate) })}
                      {item.storageLocation ? ` · ${tr('plan.storedShort', { location: item.storageLocation })}` : ''}
                    </p>
                  </div>
                </div>
                {warnings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {warnings.map((w) => (
                      <Badge key={w.label} tone={w.tone}>
                        ⚠ {w.label}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button variant="soft" onClick={() => setAdjusting(item)}>
                    {tr('stock.adjustBtn')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {adjusting && memberId && (
        <AdjustModal
          memberId={memberId}
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={async () => {
            setAdjusting(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AdjustModal({
  memberId,
  item,
  onClose,
  onSaved,
}: {
  memberId: string;
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [changeType, setChangeType] = useState('restock');
  const [amount, setAmount] = useState('30');
  const [expiryDate, setExpiryDate] = useState(item.currentBatchExpiryDate?.slice(0, 10) ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt === 0) {
      setError(new Error(tr('stock.amountInvalid')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stockApi.adjust(memberId, {
        drugId: item.drugId,
        changeType,
        changeAmount: changeType === 'expiry_writeoff' ? -Math.abs(amt) : amt,
        expiryDate: changeType === 'restock' ? expiryDate || null : null,
        note: note || undefined,
      });
      actions.toast('success', tr('stock.updatedToast'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={tr('stock.adjustTitle', { name: item.genericName ?? item.drug?.genericName ?? '' })} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={tr('stock.changeType')}>
          <Select
            value={changeType}
            onChange={setChangeType}
            options={['restock', 'manual_adjust', 'expiry_writeoff'].map((v) => ({ value: v, label: stockChangeLabels()[v] ?? v }))}
          />
        </Field>
        <Field label={changeType === 'restock' ? tr('stock.amountRestock') : tr('stock.amountAdjust')}>
          <TextInput value={amount} onChange={setAmount} type="number" />
        </Field>
        {changeType === 'restock' && (
          <Field label={tr('stock.newExpiry')}>
            <input className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
        )}
        <Field label={tr('stock.noteLabel')}>
          <TextInput value={note} onChange={setNote} placeholder={tr('stock.notePlaceholder')} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {tr('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? tr('stock.submitting') : tr('stock.confirmAdjust')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
