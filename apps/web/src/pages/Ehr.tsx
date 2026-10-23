import { FormEvent, useEffect, useState } from 'react';
import { ehrApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { ALLERGEN_TYPE_LABELS, SEVERITY_LABELS, SYMPTOM_TAGS } from '../lib/dict';
import { fmtDateTime } from '../lib/time';
import type { AdverseRecord, Allergy, EmergencyContact } from '../lib/types';

type Tab = 'allergies' | 'adverse' | 'contacts' | 'records';

export default function Ehr() {
  const memberId = useApp((s) => s.currentMemberId);
  const [tab, setTab] = useState<Tab>('allergies');

  if (!memberId) {
    return (
      <Card>
        <EmptyState text="请先添加成员。" />
      </Card>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'allergies', label: '过敏档案' },
    { key: 'adverse', label: '服药后不适' },
    { key: 'contacts', label: '紧急联系人' },
    { key: 'records', label: '健康概况' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">健康档案</h1>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="健康档案栏目">
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
      actions.toast('success', '过敏档案已保存');
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="过敏档案">
      <ErrorText error={error} />
      {items === null ? (
        <Spinner />
      ) : (
        <>
          {items.length === 0 ? (
            <EmptyState text="暂无过敏记录。如有药物/食物过敏，请在下方添加，添加计划时会做提醒。" />
          ) : (
            <ul className="mb-5 flex flex-col gap-2">
              {items.map((a, i) => (
                <li key={a.id ?? i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-4 py-3">
                  <div>
                    <span className="font-semibold text-red-900">{a.allergen}</span>
                    <span className="ml-2 text-sm text-red-700">
                      {ALLERGEN_TYPE_LABELS[a.allergenType] ?? a.allergenType}
                      {a.severity ? ` · ${SEVERITY_LABELS[a.severity] ?? a.severity}` : ''}
                    </span>
                    {a.reaction && <p className="text-sm text-red-700">反应：{a.reaction}</p>}
                    {a.note && <p className="text-sm text-red-700">备注：{a.note}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => saveAll(items.filter((_, xi) => xi !== i))}
                  >
                    删除
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
            <Field label="过敏原名称">
              <TextInput value={draft.allergen} onChange={(v) => setDraft({ ...draft, allergen: v })} placeholder="如：青霉素、头孢类" required />
            </Field>
            <Field label="过敏原类型">
              <Select
                value={draft.allergenType}
                onChange={(v) => setDraft({ ...draft, allergenType: v })}
                options={Object.entries(ALLERGEN_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="严重程度">
              <Select
                value={draft.severity ?? 'mild'}
                onChange={(v) => setDraft({ ...draft, severity: v })}
                options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="过敏反应（选填）">
              <TextInput value={draft.reaction ?? ''} onChange={(v) => setDraft({ ...draft, reaction: v })} placeholder="如：皮疹、呼吸困难" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                + 添加过敏记录
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
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
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
      actions.toast('error', '请至少选择一个不适症状');
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
      actions.toast('success', '不适记录已保存');
      setTags([]);
      setDescription('');
      await load();
    } catch (err) {
      actions.toast('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="记录一次服药后不适">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div>
            <span className="field-label">症状（可多选）</span>
            <div className="flex flex-wrap gap-2">
              {SYMPTOM_TAGS.map((t) => {
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
            <Field label="严重程度">
              <Select
                value={severity}
                onChange={setSeverity}
                options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="发生时间">
              <input className="input" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </Field>
          </div>
          <Field label="补充描述（选填）">
            <TextInput value={description} onChange={setDescription} placeholder="如：服药后半小时开始头晕，休息后缓解" />
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              保存记录
            </Button>
          </div>
          <p className="text-sm text-neutral-500">如出现呼吸困难、意识模糊等严重不适，请立即就医，不要只在这里记录。</p>
        </form>
      </Card>
      <Card title="历史不适记录">
        <ErrorText error={error} />
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="暂无不适记录。" />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-xl bg-neutral-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{fmtDateTime(r.occurredAt)}</span>
                  <Badge tone={r.severity === 'severe' ? 'red' : r.severity === 'moderate' ? 'amber' : 'gray'}>
                    {SEVERITY_LABELS[r.severity] ?? r.severity}
                  </Badge>
                  {r.symptomTags.map((t) => (
                    <Badge key={t} tone="blue">
                      {SYMPTOM_TAGS.find((x) => x.value === t)?.label ?? t}
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
    if (!window.confirm(`删除紧急联系人「${c.contactName}」？`)) return;
    try {
      await ehrApi.removeContact(memberId, c.id);
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <Card title="紧急联系人（每位成员最多 3 位）">
      <ErrorText error={error} />
      {items === null ? (
        <Spinner />
      ) : (
        <>
          {items.length === 0 ? (
            <EmptyState text="暂无紧急联系人。出事时能第一时间联系上的人，请至少添加一位。" />
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {[...items]
                .sort((a, b) => a.priority - b.priority)
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3">
                    <div>
                      <span className="font-semibold">{c.contactName}</span>
                      <span className="ml-2 text-neutral-600">
                        {c.relationship} · 优先级 {c.priority}
                      </span>
                      <p className="text-neutral-600">{c.phone ?? c.phoneMasked ?? ''}</p>
                      {c.note && <p className="text-sm text-neutral-500">{c.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setEditing(c)}>
                        编辑
                      </Button>
                      <Button variant="ghost" onClick={() => remove(c)}>
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <Button disabled={items.length >= 3} onClick={() => setEditing('new')}>
            + 添加联系人{items.length >= 3 ? '（已达上限）' : ''}
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
      actions.toast('success', '紧急联系人已保存');
      onSaved();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Modal open title={isNew ? '添加紧急联系人' : '编辑紧急联系人'} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="姓名">
          <TextInput value={contactName} onChange={setContactName} required />
        </Field>
        <Field label="电话">
          <TextInput value={phone} onChange={setPhone} type="tel" required />
        </Field>
        <Field label="关系（自由填写）">
          <TextInput value={relationship} onChange={setRelationship} placeholder="如：长女、邻居、社区医生" required />
        </Field>
        <Field label="优先级（1 最高）">
          <TextInput value={priority} onChange={setPriority} type="number" />
        </Field>
        <Field label="备注（选填）">
          <TextInput value={note} onChange={setNote} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="flex-1">
            保存
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
      actions.toast('success', '健康概况已保存（摘要加密存储）');
    } catch (err) {
      actions.toast('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="健康概况（每位成员一份，持续更新）">
      <ErrorText error={error} />
      {!loaded ? (
        <Spinner />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="血型">
              <Select
                value={bloodType}
                onChange={setBloodType}
                options={[
                  { value: '', label: '未填写' },
                  { value: 'A', label: 'A 型' },
                  { value: 'B', label: 'B 型' },
                  { value: 'AB', label: 'AB 型' },
                  { value: 'O', label: 'O 型' },
                  { value: 'unknown', label: '不清楚' },
                ]}
              />
            </Field>
            <Field label="常去医院（选填）">
              <TextInput value={primaryHospital} onChange={setPrimaryHospital} placeholder="如：市人民医院" />
            </Field>
            <Field label="身高（cm，选填）">
              <TextInput value={heightCm} onChange={setHeightCm} type="number" placeholder="如：165" />
            </Field>
            <Field label="体重（kg，选填）">
              <TextInput value={weightKg} onChange={setWeightKg} type="number" placeholder="如：60" />
            </Field>
          </div>
          <Field label="健康摘要（选填）" hint="既往病史、手术史、长期注意事项等；正文在服务端字段加密存储，仅本人及被授权照护人可见">
            <textarea
              className="input min-h-[120px]"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="如：2019 年阑尾切除术；高血压 10 年，长期服药控制中"
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存健康概况'}
            </Button>
            {updatedAt && <span className="text-sm text-neutral-500">最近更新 {fmtDateTime(updatedAt)}</span>}
          </div>
        </form>
      )}
    </Card>
  );
}
