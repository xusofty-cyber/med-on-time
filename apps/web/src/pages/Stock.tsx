import { FormEvent, useEffect, useState } from 'react';
import { stockApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { STOCK_CHANGE_LABELS } from '../lib/dict';
import { daysUntil, fmtDate } from '../lib/time';
import type { StockItem } from '../lib/types';

function warningsOf(item: StockItem): { label: string; tone: 'red' | 'amber' }[] {
  const out: { label: string; tone: 'red' | 'amber' }[] = [];
  const days = daysUntil(item.currentBatchExpiryDate);
  const expired = item.expired ?? (days !== null && days < 0) ?? item.status === 'expired';
  if (expired) out.push({ label: '已过期', tone: 'red' });
  else if (item.expiringSoon ?? (days !== null && days <= 30)) out.push({ label: `临近到期（${days} 天）`, tone: 'amber' });
  const low = item.lowStock ?? (item.daysLeftEstimate !== null && item.daysLeftEstimate !== undefined && item.daysLeftEstimate < 7);
  if (low) out.push({ label: `余量不足${item.daysLeftEstimate != null ? `（约 ${Math.floor(item.daysLeftEstimate)} 天）` : ''}`, tone: 'amber' });
  if (Number(item.stockQuantity) <= 0) out.push({ label: '已用完', tone: 'red' });
  return out;
}

export default function Stock() {
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
        <EmptyState text="请先添加成员。" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">药品库存</h1>
      <p className="text-neutral-600">服药打卡会自动扣减库存；新开一盒药请用「补货入库」登记，并更新到期日。</p>
      <ErrorText error={error} />
      {items === null ? (
        <Spinner text="正在加载库存…" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState text="暂无库存记录。建立用药计划后，可在此登记每种药的库存。" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => {
            const warnings = warningsOf(item);
            const name = item.genericName ?? item.drug?.genericName ?? item.drugName ?? '药品';
            return (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">
                      {name}
                      {item.specification ? <span className="ml-2 text-base font-normal text-neutral-500">{item.specification}</span> : null}
                    </p>
                    <p className="mt-1 text-neutral-600">
                      剩余 <span className="text-xl font-bold text-medgreen-dark">{Number(item.stockQuantity)}</span> {item.stockUnit}
                      {item.daysLeftEstimate != null ? ` · 约可服 ${Math.floor(item.daysLeftEstimate)} 天` : ''}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      当前批次到期：{fmtDate(item.currentBatchExpiryDate)}
                      {item.storageLocation ? ` · 存放：${item.storageLocation}` : ''}
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
                    调整库存
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
      setError(new Error('请填写调整数量（补货为正数，手动减少可填负数）'));
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
      actions.toast('success', '库存已更新，流水已记录');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`调整库存 · ${item.genericName ?? item.drug?.genericName ?? ''}`} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="调整类型">
          <Select
            value={changeType}
            onChange={setChangeType}
            options={['restock', 'manual_adjust', 'expiry_writeoff'].map((v) => ({ value: v, label: STOCK_CHANGE_LABELS[v] ?? v }))}
          />
        </Field>
        <Field label={changeType === 'restock' ? '入库数量' : '调整数量（减少填负数，过期作废自动取负）'}>
          <TextInput value={amount} onChange={setAmount} type="number" />
        </Field>
        {changeType === 'restock' && (
          <Field label="新批次到期日">
            <input className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
        )}
        <Field label="备注（手动调整/过期作废建议填写）">
          <TextInput value={note} onChange={setNote} placeholder="如：新开一盒 30 片" />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? '提交中…' : '确认调整'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
