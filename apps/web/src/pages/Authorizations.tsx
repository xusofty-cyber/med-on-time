import { FormEvent, useEffect, useState } from 'react';
import { authorizationApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { AUTH_STATUS_LABELS, LEVEL_LABELS, RELATIONSHIP_LABELS } from '../lib/dict';
import { fmtDate, fmtDateTime } from '../lib/time';
import type { Authorization } from '../lib/types';

const MAX_CAREGIVERS = 5;

export default function Authorizations() {
  const account = useApp((s) => s.account);
  const members = useApp((s) => s.members);
  const [list, setList] = useState<Authorization[] | null>(null);
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

  const mine = (list ?? []).filter((a) => a.grantedByAccountId === account?.id);
  const incoming = (list ?? []).filter((a) => a.grantedByAccountId !== account?.id);
  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? '成员';

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      actions.toast('success', ok);
      await load();
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-medgreen-dark">照护授权</h1>
        <Button onClick={() => setFormOpen(true)}>+ 发起授权</Button>
      </div>
      <p className="text-neutral-600">
        授权家人或照护人代为查看（L1）、协助打卡（L2）或配置计划（L3）。每位成员最多 {MAX_CAREGIVERS} 位照护人；所有代操作都会双记录操作人与归属成员。
      </p>
      <ErrorText error={error} />
      {list === null ? (
        <Spinner />
      ) : (
        <>
          <Card title="我授权的人（我把成员托付给他人照护）">
            {mine.length === 0 ? (
              <EmptyState text="暂无发出的授权。" />
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.map((a) => (
                  <AuthRow key={a.id} auth={a} title={`${a.caregiverNickname ?? '受邀人'} 照护 ${memberName(a.memberId)}`}>
                    {(a.status === 'active' || a.status === 'pending_accept') && (
                      <Button
                        variant="ghost"
                        disabled={busyId === a.id}
                        onClick={() => {
                          if (window.confirm('确定撤销这份授权吗？撤销后对方立即无法访问该成员数据。'))
                            act(a.id, () => authorizationApi.revoke(a.id), '授权已撤销');
                        }}
                      >
                        撤销
                      </Button>
                    )}
                  </AuthRow>
                ))}
              </ul>
            )}
          </Card>
          <Card title="授权我的人（他人把成员托付给我照护）">
            {incoming.length === 0 ? (
              <EmptyState text="暂无收到的授权邀请。" />
            ) : (
              <ul className="flex flex-col gap-2">
                {incoming.map((a) => (
                  <AuthRow
                    key={a.id}
                    auth={a}
                    title={`${a.grantorNickname ?? '授权人'} 邀请您照护 ${a.memberName ?? memberName(a.memberId)}`}
                  >
                    {a.status === 'pending_accept' && (
                      <>
                        <Button disabled={busyId === a.id} onClick={() => act(a.id, () => authorizationApi.accept(a.id), '已接受授权，现在可切换到该成员查看')}>
                          接受
                        </Button>
                        <Button variant="ghost" disabled={busyId === a.id} onClick={() => act(a.id, () => authorizationApi.reject(a.id), '已拒绝该邀请')}>
                          拒绝
                        </Button>
                      </>
                    )}
                    {a.status === 'active' && (
                      <Button
                        variant="ghost"
                        disabled={busyId === a.id}
                        onClick={() => {
                          if (window.confirm('退出这份照护授权？之后您将不能再访问该成员数据。'))
                            act(a.id, () => authorizationApi.revoke(a.id), '已退出照护');
                        }}
                      >
                        退出照护
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
              {AUTH_STATUS_LABELS[auth.status] ?? auth.status}
            </Badge>
          </span>
          <span className="ml-2">
            <Badge tone="blue">{LEVEL_LABELS[auth.level] ?? auth.level}</Badge>
          </span>
        </p>
        <p className="mt-0.5 text-sm text-neutral-500">
          邀请于 {fmtDateTime(auth.invitedAt)}
          {auth.expiresAt ? ` · 到期 ${fmtDate(auth.expiresAt)}` : ' · 长期有效'}
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
    if (!/^1\d{10}$/.test(caregiverPhone)) {
      setError(new Error('请输入受邀人正确的 11 位手机号（对方需已注册药准时账号）'));
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
      actions.toast('success', '授权邀请已发出，等待对方接受');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="发起照护授权" onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="选择成员">
          <Select
            value={memberId}
            onChange={setMemberId}
            options={members.map((m) => ({
              value: m.id,
              label: `${m.displayName}（${RELATIONSHIP_LABELS[m.relationship] ?? m.relationship}）`,
            }))}
          />
        </Field>
        <Field label="受邀人手机号" hint="对方需已注册药准时账号，邀请会出现在对方的「照护授权」页">
          <TextInput value={caregiverPhone} onChange={setCaregiverPhone} type="tel" placeholder="11 位手机号" required />
        </Field>
        <Field label="授权级别">
          <Select value={level} onChange={setLevel} options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="到期日期（留空 = 长期有效）">
          <input className="input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? '发送中…' : '发出邀请'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
