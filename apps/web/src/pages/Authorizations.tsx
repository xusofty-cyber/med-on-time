import { FormEvent, useEffect, useState } from 'react';
import { authorizationApi, memberApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { authStatusLabels, levelLabels, relationshipLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';
import { fmtDate, fmtDateTime } from '../lib/time';
import type { Authorization } from '../lib/types';

const MAX_CAREGIVERS = 5;

export default function Authorizations() {
  const tr = useT();
  const members = useApp((s) => s.members);
  const [list, setList] = useState<{ granted: Authorization[]; received: Authorization[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setList(await authorizationApi.list());
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const mine = list?.granted ?? [];
  const incoming = list?.received ?? [];
  const ownMembers = members.filter((m) => !m.accessLevel || m.accessLevel === 'owner');
  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? tr('authz.memberFallback');

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      actions.toast('success', ok);
      await load();
      memberApi.list().then(actions.setMembers).catch(() => undefined);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('common.operationFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-medgreen-dark">{tr('authz.title')}</h1>
        <Button disabled={ownMembers.length === 0} onClick={() => setFormOpen(true)}>
          {tr('authz.createBtn')}
        </Button>
      </div>
      <p className="text-neutral-600">
        {tr('authz.intro', { max: MAX_CAREGIVERS })}
      </p>
      <ErrorText error={error} />
      {list === null ? (
        <Spinner />
      ) : (
        <>
          <Card title={tr('authz.grantedCard')}>
            {mine.length === 0 ? (
              <EmptyState text={tr('authz.grantedEmpty')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.map((a) => (
                  <AuthRow key={a.id} auth={a} title={tr('authz.grantedRow', { name: a.caregiverNickname ?? tr('authz.inviteeFallback'), member: memberName(a.memberId) })}>
                    {(a.status === 'active' || a.status === 'pending_accept') && (
                      <Button
                        variant="ghost"
                        disabled={busyId === a.id}
                        onClick={() => {
                          if (window.confirm(tr('authz.revokeConfirm')))
                            act(a.id, () => authorizationApi.revoke(a.id), tr('authz.revokedToast'));
                        }}
                      >
                        {tr('authz.revokeBtn')}
                      </Button>
                    )}
                  </AuthRow>
                ))}
              </ul>
            )}
          </Card>
          <Card title={tr('authz.receivedCard')}>
            {incoming.length === 0 ? (
              <EmptyState text={tr('authz.receivedEmpty')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {incoming.map((a) => (
                  <AuthRow
                    key={a.id}
                    auth={a}
                    title={tr('authz.receivedRow', { name: a.grantorNickname ?? tr('authz.grantorFallback'), member: a.memberName ?? memberName(a.memberId) })}
                  >
                    {a.status === 'pending_accept' && (
                      <>
                        <Button disabled={busyId === a.id} onClick={() => act(a.id, () => authorizationApi.accept(a.id), tr('authz.acceptedToast'))}>
                          {tr('authz.acceptBtn')}
                        </Button>
                        <Button variant="ghost" disabled={busyId === a.id} onClick={() => act(a.id, () => authorizationApi.reject(a.id), tr('authz.rejectedToast'))}>
                          {tr('authz.rejectBtn')}
                        </Button>
                      </>
                    )}
                    {a.status === 'active' && (
                      <Button
                        variant="ghost"
                        disabled={busyId === a.id}
                        onClick={() => {
                          if (window.confirm(tr('authz.leaveConfirm')))
                            act(a.id, () => authorizationApi.revoke(a.id), tr('authz.leftToast'));
                        }}
                      >
                        {tr('authz.leaveBtn')}
                      </Button>
                    )}
                  </AuthRow>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      {formOpen && (
        <CreateAuthModal
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AuthRow({ auth, title, children }: { auth: Authorization; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3">
      <div>
        <p className="font-medium">
          {title}
          <span className="ml-2">
            <Badge tone={auth.status === 'active' ? 'green' : auth.status === 'pending_accept' ? 'amber' : 'gray'}>
              {authStatusLabels()[auth.status] ?? auth.status}
            </Badge>
          </span>
          <span className="ml-2">
            <Badge tone="blue">{levelLabels()[auth.level] ?? auth.level}</Badge>
          </span>
        </p>
        <p className="mt-0.5 text-sm text-neutral-500">
          {tr('authz.invitedAt', { time: fmtDateTime(auth.invitedAt) })}
          {auth.expiresAt ? ` · ${tr('authz.expiresAt', { date: fmtDate(auth.expiresAt) })}` : ` · ${tr('authz.longTerm')}`}
          {auth.caregiverPhoneMasked ? ` · ${auth.caregiverPhoneMasked}` : ''}
        </p>
      </div>
      <div className="flex gap-2">{children}</div>
    </li>
  );
}

function CreateAuthModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const members = useApp((s) => s.members).filter((m) => !m.accessLevel || m.accessLevel === 'owner');
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const [caregiverPhone, setCaregiverPhone] = useState('');
  const [level, setLevel] = useState('L2');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!memberId) {
      setError(new Error(tr('authz.needMember')));
      return;
    }
    if (!/^1\d{10}$/.test(caregiverPhone)) {
      setError(new Error(tr('authz.invalidPhone')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authorizationApi.create({
        memberId,
        caregiverPhone,
        level,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      actions.toast('success', tr('authz.invitedToast'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={tr('authz.createTitle')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={tr('authz.selectMember')}>
          <Select
            value={memberId}
            onChange={setMemberId}
            options={members.map((m) => ({
              value: m.id,
              label: tr('authz.memberOption', { name: m.displayName, rel: relationshipLabels()[m.relationship] ?? m.relationship }),
            }))}
          />
        </Field>
        <Field label={tr('authz.caregiverPhone')} hint={tr('authz.caregiverPhoneHint')}>
          <TextInput value={caregiverPhone} onChange={setCaregiverPhone} type="tel" placeholder={tr('auth.phoneShortPlaceholder')} required />
        </Field>
        <Field label={tr('authz.level')}>
          <Select value={level} onChange={setLevel} options={Object.entries(levelLabels()).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label={tr('authz.expiresLabel')}>
          <input className="input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {tr('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? tr('auth.sending') : tr('authz.sendInvite')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
