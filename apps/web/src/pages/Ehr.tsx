import { FormEvent, useEffect, useState } from 'react';
import { ehrApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { allergenTypeLabels, severityLabels, symptomTags } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
import { fmtDateTime, nowLocalDateTime } from '../lib/time';
import type { AdverseRecord, Allergy, EmergencyContact } from '../lib/types';

type Tab = 'allergies' | 'adverse' | 'contacts' | 'records';

export default function Ehr() {
  const tr = useT();
  const memberId = useApp((s) => s.currentMemberId);
  const [tab, setTab] = useState<Tab>('allergies');

  if (!memberId) {
    return (
      <Card>
        <EmptyState text={tr('ehr.noMember')} />
      </Card>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'allergies', label: tr('ehr.tabAllergies') },
    { key: 'adverse', label: tr('ehr.tabAdverse') },
    { key: 'contacts', label: tr('ehr.tabContacts') },
    { key: 'records', label: tr('ehr.tabRecords') },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">{tr('nav.ehr')}</h1>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={tr('ehr.tabsAria')}>
        {tabs.map((t) => (
          <Button key={t.key} variant={tab === t.key ? 'primary' : 'ghost'} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === 'allergies' && <Allergies memberId={memberId} />}
      {tab === 'adverse' && <Adverse memberId={memberId} />}
      {tab === 'contacts' && <Contacts memberId={memberId} />}
      {tab === 'records' && <Records memberId={memberId} />}
    </div>
  );
}

/* 过敏档案：GET 列表 + PUT 整体保存（契约口径）。命中药品时为强警告口径，此处仅维护档案。 */
function Allergies({ memberId }: { memberId: string }) {
  const [items, setItems] = useState<Allergy[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Allergy>({ allergen: '', allergenType: 'other', severity: 'mild', reaction: '', note: '' });

  const load = async () => {
    try {
      setItems(await ehrApi.getAllergies(memberId));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const saveAll = async (next: Allergy[]) => {
    setBusy(true);
    try {
      setItems(await ehrApi.putAllergies(memberId, next));
      actions.toast('success', tr('ehr.allergySavedToast'));
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('ehr.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={tr('ehr.tabAllergies')}>
      <ErrorText error={error} />
      {items === null ? (
        <Spinner />
      ) : (
        <>
          {items.length === 0 ? (
            <EmptyState text={tr('ehr.allergyEmpty')} />
          ) : (
            <ul className="mb-5 flex flex-col gap-2">
              {items.map((a, i) => (
                <li key={a.id ?? i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-4 py-3">
                  <div>
                    <span className="font-semibold text-red-900">{a.allergen}</span>
                    <span className="ml-2 text-sm text-red-700">
                      {allergenTypeLabels()[a.allergenType] ?? a.allergenType}
                      {a.severity ? ` · ${severityLabels()[a.severity] ?? a.severity}` : ''}
                    </span>
                    {a.reaction && <p className="text-sm text-red-700">{tr('ehr.allergyReaction', { text: a.reaction })}</p>}
                    {a.note && <p className="text-sm text-red-700">{tr('ehr.allergyNote', { text: a.note })}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => saveAll(items.filter((_, xi) => xi !== i))}
                  >
                    {tr('common.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.allergen.trim()) return;
              saveAll([...(items ?? []), draft]);
              setDraft({ allergen: '', allergenType: 'other', severity: 'mild', reaction: '', note: '' });
            }}
          >
            <Field label={tr('ehr.allergenName')}>
              <TextInput value={draft.allergen} onChange={(v) => setDraft({ ...draft, allergen: v })} placeholder={tr('ehr.allergenPlaceholder')} required />
            </Field>
            <Field label={tr('ehr.allergenType')}>
              <Select
                value={draft.allergenType}
                onChange={(v) => setDraft({ ...draft, allergenType: v })}
                options={Object.entries(allergenTypeLabels()).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label={tr('ehr.severity')}>
              <Select
                value={draft.severity ?? 'mild'}
                onChange={(v) => setDraft({ ...draft, severity: v })}
                options={Object.entries(severityLabels()).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label={tr('ehr.reactionOptional')}>
              <TextInput value={draft.reaction ?? ''} onChange={(v) => setDraft({ ...draft, reaction: v })} placeholder={tr('ehr.reactionPlaceholder')} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {tr('ehr.addAllergyBtn')}
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}

function Adverse({ memberId }: { memberId: string }) {
  const [items, setItems] = useState<AdverseRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('mild');
  const [occurredAt, setOccurredAt] = useState(() => nowLocalDateTime());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setItems(await ehrApi.listAdverse(memberId));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tags.length === 0) {
      actions.toast('error', tr('ehr.adverseNeedTag'));
      return;
    }
    setBusy(true);
    try {
      await ehrApi.createAdverse(memberId, {
        symptomTags: tags,
        description: description || undefined,
        severity,
        occurredAt: new Date(occurredAt).toISOString(),
      });
      actions.toast('success', tr('ehr.adverseSavedToast'));
      setTags([]);
      setDescription('');
      await load();
    } catch (err) {
      actions.toast('error', err instanceof Error ? err.message : tr('ehr.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title={tr('ehr.adverseRecordTitle')}>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div>
            <span className="field-label">{tr('ehr.adverseSymptoms')}</span>
            <div className="flex flex-wrap gap-2">
              {symptomTags().map((t) => {
                const active = tags.includes(t.value);
                return (
                  <button
                    type="button"
                    key={t.value}
                    className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTags((cur) => (active ? cur.filter((x) => x !== t.value) : [...cur, t.value]))}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr('ehr.severity')}>
              <Select
                value={severity}
                onChange={setSeverity}
                options={Object.entries(severityLabels()).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label={tr('ehr.adverseOccurredAt')}>
              <input className="input" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </Field>
          </div>
          <Field label={tr('ehr.adverseDescOptional')}>
            <TextInput value={description} onChange={setDescription} placeholder={tr('ehr.adverseDescPlaceholder')} />
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              {tr('ehr.adverseSave')}
            </Button>
          </div>
          <p className="text-sm text-neutral-500">{tr('ehr.adverseEmergencyNote')}</p>
        </form>
      </Card>
      <Card title={tr('ehr.adverseHistoryTitle')}>
        <ErrorText error={error} />
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text={tr('ehr.adverseEmpty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-xl bg-neutral-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{fmtDateTime(r.occurredAt)}</span>
                  <Badge tone={r.severity === 'severe' ? 'red' : r.severity === 'moderate' ? 'amber' : 'gray'}>
                    {severityLabels()[r.severity] ?? r.severity}
                  </Badge>
                  {r.symptomTags.map((t) => (
                    <Badge key={t} tone="blue">
                      {symptomTags().find((x) => x.value === t)?.label ?? t}
                    </Badge>
                  ))}
                </div>
                {r.description && <p className="mt-1 text-neutral-600">{r.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Contacts({ memberId }: { memberId: string }) {
  const [items, setItems] = useState<EmergencyContact[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<EmergencyContact | 'new' | null>(null);

  const load = async () => {
    try {
      setItems(await ehrApi.listContacts(memberId));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const remove = async (c: EmergencyContact) => {
    if (!window.confirm(tr('ehr.contactDeleteConfirm', { name: c.contactName }))) return;
    try {
      await ehrApi.removeContact(memberId, c.id);
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('ehr.deleteFailed'));
    }
  };

  return (
    <Card title={tr('ehr.contactsTitle')}>
      <ErrorText error={error} />
      {items === null ? (
        <Spinner />
      ) : (
        <>
          {items.length === 0 ? (
            <EmptyState text={tr('ehr.contactsEmpty')} />
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {[...items]
                .sort((a, b) => a.priority - b.priority)
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3">
                    <div>
                      <span className="font-semibold">{c.contactName}</span>
                      <span className="ml-2 text-neutral-600">
                        {c.relationship} · {tr('ehr.contactPriority', { n: c.priority })}
                      </span>
                      <p className="text-neutral-600">{c.phone ?? c.phoneMasked ?? ''}</p>
                      {c.note && <p className="text-sm text-neutral-500">{c.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setEditing(c)}>
                        {tr('common.edit')}
                      </Button>
                      <Button variant="ghost" onClick={() => remove(c)}>
                        {tr('common.delete')}
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <Button disabled={items.length >= 3} onClick={() => setEditing('new')}>
            {tr('ehr.addContactBtn')}{items.length >= 3 ? tr('ehr.limitSuffix') : ''}
          </Button>
        </>
      )}
      {editing && (
        <ContactForm
          memberId={memberId}
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </Card>
  );
}

function ContactForm({
  memberId,
  target,
  onClose,
  onSaved,
}: {
  memberId: string;
  target: EmergencyContact | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = target === 'new';
  const c = isNew ? null : target;
  const [contactName, setContactName] = useState(c?.contactName ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [relationship, setRelationship] = useState(c?.relationship ?? '');
  const [priority, setPriority] = useState(String(c?.priority ?? 1));
  const [note, setNote] = useState(c?.note ?? '');
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { contactName, phone, relationship, priority: Number(priority) || 1, note: note || undefined };
    try {
      if (isNew) await ehrApi.createContact(memberId, body);
      else if (c) await ehrApi.updateContact(memberId, c.id, body);
      actions.toast('success', tr('ehr.contactSavedToast'));
      onSaved();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Modal open title={isNew ? tr('ehr.addContactTitle') : tr('ehr.editContactTitle')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={tr('ehr.contactName')}>
          <TextInput value={contactName} onChange={setContactName} required />
        </Field>
        <Field label={tr('ehr.contactPhone')}>
          <TextInput value={phone} onChange={setPhone} type="tel" required />
        </Field>
        <Field label={tr('ehr.contactRelationship')}>
          <TextInput value={relationship} onChange={setRelationship} placeholder={tr('ehr.contactRelationshipPlaceholder')} required />
        </Field>
        <Field label={tr('ehr.contactPriorityLabel')}>
          <TextInput value={priority} onChange={setPriority} type="number" />
        </Field>
        <Field label={tr('ehr.noteOptional')}>
          <TextInput value={note} onChange={setNote} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {tr('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1">
            {tr('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* 健康概况：后端为每位成员一条档案（血型/身高/体重/常去医院/健康摘要），upsert 保存。 */
function Records({ memberId }: { memberId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [bloodType, setBloodType] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [primaryHospital, setPrimaryHospital] = useState('');
  const [summary, setSummary] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ehrApi
      .getMedicalProfile(memberId)
      .then((p) => {
        if (p) {
          setBloodType(p.bloodType ?? '');
          setHeightCm(p.heightCm != null ? String(p.heightCm) : '');
          setWeightKg(p.weightKg != null ? String(p.weightKg) : '');
          setPrimaryHospital(p.primaryHospital ?? '');
          setSummary(p.summary ?? '');
          setUpdatedAt(p.updatedAt ?? null);
        }
      })
      .catch(setError)
      .finally(() => setLoaded(true));
  }, [memberId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await ehrApi.upsertMedicalProfile(memberId, {
        bloodType: bloodType || undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        primaryHospital: primaryHospital || undefined,
        summary: summary || undefined,
      });
      setUpdatedAt(saved.updatedAt ?? null);
      actions.toast('success', tr('ehr.recordsSavedToast'));
    } catch (err) {
      actions.toast('error', err instanceof Error ? err.message : tr('ehr.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={tr('ehr.recordsTitle')}>
      <ErrorText error={error} />
      {!loaded ? (
        <Spinner />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr('ehr.bloodType')}>
              <Select
                value={bloodType}
                onChange={setBloodType}
                options={[
                  { value: '', label: tr('ehr.bloodUnfilled') },
                  { value: 'A', label: tr('ehr.bloodLabel', { type: 'A' }) },
                  { value: 'B', label: tr('ehr.bloodLabel', { type: 'B' }) },
                  { value: 'AB', label: tr('ehr.bloodLabel', { type: 'AB' }) },
                  { value: 'O', label: tr('ehr.bloodLabel', { type: 'O' }) },
                  { value: 'unknown', label: tr('ehr.bloodUnknown') },
                ]}
              />
            </Field>
            <Field label={tr('ehr.hospitalOptional')}>
              <TextInput value={primaryHospital} onChange={setPrimaryHospital} placeholder={tr('ehr.hospitalPlaceholder')} />
            </Field>
            <Field label={tr('ehr.heightOptional')}>
              <TextInput value={heightCm} onChange={setHeightCm} type="number" placeholder={tr('ehr.heightPlaceholder')} />
            </Field>
            <Field label={tr('ehr.weightOptional')}>
              <TextInput value={weightKg} onChange={setWeightKg} type="number" placeholder={tr('ehr.weightPlaceholder')} />
            </Field>
          </div>
          <Field label={tr('ehr.summaryOptional')} hint={tr('ehr.summaryHint')}>
            <textarea
              className="input min-h-[120px]"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={tr('ehr.summaryPlaceholder')}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? tr('planForm.saving') : tr('ehr.recordsSave')}
            </Button>
            {updatedAt && <span className="text-sm text-neutral-500">{tr('ehr.recordsUpdatedAt', { time: fmtDateTime(updatedAt) })}</span>}
          </div>
        </form>
      )}
    </Card>
  );
}
