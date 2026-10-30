import { FormEvent, useEffect, useState } from 'react';
import { memberApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { genderLabels, relationshipLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
import { cyclePresets, strongAlertLabels, type CareSettings, type CyclePresetKey, type Member, type StrongAlertMode } from '../lib/types';

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
  const tr = useT();
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
    if (!window.confirm(tr('member.deleteConfirm', { name: m.displayName }))) return;
    try {
      await memberApi.remove(m.id);
      actions.toast('success', tr('member.deletedToast'));
      await refresh();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('member.deleteFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-medgreen-dark">{tr('member.title')}</h1>
        <Button disabled={ownCount >= MAX_MEMBERS} onClick={() => setEditing('new')}>
          {tr('member.addBtn')}
        </Button>
      </div>
      <p className="text-neutral-600">
        {tr('member.quotaNote', {
          max: MAX_MEMBERS,
          own: ownCount,
          limitSuffix: ownCount >= MAX_MEMBERS ? tr('member.quotaLimitSuffix') : '',
        })}
      </p>
      <ErrorText error={error} />
      {members.length === 0 ? (
        <Card>
          <EmptyState text={tr('member.empty')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold">
                    {m.displayName}
                    {m.id === currentMemberId && <Badge tone="green">{tr('nav.currentMember')}</Badge>}
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {relationshipLabels()[m.relationship] ?? m.relationship}
                    {m.gender ? ` · ${genderLabels()[m.gender] ?? m.gender}` : ''}
                    {m.birthDate ? ` · ${tr('member.born', { date: m.birthDate.slice(0, 10) })}` : ''}
                  </p>
                  {m.accessLevel && m.accessLevel !== 'owner' && (
                    <p className="mt-1 text-neutral-600">{tr('member.authFrom', { level: m.accessLevel })}</p>
                  )}
                </div>
                <Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? tr('member.statusActive') : m.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {m.id !== currentMemberId && (
                  <Button variant="soft" onClick={() => actions.setCurrentMember(m.id)}>
                    {tr('member.switchBtn')}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setCareTarget(m)}>
                  {tr('member.careBtn')}
                </Button>
                {(!m.accessLevel || m.accessLevel === 'owner') && (
                  <>
                    <Button variant="ghost" onClick={() => setEditing(m)}>
                      {tr('common.edit')}
                    </Button>
                    <Button variant="ghost" onClick={() => remove(m)}>
                      {tr('common.delete')}
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
      actions.toast('success', isNew ? tr('member.addedToast') : tr('member.updatedToast'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={isNew ? tr('member.addTitle') : tr('member.editTitle')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={tr('member.displayName')}>
          <TextInput value={displayName} onChange={setDisplayName} placeholder={tr('member.displayNamePlaceholder')} required />
        </Field>
        <Field label={tr('member.relationshipLabel')}>
          <Select
            value={relationship}
            onChange={setRelationship}
            options={Object.entries(relationshipLabels()).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label={tr('member.gender')}>
          <Select
            value={gender}
            onChange={setGender}
            options={Object.entries(genderLabels()).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label={tr('member.birthDateOptional')}>
          <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {tr('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? tr('planForm.saving') : tr('common.save')}
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
    const p = cyclePresets()[key];
    setSettings((s) => ({ ...s, cyclePreset: key, cycleWindowMinutes: p.windowMinutes, cycleIntervalMinutes: p.intervalMinutes }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await memberApi.putCareSettings(member.id, settings);
      actions.toast('success', tr('member.careSavedToast'));
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={tr('member.careTitle', { name: member.displayName })} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">{tr('member.careMode')}</span>
              <span className="block text-sm text-neutral-500">{tr('member.careModeDesc')}</span>
            </span>
            <input
              type="checkbox"
              className="h-6 w-6 accent-[var(--color-brand-primary)]"
              checked={settings.careMode}
              onChange={(e) => setSettings((s) => ({ ...s, careMode: e.target.checked }))}
            />
          </label>
          <Field label={tr('member.cycleLabel')}>
            <Select
              value={settings.cyclePreset}
              onChange={(v) => setPreset(v as CyclePresetKey)}
              options={Object.entries(cyclePresets()).map(([value, p]) => ({ value, label: p.label }))}
            />
          </Field>
          <p className="-mt-2 text-sm text-neutral-500">
            {tr('member.cycleCurrent', { window: settings.cycleWindowMinutes, interval: settings.cycleIntervalMinutes })}
          </p>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">{tr('member.lockScreen')}</span>
              <span className="block text-sm text-neutral-500">{tr('member.lockScreenDesc')}</span>
            </span>
            <input
              type="checkbox"
              className="h-6 w-6 accent-[var(--color-brand-primary)]"
              checked={settings.lockScreenShowDrugDetail}
              onChange={(e) => setSettings((s) => ({ ...s, lockScreenShowDrugDetail: e.target.checked }))}
            />
          </label>
          <div>
            <span className="block font-medium">{tr('member.strongAlert')}</span>
            <span className="block text-sm text-neutral-500">
              {tr('member.strongAlertDesc')}
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(Object.keys(strongAlertLabels()) as StrongAlertMode[]).map((mode) => (
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
                  {strongAlertLabels()[mode]}
                </button>
              ))}
            </div>
          </div>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              {tr('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? tr('planForm.saving') : tr('member.saveSettings')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
