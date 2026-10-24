import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { accountApi, authApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { ACCOUNT_STATUS_LABELS } from '../lib/dict';
import { fmtDateTime, isValidTimeZone } from '../lib/time';
import { qrToDataUrl } from '../lib/qr';
import type { UserSession } from '../lib/types';

const COMMON_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (北京/上海)' },
  { value: 'Asia/Chongqing', label: 'Asia/Chongqing (重庆)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (香港)' },
  { value: 'Asia/Taipei', label: 'Asia/Taipei (台北)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (新加坡)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (东京)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (首尔)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (曼谷)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (迪拜)' },
  { value: 'Europe/London', label: 'Europe/London (伦敦)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (巴黎)' },
  { value: 'America/New_York', label: 'America/New_York (纽约)' },
  { value: 'America/Chicago', label: 'America/Chicago (芝加哥)' },
  { value: 'America/Denver', label: 'America/Denver (丹佛)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (洛杉矶)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (悉尼)' },
  { value: 'UTC', label: 'UTC (世界协调时间)' },
];

export default function Settings() {
  const account = useApp((s) => s.account);
  const [nickname, setNickname] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [profileError, setProfileError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [bindOpen, setBindOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const timezoneOptions = useMemo(() => {
    const trimmed = timezone.trim();
    if (trimmed && !COMMON_TIMEZONE_OPTIONS.some((o) => o.value === trimmed)) {
      return [{ value: trimmed, label: `${trimmed} (当前)` }, ...COMMON_TIMEZONE_OPTIONS];
    }
    return COMMON_TIMEZONE_OPTIONS;
  }, [timezone]);

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
    const tz = timezone.trim() || 'Asia/Shanghai';
    if (!isValidTimeZone(tz)) {
      setProfileError(new Error('请输入合法的 IANA 时区名称（如 Asia/Shanghai）'));
      return;
    }
    setProfileError(null);
    try {
      const saved = await accountApi.updateProfile({ nickname, timezone: tz });
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

  const onBindSuccess = async () => {
    setBindOpen(false);
    try {
      const p = await accountApi.profile();
      actions.setAccount(p);
    } catch {
      /* ignore */
    }
    actions.toast('success', '微信已绑定');
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
            <div className="flex flex-col gap-2 text-neutral-600">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  手机号：{account.phoneMasked ?? '—'}
                </span>
                {typeof account.phoneVerified === 'boolean' &&
                  (account.phoneVerified ? (
                    <Badge tone="green">已验证</Badge>
                  ) : (
                    <Badge tone="amber">未验证</Badge>
                  ))}
                <Badge tone={cancelling ? 'amber' : 'green'}>
                  {ACCOUNT_STATUS_LABELS[account.status] ?? account.status}
                </Badge>
                {account.registeredAt && <span>注册于 {fmtDateTime(account.registeredAt)}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>邮箱：{account.emailMasked ?? '未绑定'}</span>
                {account.emailVerified && <Badge tone="green">已验证</Badge>}
              </div>
            </div>
            <Field label="昵称">
              <TextInput value={nickname} onChange={setNickname} />
            </Field>
            <Field label="账号时区" hint="成员各自的提醒时间以成员时区为准，这里是账号默认时区">
              <Select value={timezone} onChange={setTimezone} options={timezoneOptions} />
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
            <div className="flex items-center gap-2">
              <p className="font-medium">微信绑定</p>
              {account?.hasWechat && <Badge tone="green">已绑定</Badge>}
            </div>
            <p className="text-sm text-neutral-500">
              {account?.hasWechat
                ? '已绑定微信，可用微信扫码登录药准时'
                : '绑定后可用微信扫码登录药准时并接收提醒'}
            </p>
          </div>
          {!account?.hasWechat && (
            <Button variant="soft" onClick={() => setBindOpen(true)}>
              绑定微信
            </Button>
          )}
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
      <BindWechatModal
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        onSuccess={onBindSuccess}
      />
    </div>
  );
}

/**
 * 微信扫码绑定弹窗：建票 → 渲染二维码（内容以 bind: 开头） → 每 2 秒轮询状态
 * confirmed 后关弹窗、刷新账号信息、提示「微信已绑定」；过期显示「二维码已过期，重新生成」。
 */
function BindWechatModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [qr, setQr] = useState('');
  const [state, setState] = useState<'loading' | 'waiting' | 'expired' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    let cancelled = false;
    doneRef.current = false;
    setState('loading');
    setQr('');

    (async () => {
      try {
        const ticket = await authApi.createBindTicket();
        const content = ticket.qrContent || `bind:${ticket.ticketId}`;
        const url = qrToDataUrl(content, 220);
        if (cancelled) return;
        setQr(url);
        setState('waiting');

        timer = window.setInterval(async () => {
          try {
            const res = await authApi.getBindTicket(ticket.ticketId);
            if (cancelled || doneRef.current) return;
            if (res.status === 'confirmed') {
              doneRef.current = true;
              window.clearInterval(timer);
              onSuccess();
            } else if (res.status === 'expired') {
              window.clearInterval(timer);
              setState('expired');
            }
          } catch {
            if (cancelled) return;
            window.clearInterval(timer);
            setState('expired');
          }
        }, 2000);
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [open, reloadKey, onSuccess]);

  return (
    <Modal open={open} title="绑定微信" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        {state === 'loading' && <Spinner text="正在生成二维码…" />}
        {state === 'waiting' && qr && (
          <>
            <img src={qr} alt="微信扫码绑定二维码" width={220} height={220} />
            <p className="text-center text-sm text-neutral-600">
              请打开「药准时」小程序
              <br />
              使用「扫一扫」扫描二维码并确认绑定
            </p>
          </>
        )}
        {(state === 'expired' || state === 'error') && (
          <>
            <p className="text-neutral-700">
              {state === 'expired' ? '二维码已过期，重新生成' : '二维码生成失败，请重试'}
            </p>
            <Button
              onClick={() => {
                setState('loading');
                setReloadKey((k) => k + 1);
              }}
            >
              重新生成
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
