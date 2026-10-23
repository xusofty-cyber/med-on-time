import { FormEvent, useEffect, useState } from 'react';
import { accountApi, authApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, ErrorText, Field, Modal, Spinner, TextInput } from '../components/ui';
import { ACCOUNT_STATUS_LABELS } from '../lib/dict';
import { fmtDateTime } from '../lib/time';
import type { UserSession } from '../lib/types';

export default function Settings() {
  const account = useApp((s) => s.account);
  const [nickname, setNickname] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [profileError, setProfileError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountApi
      .profile()
      .then((p) => {
        actions.setAccount(p);
        setNickname(p.nickname);
        setTimezone(p.timezone);
      })
      .catch(setProfileError);
    accountApi
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const saved = await accountApi.updateProfile({ nickname, timezone });
      actions.setAccount(saved);
      actions.toast('success', '账号资料已保存');
    } catch (err) {
      setProfileError(err);
    }
  };

  const revoke = async (s: UserSession) => {
    try {
      await accountApi.revokeSession(s.id);
      setSessions((list) => (list ?? []).filter((x) => x.id !== s.id));
      actions.toast('success', '该设备会话已退出');
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  const applyCancel = async () => {
    setBusy(true);
    try {
      await accountApi.cancel(cancelReason || undefined);
      actions.toast('info', '注销申请已提交，进入 30 天冷静期；冷静期内登录可撤销申请');
      setCancelOpen(false);
      const p = await accountApi.profile();
      actions.setAccount(p);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  const bindWechat = async () => {
    try {
      const r = await authApi.bindWechat();
      actions.toast('info', r.message ?? '微信绑定尚未开通');
    } catch (e) {
      actions.toast('info', e instanceof Error ? e.message : '微信绑定尚未开通');
    }
  };

  const cancelling = account?.status === 'cancelling';

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">设置</h1>

      <Card title="账号资料">
        <ErrorText error={profileError} />
        {!account ? (
          <Spinner />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={saveProfile}>
            <div className="flex flex-wrap gap-2 text-neutral-600">
              <span>
                手机号：{account.phoneMasked ?? '—'}
              </span>
              <Badge tone={cancelling ? 'amber' : 'green'}>
                {ACCOUNT_STATUS_LABELS[account.status] ?? account.status}
              </Badge>
              {account.registeredAt && <span>注册于 {fmtDateTime(account.registeredAt)}</span>}
            </div>
            <Field label="昵称">
              <TextInput value={nickname} onChange={setNickname} />
            </Field>
            <Field label="账号时区" hint="成员各自的提醒时间以成员时区为准，这里是账号默认时区">
              <TextInput value={timezone} onChange={setTimezone} placeholder="Asia/Shanghai" />
            </Field>
            <div>
              <Button type="submit">保存资料</Button>
            </div>
          </form>
        )}
      </Card>

      <Card title="账号绑定">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">微信绑定</p>
            <p className="text-sm text-neutral-500">绑定后可用微信登录并接收订阅消息提醒（尚未开通）</p>
          </div>
          <Button variant="soft" onClick={bindWechat}>
            绑定微信
          </Button>
        </div>
      </Card>

      <Card title="登录会话">
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-neutral-500">暂无会话记录。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {s.deviceName ?? s.userAgent ?? '未知设备'}
                    {s.current && (
                      <span className="ml-2">
                        <Badge tone="green">当前设备</Badge>
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {s.ipAddress ? `IP ${s.ipAddress} · ` : ''}
                    {s.lastActiveAt ? `最近活跃 ${fmtDateTime(s.lastActiveAt)}` : s.createdAt ? `登录于 ${fmtDateTime(s.createdAt)}` : ''}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" onClick={() => revoke(s)}>
                    退出该设备
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="注销账号">
        {cancelling ? (
          <div className="flex flex-col gap-3">
            <p className="text-amber-700">
              您的账号正在注销冷静期中
              {account?.cancelApplyAt ? `（申请于 ${fmtDateTime(account.cancelApplyAt)}）` : ''}。冷静期 30
              天内数据保留、可正常登录并联系客服撤销；期满后可识别个人信息将被物理删除，健康明细做不可逆匿名化归档。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-neutral-600">
              注销后将无法再管理成员用药与照护授权。提交申请后进入 <strong>30 天冷静期</strong>
              ，期间可撤销；期满自动执行删除与匿名化。
            </p>
            <div>
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                申请注销账号
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={cancelOpen} title="确认申请注销" onClose={() => setCancelOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-800">
            <p className="font-medium">请先了解注销规则（30 天冷静期）</p>
            <ul className="mt-2 list-disc pl-5">
              <li>提交后账号进入冷静期，30 天内可登录撤销申请，数据不受影响；</li>
              <li>冷静期满：手机号、昵称等可识别信息被物理删除；</li>
              <li>健康与用药明细做不可逆匿名化后归档，无法再关联到您本人；</li>
              <li>您发出的照护授权将同时失效，被授权照护的成员请提前另行安排。</li>
            </ul>
          </div>
          <Field label="注销原因（选填）">
            <TextInput value={cancelReason} onChange={setCancelReason} placeholder="帮助我们改进" />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCancelOpen(false)}>
              再想想
            </Button>
            <Button variant="danger" className="flex-1" disabled={busy} onClick={applyCancel}>
              {busy ? '提交中…' : '确认申请注销'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
