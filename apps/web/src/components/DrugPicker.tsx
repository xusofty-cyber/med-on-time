import { useEffect, useRef, useState } from 'react';
import { drugApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Badge, Button, Field, Modal, Select, TextInput } from './ui';
import { dosageFormLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
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
  const tr = useT();
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
            {value.brandName ? tr('drug.brandNameWrap', { name: value.brandName }) : ''}
          </p>
          <p className="text-sm text-neutral-600">
            {[value.specification, dosageFormLabels()[value.dosageForm] ?? value.dosageForm, value.manufacturer]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button variant="ghost" onClick={() => onChange(null)}>
          {tr('drug.change')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <TextInput value={keyword} onChange={setKeyword} placeholder={tr('drug.searchPlaceholder')} />
      {searching && <p className="text-sm text-neutral-500">{tr('drug.searching')}</p>}
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
                    {d.brandName ? tr('drug.brandNameWrap', { name: d.brandName }) : ''}
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
        <p className="text-sm text-neutral-500">{tr('drug.notFound')}</p>
      )}
      <div>
        <Button variant="ghost" onClick={() => setShowCustom(true)}>
          {tr('drug.customBtn')}
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
  const [unit, setUnit] = useState(tr('planForm.defaultUnit'));
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
      actions.toast('success', tr('drug.savedToast'));
      onCreated(drug);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('drug.saveFailedToast'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={tr('drug.customTitle')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label={tr('drug.genericName')}>
          <TextInput value={genericName} onChange={setGenericName} placeholder={tr('drug.genericNamePlaceholder')} />
        </Field>
        <Field label={tr('drug.brandNameOptional')}>
          <TextInput value={brandName} onChange={setBrandName} placeholder={tr('drug.brandNamePlaceholder')} />
        </Field>
        <Field label={tr('drug.specification')}>
          <TextInput value={specification} onChange={setSpecification} placeholder={tr('drug.specificationPlaceholder')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('drug.dosageForm')}>
            <Select
              value={dosageForm}
              onChange={setDosageForm}
              options={Object.entries(dosageFormLabels()).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label={tr('drug.minUnit')}>
            <TextInput value={unit} onChange={setUnit} placeholder={tr('drug.unitPlaceholder')} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {tr('common.cancel')}
          </Button>
          <Button className="flex-1" disabled={busy || !genericName || !specification} onClick={submit}>
            {tr('drug.saveDrug')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
