import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { drugApi } from '../lib/endpoints';
import { toastError, toastOk } from '../lib/api';
import { dosageFormLabels } from '../lib/dict';
import type { Drug } from '../lib/types';
import { Badge, Btn, Field, Pick, Sheet, TxtInput } from './ui';
import { tr, useT } from '../lib/i18n';

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
  useT();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Drug[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoHint, setPhotoHint] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 拍照录入（2026-10-24）：拍药盒 → 服务端识别药名 → 回填搜索框自动检索。
   * 红线：识别只回填，必须用户点选药品库命中项确认；照片不留存。
   */
  const takePhoto = async () => {
    try {
      const chosen = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
      });
      const file = chosen.tempFiles[0];
      if (!file) return;
      setPhotoBusy(true);
      const base64 = await new Promise<string>((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath: file.tempFilePath,
          encoding: 'base64',
          success: (r) => resolve(r.data as string),
          fail: reject,
        });
      });
      const mimeType = file.tempFilePath.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
      const res = await drugApi.photoRecognize(base64, mimeType);
      const first =
        res.candidates.find((c) => c.matches.length > 0) ?? res.candidates[0];
      if (!first) {
        toastError(new Error(tr('drug.photoFail')));
        return;
      }
      setKeyword(first.text);
      setPhotoHint(tr('drug.photoHint', { text: first.text }));
      toastOk(tr('drug.photoDone'));
    } catch (e) {
      toastError(e);
    } finally {
      setPhotoBusy(false);
    }
  };

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
        style={{ background: 'var(--color-background-soft)', borderRadius: '20rpx', padding: '18rpx 20rpx' }}
      >
        <View className='col grow' style={{ gap: '4rpx' }}>
          <Text className='tx-md tx-strong' style={{ color: 'var(--color-brand-strong)' }}>
            {value.genericName}
            {value.brandName ? tr('drug.brandWrap', { name: value.brandName }) : ''}
          </Text>
          <Text className='tx-sm tx-sub'>
            {value.specification} · {dosageFormLabels()[value.dosageForm] ?? value.dosageForm}
            {value.manufacturer ? ` · ${value.manufacturer}` : ''}
          </Text>
        </View>
        <Btn variant='ghost' onClick={() => onChange(null)}>
          {tr('drug.change')}
        </Btn>
      </View>
    );
  }

  return (
    <View className='col' style={{ gap: '12rpx' }}>
      <TxtInput value={keyword} onChange={setKeyword} placeholder={tr('drug.searchPlaceholder')} />
      <View>
        <Btn variant='ghost' disabled={photoBusy} onClick={() => void takePhoto()}>
          {photoBusy ? tr('drug.photoBusy') : tr('drug.photoBtn')}
        </Btn>
      </View>
      {photoHint ? <Text className='tx-sm' style={{ color: 'var(--color-brand-primary)' }}>{photoHint}</Text> : null}
      {searching && <Text className='tx-sm tx-sub'>{tr('drug.searching')}</Text>}
      {results.length > 0 && (
        <View className='col' style={{ border: '1rpx solid var(--color-border-subtle)', borderRadius: '20rpx', overflow: 'hidden' }}>
          {results.map((d, i) => (
            <View
              key={d.id}
              className='row-between'
              style={{
                padding: '18rpx 20rpx',
                background: 'var(--color-background-surface)',
                borderTop: i > 0 ? '1rpx solid var(--color-background-muted)' : 'none',
              }}
              onClick={() => onChange(d)}
            >
              <View className='col grow' style={{ gap: '4rpx' }}>
                <Text className='tx-md tx-strong'>
                  {d.genericName}
                  {d.brandName ? tr('drug.brandWrap', { name: d.brandName }) : ''}
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
        <Text className='tx-sm tx-sub'>{tr('drug.customHint')}</Text>
      )}
      <View>
        <Btn variant='ghost' onClick={() => setShowCustom(true)}>
          {tr('drug.customBtn')}
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
  const [unit, setUnit] = useState(tr('pf.defaultUnit'));
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
      toastOk(tr('drug.customSaved'));
      onCreated(drug);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title={tr('drug.customTitle')} onClose={onClose}>
      <View className='col' style={{ gap: '24rpx' }}>
        <Field label={tr('drug.genericName')}>
          <TxtInput value={genericName} onChange={setGenericName} placeholder={tr('drug.genericPlaceholder')} />
        </Field>
        <Field label={tr('drug.brandName')}>
          <TxtInput value={brandName} onChange={setBrandName} placeholder={tr('drug.brandPlaceholder')} />
        </Field>
        <Field label={tr('drug.spec')}>
          <TxtInput value={specification} onChange={setSpecification} placeholder={tr('drug.specPlaceholder')} />
        </Field>
        <View className='row' style={{ gap: '16rpx', alignItems: 'flex-start' }}>
          <View className='grow'>
            <Field label={tr('drug.dosageForm')}>
              <Pick
                value={dosageForm}
                onChange={setDosageForm}
                options={Object.entries(dosageFormLabels()).map(([value, label]) => ({ value, label }))}
              />
            </Field>
          </View>
          <View className='grow'>
            <Field label={tr('drug.unit')}>
              <TxtInput value={unit} onChange={setUnit} placeholder={tr('drug.unitPlaceholder')} />
            </Field>
          </View>
        </View>
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <Btn variant='ghost' block onClick={onClose}>
              {tr('common.cancel')}
            </Btn>
          </View>
          <View className='grow'>
            <Btn block disabled={busy || !genericName || !specification} onClick={submit}>
              {tr('drug.save')}
            </Btn>
          </View>
        </View>
      </View>
    </Sheet>
  );
}
