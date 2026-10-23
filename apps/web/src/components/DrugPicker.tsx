import { useEffect, useRef, useState } from 'react';
import { drugApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Badge, Button, Field, Modal, Select, TextInput } from './ui';
import { DOSAGE_FORM_LABELS } from '../lib/dict';
import type { Drug } from '../lib/types';

/** 药品搜索选药：走 /drugs/search（trgm 模糊），无结果时可自建药品。 */
export function DrugPicker({
  memberId,
  value,
  onChange,
}: {
  memberId: string;
  value: Drug | null;
  onChange: (drug: Drug | null) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Drug[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const page = await drugApi.search(keyword.trim());
        setResults(page.items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [keyword]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-medgreen-light px-3 py-2.5">
        <div>
          <p className="font-medium text-medgreen-dark">
            {value.genericName}
            {value.brandName ? `（${value.brandName}）` : ''}
          </p>
          <p className="text-sm text-neutral-600">
            {value.specification} · {DOSAGE_FORM_LABELS[value.dosageForm] ?? value.dosageForm}
            {value.manufacturer ? ` · ${value.manufacturer}` : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={() => onChange(null)}>
          更换
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <TextInput value={keyword} onChange={setKeyword} placeholder="输入药名或通用名搜索，如：二甲双胍" />
      {searching && <p className="text-sm text-neutral-500">搜索中…</p>}
      {results.length > 0 && (
        <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200">
          {results.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-medgreen-light"
                onClick={() => onChange(d)}
              >
                <span>
                  <span className="font-medium">
                    {d.genericName}
                    {d.brandName ? `（${d.brandName}）` : ''}
                  </span>
                  <span className="block text-sm text-neutral-500">
                    {d.specification} · {d.manufacturer ?? ''}
                  </span>
                </span>
                {d.isOtc && <Badge tone="blue">OTC</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {keyword.trim() && !searching && results.length === 0 && (
        <p className="text-sm text-neutral-500">药品库里没有这个药？</p>
      )}
      <div>
        <Button variant="ghost" onClick={() => setShowCustom(true)}>
          + 自建药品
        </Button>
      </div>
      <CustomDrugModal
        open={showCustom}
        memberId={memberId}
        onClose={() => setShowCustom(false)}
        onCreated={(d) => {
          setShowCustom(false);
          onChange(d);
        }}
      />
    </div>
  );
}

function CustomDrugModal({
  open,
  memberId,
  onClose,
  onCreated,
}: {
  open: boolean;
  memberId: string;
  onClose: () => void;
  onCreated: (d: Drug) => void;
}) {
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [specification, setSpecification] = useState('');
  const [unit, setUnit] = useState('片');
  const [dosageForm, setDosageForm] = useState('tablet');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const drug = await drugApi.createCustom(memberId, {
        genericName,
        brandName: brandName || undefined,
        specification,
        unit,
        dosageForm,
      });
      actions.toast('success', '自建药品已保存');
      onCreated(drug);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '自建药品失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="自建药品" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="通用名">
          <TextInput value={genericName} onChange={setGenericName} placeholder="如：硝苯地平" />
        </Field>
        <Field label="商品名（选填）">
          <TextInput value={brandName} onChange={setBrandName} placeholder="如：拜新同" />
        </Field>
        <Field label="规格">
          <TextInput value={specification} onChange={setSpecification} placeholder="如：30mg/片" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="剂型">
            <Select
              value={dosageForm}
              onChange={setDosageForm}
              options={Object.entries(DOSAGE_FORM_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="最小单位">
            <TextInput value={unit} onChange={setUnit} placeholder="片 / 粒 / ml" />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button className="flex-1" disabled={busy || !genericName || !specification} onClick={submit}>
            保存药品
          </Button>
        </div>
      </div>
    </Modal>
  );
}
