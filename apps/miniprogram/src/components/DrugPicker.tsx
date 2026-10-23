import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { drugApi } from '../lib/endpoints';
import { toastError, toastOk } from '../lib/api';
import { DOSAGE_FORM_LABELS } from '../lib/dict';
import type { Drug } from '../lib/types';
import { Badge, Btn, Field, Pick, Sheet, TxtInput } from './ui';

/** 药品搜索选药：走 /drugs/search（trgm 模糊），无结果时可自建药品。与 Web 端 DrugPicker 同口径。 */
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
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
      if (timer.current) clearTimeout(timer.current);
    };
  }, [keyword]);

  if (value) {
    return (
      <View
        className='row-between'
        style={{ background: '#E7F4EE', borderRadius: '20rpx', padding: '18rpx 20rpx' }}
      >
        <View className='col grow' style={{ gap: '4rpx' }}>
          <Text className='tx-md tx-strong' style={{ color: '#084C38' }}>
            {value.genericName}
            {value.brandName ? `（${value.brandName}）` : ''}
          </Text>
          <Text className='tx-sm tx-sub'>
            {value.specification} · {DOSAGE_FORM_LABELS[value.dosageForm] ?? value.dosageForm}
            {value.manufacturer ? ` · ${value.manufacturer}` : ''}
          </Text>
        </View>
        <Btn variant='ghost' onClick={() => onChange(null)}>
          更换
        </Btn>
      </View>
    );
  }

  return (
    <View className='col' style={{ gap: '12rpx' }}>
      <TxtInput value={keyword} onChange={setKeyword} placeholder='输入药名或通用名搜索，如：二甲双胍' />
      {searching && <Text className='tx-sm tx-sub'>搜索中…</Text>}
      {results.length > 0 && (
        <View className='col' style={{ border: '1rpx solid #E3E8E5', borderRadius: '20rpx', overflow: 'hidden' }}>
          {results.map((d, i) => (
            <View
              key={d.id}
              className='row-between'
              style={{
                padding: '18rpx 20rpx',
                background: '#fff',
                borderTop: i > 0 ? '1rpx solid #EEF1EF' : 'none',
              }}
              onClick={() => onChange(d)}
            >
              <View className='col grow' style={{ gap: '4rpx' }}>
                <Text className='tx-md tx-strong'>
                  {d.genericName}
                  {d.brandName ? `（${d.brandName}）` : ''}
                </Text>
                <Text className='tx-sm tx-sub'>
                  {d.specification} · {d.manufacturer ?? ''}
                </Text>
              </View>
              {d.isOtc && <Badge tone='blue'>OTC</Badge>}
            </View>
          ))}
        </View>
      )}
      {keyword.trim() && !searching && results.length === 0 && (
        <Text className='tx-sm tx-sub'>药品库里没有这个药？可以自建药品（将进入待核验）。</Text>
      )}
      <View>
        <Btn variant='ghost' onClick={() => setShowCustom(true)}>
          + 自建药品
        </Btn>
      </View>
      <CustomDrugSheet
        open={showCustom}
        memberId={memberId}
        onClose={() => setShowCustom(false)}
        onCreated={(d) => {
          setShowCustom(false);
          onChange(d);
        }}
      />
    </View>
  );
}

function CustomDrugSheet({
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
      toastOk('自建药品已保存');
      onCreated(drug);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title='自建药品' onClose={onClose}>
      <View className='col' style={{ gap: '24rpx' }}>
        <Field label='通用名'>
          <TxtInput value={genericName} onChange={setGenericName} placeholder='如：硝苯地平' />
        </Field>
        <Field label='商品名（选填）'>
          <TxtInput value={brandName} onChange={setBrandName} placeholder='如：拜新同' />
        </Field>
        <Field label='规格'>
          <TxtInput value={specification} onChange={setSpecification} placeholder='如：30mg/片' />
        </Field>
        <View className='row' style={{ gap: '16rpx', alignItems: 'flex-start' }}>
          <View className='grow'>
            <Field label='剂型'>
              <Pick
                value={dosageForm}
                onChange={setDosageForm}
                options={Object.entries(DOSAGE_FORM_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
          </View>
          <View className='grow'>
            <Field label='最小单位'>
              <TxtInput value={unit} onChange={setUnit} placeholder='片 / 粒 / ml' />
            </Field>
          </View>
        </View>
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <Btn variant='ghost' block onClick={onClose}>
              取消
            </Btn>
          </View>
          <View className='grow'>
            <Btn block disabled={busy || !genericName || !specification} onClick={submit}>
              保存药品
            </Btn>
          </View>
        </View>
      </View>
    </Sheet>
  );
}
