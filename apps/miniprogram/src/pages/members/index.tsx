import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { memberApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { genderLabels, relationshipLabels } from '../../lib/dict';
import { cyclePresets, strongAlertLabels, type CareSettings, type CyclePresetKey, type Member, type StrongAlertMode } from '../../lib/types';
import { Badge, Btn, Card, DatePick, EmptyState, ErrorLine, Field, Loading, PageShell, Pick, Sheet, SwitchRow, TxtInput } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';

const MAX_MEMBERS = 10;
const DEFAULT_CARE: CareSettings = {
  careMode: false,
  cyclePreset: 'standard',
  cycleWindowMinutes: 90,
  cycleIntervalMinutes: 15,
  lockScreenShowDrugDetail: false,
  strongAlertMode: 'none',
};

/** 成员管理：列表（上限 10 自有成员）、新建/编辑/删除、切换当前成员、关怀与提醒设置。与 Web 端 Members 同逻辑。 */
export default function Members() {
  const t = useT();
  useNavTitle('nav.members');
  useSessionGuard();
  const members = useApp((s) => s.members);
  const currentMemberId = useApp((s) => s.currentMemberId);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [careTarget, setCareTarget] = useState<Member | null>(null);
  const ownCount = members.filter((m) => !m.accessLevel || m.accessLevel === 'owner').length;

  const refresh = async () => {
    try {
      actions.setMembers(await memberApi.list());
    } catch (e) {
      setError(e);
    }
  };

  const remove = async (m: Member) => {
    const res = await Taro.showModal({
      title: t('memb.deleteTitle'),
      content: t('memb.deleteContent', { name: m.displayName }),
      confirmText: t('common.delete'),
      confirmColor: '#DC2626',
    });
    if (!res.confirm) return;
    try {
      await memberApi.remove(m.id);
      toastOk(t('memb.deletedOk'));
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <PageShell>
      <View className='row-between'>
        <Text className='tx-title'>{t('memb.title')}</Text>
        <Btn disabled={ownCount >= MAX_MEMBERS} onClick={() => setEditing('new')}>
          {t('memb.add')}
        </Btn>
      </View>
      <Text className='tx-md tx-sub'>
        {t('memb.limitNoteA', { max: MAX_MEMBERS, own: ownCount })}
        {ownCount >= MAX_MEMBERS ? t('memb.limitReached') : ''}
        {t('memb.limitNoteB')}
      </Text>
      <ErrorLine error={error} />
      {members.length === 0 ? (
        <Card>
          <EmptyState text={t('memb.empty')} />
        </Card>
      ) : (
        <View className='col' style={{ gap: '24rpx' }}>
          {members.map((m) => (
            <Card key={m.id}>
              <View className='row-between' style={{ alignItems: 'flex-start' }}>
                <View className='col' style={{ gap: '6rpx' }}>
                  <View className='row' style={{ gap: '12rpx' }}>
                    <Text className='tx-h'>{m.displayName}</Text>
                    {m.id === currentMemberId && <Badge tone='green'>{t('memb.current')}</Badge>}
                  </View>
                  <Text className='tx-md tx-sub'>
                    {relationshipLabels()[m.relationship] ?? m.relationship}
                    {m.gender ? ` · ${genderLabels()[m.gender] ?? m.gender}` : ''}
                    {m.birthDate ? t('memb.born', { date: m.birthDate.slice(0, 10) }) : ''}
                  </Text>
                  {m.accessLevel && m.accessLevel !== 'owner' && (
                    <Text className='tx-md tx-sub'>{t('memb.authNote', { level: m.accessLevel })}</Text>
                  )}
                </View>
                <Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? t('memb.active') : m.status}</Badge>
              </View>
              <View className='row-wrap' style={{ marginTop: '20rpx' }}>
                {m.id !== currentMemberId && (
                  <Btn variant='soft' onClick={() => actions.setCurrentMember(m.id)}>
                    {t('memb.switch')}
                  </Btn>
                )}
                {(!m.accessLevel || m.accessLevel === 'owner' || m.accessLevel === 'L3') && (
                  <Btn variant='ghost' onClick={() => setCareTarget(m)}>
                    {t('memb.careBtn')}
                  </Btn>
                )}
                {(!m.accessLevel || m.accessLevel === 'owner') && (
                  <>
                    <Btn variant='ghost' onClick={() => setEditing(m)}>
                      {tr('common.edit')}
                    </Btn>
                    <Btn variant='ghost' onClick={() => void remove(m)}>
                      {tr('common.delete')}
                    </Btn>
                  </>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
      <MemberFormSheet
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
        }}
      />
      {careTarget && (
        <CareSettingsSheet
          member={careTarget}
          onClose={() => setCareTarget(null)}
          onSaved={() => {
            if (careTarget.id === currentMemberId) {
              memberApi
                .getCareSettings(careTarget.id)
                .then((s) => actions.setCareSettings(s))
                .catch(() => undefined);
            }
          }}
        />
      )}
    </PageShell>
  );
}

function MemberFormSheet({
  target,
  onClose,
  onSaved,
}: {
  target: Member | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = target === 'new';
  const member = isNew ? null : target;
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState('self');
  const [gender, setGender] = useState('unknown');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setDisplayName(member?.displayName ?? '');
      setRelationship(member?.relationship ?? 'self');
      setGender(member?.gender ?? 'unknown');
      setBirthDate(member?.birthDate ? member.birthDate.slice(0, 10) : '');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  const submit = async () => {
    if (!displayName.trim()) {
      setError(new Error(tr('memb.nameRequired')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        displayName,
        relationship,
        gender,
        birthDate: birthDate || undefined,
      };
      if (isNew) await memberApi.create(body);
      else if (member) await memberApi.update(member.id, body);
      toastOk(isNew ? tr('memb.addedOk') : tr('memb.updatedOk'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title={isNew ? tr('memb.addTitle') : tr('memb.editTitle')} onClose={onClose}>
      <View className='col' style={{ gap: '24rpx' }}>
        <Field label={tr('memb.displayName')}>
          <TxtInput value={displayName} onChange={setDisplayName} placeholder={tr('memb.displayNamePlaceholder')} />
        </Field>
        <Field label={tr('memb.relationship')}>
          <Pick
            value={relationship}
            onChange={setRelationship}
            options={Object.entries(relationshipLabels()).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label={tr('memb.gender')}>
          <Pick
            value={gender}
            onChange={setGender}
            options={Object.entries(genderLabels()).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label={tr('memb.birthDate')}>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <DatePick value={birthDate} onChange={setBirthDate} placeholder={tr('memb.birthNone')} />
            </View>
            {birthDate && (
              <Btn variant='ghost' onClick={() => setBirthDate('')}>
                {tr('pf.clear')}
              </Btn>
            )}
          </View>
        </Field>
        <ErrorLine error={error} />
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <Btn variant='ghost' block onClick={onClose}>
              {tr('common.cancel')}
            </Btn>
          </View>
          <View className='grow'>
            <Btn block disabled={busy} onClick={submit}>
              {busy ? tr('memb.saving') : tr('common.save')}
            </Btn>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

function CareSettingsSheet({
  member,
  onClose,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const canConfig = !member.accessLevel || member.accessLevel === 'owner' || member.accessLevel === 'L3';
  const [settings, setSettings] = useState<CareSettings>(DEFAULT_CARE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    memberApi
      .getCareSettings(member.id)
      .then((s) => {
        if (alive) setSettings({ ...DEFAULT_CARE, ...s });
      })
      .catch(() => {
        /* 尚未保存过设置时用默认值（标准周期、关怀关、锁屏详情关） */
        if (alive) setSettings(DEFAULT_CARE);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [member.id]);

  const setPreset = (key: CyclePresetKey) => {
    const p = cyclePresets()[key];
    setSettings((s) => ({
      ...s,
      cyclePreset: key,
      cycleWindowMinutes: p.windowMinutes,
      cycleIntervalMinutes: p.intervalMinutes,
    }));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await memberApi.putCareSettings(member.id, settings);
      toastOk(tr('memb.careSaved'));
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title={tr('memb.careTitle', { name: member.displayName })} onClose={onClose}>
      {loading ? (
        <Loading />
      ) : (
        <View className='col' style={{ gap: '24rpx' }}>
          <SwitchRow
            label={tr('memb.careMode')}
            desc={tr('memb.careModeDesc')}
            checked={settings.careMode}
            onChange={(v) => setSettings((s) => ({ ...s, careMode: v }))}
          />
          <Field label={tr('memb.cycle')}>
            <Pick
              value={settings.cyclePreset}
              onChange={(v) => setPreset(v as CyclePresetKey)}
              options={Object.entries(cyclePresets()).map(([value, p]) => ({ value, label: p.label }))}
            />
          </Field>
          <Text className='tx-sm tx-sub'>
            {tr('memb.cycleCurrent', { window: settings.cycleWindowMinutes, interval: settings.cycleIntervalMinutes })}
          </Text>
          <SwitchRow
            label={tr('memb.lockScreen')}
            desc={tr('memb.lockScreenDesc')}
            checked={settings.lockScreenShowDrugDetail}
            onChange={(v) => setSettings((s) => ({ ...s, lockScreenShowDrugDetail: v }))}
          />
          <Field label={tr('memb.strongAlert')}>
            <Pick
              value={settings.strongAlertMode}
              onChange={(v) => setSettings((s) => ({ ...s, strongAlertMode: v as StrongAlertMode }))}
              options={(Object.keys(strongAlertLabels()) as StrongAlertMode[]).map((value) => ({
                value,
                label: strongAlertLabels()[value],
              }))}
            />
          </Field>
          <Text className='tx-sm tx-sub'>
            {tr('memb.strongAlertNote')}
          </Text>
          <ErrorLine error={error} />
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <Btn variant='ghost' block onClick={onClose}>
                {tr('common.cancel')}
              </Btn>
            </View>
            <View className='grow'>
              <Btn block disabled={busy || !canConfig} onClick={submit}>
                {busy ? tr('memb.saving') : tr('memb.saveSettings')}
              </Btn>
            </View>
          </View>
        </View>
      )}
    </Sheet>
  );
}
