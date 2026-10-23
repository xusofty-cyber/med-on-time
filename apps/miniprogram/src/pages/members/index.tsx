import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { memberApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { GENDER_LABELS, RELATIONSHIP_LABELS } from '../../lib/dict';
import { CYCLE_PRESETS, type CareSettings, type CyclePresetKey, type Member } from '../../lib/types';
import { Badge, Btn, Card, DatePick, EmptyState, ErrorLine, Field, Loading, Pick, Sheet, SwitchRow, TxtInput } from '../../components/ui';

const MAX_MEMBERS = 10;
const DEFAULT_CARE: CareSettings = {
  careMode: false,
  cyclePreset: 'standard',
  cycleWindowMinutes: 90,
  cycleIntervalMinutes: 15,
  lockScreenShowDrugDetail: false,
};

/** 成员管理：列表（上限 10 自有成员）、新建/编辑/删除、切换当前成员、关怀与提醒设置。与 Web 端 Members 同逻辑。 */
export default function Members() {
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
      title: '删除成员',
      content: `确定要删除成员「${m.displayName}」吗？其计划与记录将一并归档，不再显示。`,
      confirmText: '删除',
      confirmColor: '#DC2626',
    });
    if (!res.confirm) return;
    try {
      await memberApi.remove(m.id);
      toastOk('成员已删除');
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <View className='pg'>
      <View className='row-between'>
        <Text className='tx-title'>成员管理</Text>
        <Btn disabled={ownCount >= MAX_MEMBERS} onClick={() => setEditing('new')}>
          + 添加成员
        </Btn>
      </View>
      <Text className='tx-md tx-sub'>
        每个账号最多管理 {MAX_MEMBERS} 位成员（当前自有成员 {ownCount} 位）
        {ownCount >= MAX_MEMBERS ? '，已达上限，请先删除不再需要的成员' : ''}
        。被授权照护的成员也会出现在列表中，并标注授权级别。
      </Text>
      <ErrorLine error={error} />
      {members.length === 0 ? (
        <Card>
          <EmptyState text='还没有任何成员，点击「添加成员」开始。' />
        </Card>
      ) : (
        <View className='col' style={{ gap: '24rpx' }}>
          {members.map((m) => (
            <Card key={m.id}>
              <View className='row-between' style={{ alignItems: 'flex-start' }}>
                <View className='col' style={{ gap: '6rpx' }}>
                  <View className='row' style={{ gap: '12rpx' }}>
                    <Text className='tx-h'>{m.displayName}</Text>
                    {m.id === currentMemberId && <Badge tone='green'>当前成员</Badge>}
                  </View>
                  <Text className='tx-md tx-sub'>
                    {RELATIONSHIP_LABELS[m.relationship] ?? m.relationship}
                    {m.gender ? ` · ${GENDER_LABELS[m.gender] ?? m.gender}` : ''}
                    {m.birthDate ? ` · 生于 ${m.birthDate.slice(0, 10)}` : ''}
                  </Text>
                  {m.accessLevel && m.accessLevel !== 'owner' && (
                    <Text className='tx-md tx-sub'>照护授权：{m.accessLevel}（来自他人账号授权）</Text>
                  )}
                </View>
                <Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? '在用' : m.status}</Badge>
              </View>
              <View className='row-wrap' style={{ marginTop: '20rpx' }}>
                {m.id !== currentMemberId && (
                  <Btn variant='soft' onClick={() => actions.setCurrentMember(m.id)}>
                    切换为当前
                  </Btn>
                )}
                <Btn variant='ghost' onClick={() => setCareTarget(m)}>
                  关怀与提醒设置
                </Btn>
                {(!m.accessLevel || m.accessLevel === 'owner') && (
                  <>
                    <Btn variant='ghost' onClick={() => setEditing(m)}>
                      编辑
                    </Btn>
                    <Btn variant='ghost' onClick={() => void remove(m)}>
                      删除
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
    </View>
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
      setError(new Error('请填写显示名称'));
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
      toastOk(isNew ? '成员已添加' : '成员已更新');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title={isNew ? '添加成员' : '编辑成员'} onClose={onClose}>
      <View className='col' style={{ gap: '24rpx' }}>
        <Field label='显示名称'>
          <TxtInput value={displayName} onChange={setDisplayName} placeholder='如：爸爸、王小明' />
        </Field>
        <Field label='与账号持有人的关系'>
          <Pick
            value={relationship}
            onChange={setRelationship}
            options={Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label='性别'>
          <Pick
            value={gender}
            onChange={setGender}
            options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label='出生日期（选填）'>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <DatePick value={birthDate} onChange={setBirthDate} placeholder='不填' />
            </View>
            {birthDate && (
              <Btn variant='ghost' onClick={() => setBirthDate('')}>
                清除
              </Btn>
            )}
          </View>
        </Field>
        <ErrorLine error={error} />
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <Btn variant='ghost' block onClick={onClose}>
              取消
            </Btn>
          </View>
          <View className='grow'>
            <Btn block disabled={busy} onClick={submit}>
              {busy ? '保存中…' : '保存'}
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
    const p = CYCLE_PRESETS[key];
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
      toastOk('关怀与提醒设置已保存');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title={`${member.displayName} · 关怀与提醒设置`} onClose={onClose}>
      {loading ? (
        <Loading />
      ) : (
        <View className='col' style={{ gap: '24rpx' }}>
          <SwitchRow
            label='长辈关怀模式'
            desc='大字号、高对比度、大点击区（≥56px）'
            checked={settings.careMode}
            onChange={(v) => setSettings((s) => ({ ...s, careMode: v }))}
          />
          <Field label='提醒重复周期（未确认时如何重复提醒）'>
            <Pick
              value={settings.cyclePreset}
              onChange={(v) => setPreset(v as CyclePresetKey)}
              options={Object.entries(CYCLE_PRESETS).map(([value, p]) => ({ value, label: p.label }))}
            />
          </Field>
          <Text className='tx-sm tx-sub'>
            当前：{settings.cycleWindowMinutes} 分钟内每 {settings.cycleIntervalMinutes}{' '}
            分钟重复一次，超时未确认记为漏服。单个计划可在计划编辑里覆盖此设置。
          </Text>
          <SwitchRow
            label='锁屏提醒显示药品详情'
            desc='默认关闭：通知只显示「有服药提醒」，不显示药名与剂量，保护隐私'
            checked={settings.lockScreenShowDrugDetail}
            onChange={(v) => setSettings((s) => ({ ...s, lockScreenShowDrugDetail: v }))}
          />
          <ErrorLine error={error} />
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <Btn variant='ghost' block onClick={onClose}>
                取消
              </Btn>
            </View>
            <View className='grow'>
              <Btn block disabled={busy} onClick={submit}>
                {busy ? '保存中…' : '保存设置'}
              </Btn>
            </View>
          </View>
        </View>
      )}
    </Sheet>
  );
}
