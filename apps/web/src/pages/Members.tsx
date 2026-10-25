import { FormEvent, useEffect, useState } from 'react';
import { memberApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { GENDER_LABELS, RELATIONSHIP_LABELS } from '../lib/dict';
import { CYCLE_PRESETS, STRONG_ALERT_LABELS, type CareSettings, type CyclePresetKey, type Member, type StrongAlertMode } from '../lib/types';

const MAX_MEMBERS = 10;

const DEFAULT_CARE: CareSettings = {
  careMode: false,
  cyclePreset: 'standard',
  cycleWindowMinutes: 90,
  cycleIntervalMinutes: 15,
  lockScreenShowDrugDetail: false,
  strongAlertMode: 'none',
};

export default function Members() {
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
    if (!window.confirm(`确定要删除成员「${m.displayName}」吗？其计划与记录将一并归档，不再显示。`)) return;
    try {
      await memberApi.remove(m.id);
      actions.toast('success', '成员已删除');
      await refresh();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-medgreen-dark">成员管理</h1>
        <Button disabled={ownCount >= MAX_MEMBERS} onClick={() => setEditing('new')}>
          + 添加成员
        </Button>
      </div>
      <p className="text-neutral-600">
        每个账号最多管理 {MAX_MEMBERS} 位成员（当前自有成员 {ownCount} 位）
        {ownCount >= MAX_MEMBERS ? '，已达上限，请先删除不再需要的成员' : ''}。被授权照护的成员也会出现在列表中，并标注授权级别。
      </p>
      <ErrorText error={error} />
      {members.length === 0 ? (
        <Card>
          <EmptyState text="还没有任何成员，点击「添加成员」开始。" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold">
                    {m.displayName}
                    {m.id === currentMemberId && <Badge tone="green">当前成员</Badge>}
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {RELATIONSHIP_LABELS[m.relationship] ?? m.relationship}
                    {m.gender ? ` · ${GENDER_LABELS[m.gender] ?? m.gender}` : ''}
                    {m.birthDate ? ` · 生于 ${m.birthDate.slice(0, 10)}` : ''}
                  </p>
                  {m.accessLevel && m.accessLevel !== 'owner' && (
                    <p className="mt-1 text-neutral-600">照护授权：{m.accessLevel}（来自他人账号授权）</p>
                  )}
                </div>
                <Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? '在用' : m.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {m.id !== currentMemberId && (
                  <Button variant="soft" onClick={() => actions.setCurrentMember(m.id)}>
                    切换为当前
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setCareTarget(m)}>
                  关怀与提醒设置
                </Button>
                {(!m.accessLevel || m.accessLevel === 'owner') && (
                  <>
                    <Button variant="ghost" onClick={() => setEditing(m)}>
                      编辑
                    </Button>
                    <Button variant="ghost" onClick={() => remove(m)}>
                      删除
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <MemberForm
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
        }}
      />
      {careTarget && (
        <CareSettingsEditor
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
    </div>
  );
}

function MemberForm({
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
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
      actions.toast('success', isNew ? '成员已添加' : '成员已更新');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={isNew ? '添加成员' : '编辑成员'} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="显示名称">
          <TextInput value={displayName} onChange={setDisplayName} placeholder="如：爸爸、王小明" required />
        </Field>
        <Field label="与账号持有人的关系">
          <Select
            value={relationship}
            onChange={setRelationship}
            options={Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="性别">
          <Select
            value={gender}
            onChange={setGender}
            options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="出生日期（选填）">
          <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CareSettingsEditor({
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
    setSettings((s) => ({ ...s, cyclePreset: key, cycleWindowMinutes: p.windowMinutes, cycleIntervalMinutes: p.intervalMinutes }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await memberApi.putCareSettings(member.id, settings);
      actions.toast('success', '关怀与提醒设置已保存');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${member.displayName} · 关怀与提醒设置`} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">长辈关怀模式</span>
              <span className="block text-sm text-neutral-500">大字号（≥18pt）、高对比度、大点击区（≥56px）</span>
            </span>
            <input
              type="checkbox"
              className="h-6 w-6 accent-[var(--color-brand-primary)]"
              checked={settings.careMode}
              onChange={(e) => setSettings((s) => ({ ...s, careMode: e.target.checked }))}
            />
          </label>
          <Field label="提醒重复周期（未确认时如何重复提醒）">
            <Select
              value={settings.cyclePreset}
              onChange={(v) => setPreset(v as CyclePresetKey)}
              options={Object.entries(CYCLE_PRESETS).map(([value, p]) => ({ value, label: p.label }))}
            />
          </Field>
          <p className="-mt-2 text-sm text-neutral-500">
            当前：{settings.cycleWindowMinutes} 分钟内每 {settings.cycleIntervalMinutes} 分钟重复一次，超时未确认记为漏服。单个计划可在计划编辑里覆盖此设置。
          </p>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">锁屏提醒显示药品详情</span>
              <span className="block text-sm text-neutral-500">默认关闭：锁屏/通知只显示「有服药提醒」，不显示药名与剂量，保护隐私</span>
            </span>
            <input
              type="checkbox"
              className="h-6 w-6 accent-[var(--color-brand-primary)]"
              checked={settings.lockScreenShowDrugDetail}
              onChange={(e) => setSettings((s) => ({ ...s, lockScreenShowDrugDetail: e.target.checked }))}
            />
          </label>
          <div>
            <span className="block font-medium">强提醒方式（安卓 / 桌面端）</span>
            <span className="block text-sm text-neutral-500">
              弹窗通知始终开启；闹钟与语音二选一：闹钟 = 全屏持续响铃到处理为止，语音 = 直接念出药名与剂量。小程序与网页端不受此设置影响。
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(Object.keys(STRONG_ALERT_LABELS) as StrongAlertMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, strongAlertMode: mode }))}
                  className={`rounded-lg border px-2 py-2 text-sm ${
                    settings.strongAlertMode === mode
                      ? 'border-[var(--color-brand-primary)] bg-[var(--color-background-soft)] font-medium text-[var(--color-brand-primary)]'
                      : 'border-neutral-300 text-neutral-600'
                  }`}
                >
                  {STRONG_ALERT_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? '保存中…' : '保存设置'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
