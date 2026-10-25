import { FormEvent, useEffect, useRef, useState } from 'react';
import { qrToDataUrl } from '../lib/qr';
import { authApi, memberApi } from '../lib/endpoints';
import { tokenStore } from '../lib/api';
import { actions } from '../lib/store';
import { navigate } from '../lib/router';
import type { AuthResult } from '../lib/types';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui';
import { SmsCodeButton } from '../components/SmsCodeButton';
import { EmailCodeButton } from '../components/EmailCodeButton';
import { ApiError } from '../lib/api';

export default function Login() {
  const [mode, setMode] = useState<'password' | 'code' | 'scan'>('password');
  const [codeChannel, setCodeChannel] = useState<'phone' | 'email'>('phone');
  const [account, setAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  /** 令牌到手后的统一收尾：清旧状态 → 落令牌 → 装载账号 → 装载成员 → 进首页（密码/验证码/扫码共用） */
  const finishLogin = async (result: AuthResult) => {
    actions.resetSession();
    tokenStore.set(result.accessToken, result.refreshToken);
    if (result.account) {
      actions.setAccount(result.account);
    } else {
      try {
        actions.setAccount(await authApi.me());
      } catch (err) {
        tokenStore.clear();
        actions.resetSession();
        throw err;
      }
    }
    // 登录后立即装载成员（此前只有整页刷新时的启动流程才拉，初次登录全站显示「还没有成员」）
    try {
      actions.setMembers(await memberApi.list());
    } catch {
      /* 成员装载失败不阻断登录，页面内会再各自加载/提示 */
    }
    actions.toast('success', '登录成功');
    navigate('/');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'password'
          ? await authApi.login({ account, password })
          : codeChannel === 'phone'
            ? await authApi.loginByCode({ phone, code })
            : await authApi.loginByCode({ email, code: emailCode });
      await finishLogin(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 401) setError(new Error('账号或密码不正确'));
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-center text-3xl font-bold text-medgreen">药准时 MedOnTime</h1>
      <p className="mb-8 text-center text-neutral-600">按时吃药，家人放心</p>
      <Card>
        <div className="mb-5 grid grid-cols-3 gap-2" role="tablist" aria-label="登录方式">
          <Button variant={mode === 'password' ? 'primary' : 'ghost'} onClick={() => setMode('password')}>
            密码登录
          </Button>
          <Button variant={mode === 'code' ? 'primary' : 'ghost'} onClick={() => setMode('code')}>
            验证码登录
          </Button>
          <Button variant={mode === 'scan' ? 'primary' : 'ghost'} onClick={() => setMode('scan')}>
            微信扫码
          </Button>
        </div>
        {mode === 'scan' ? (
          <ScanLoginPanel
            onConfirmed={(result) => {
              finishLogin(result).catch((err) => {
                setError(err);
                actions.toast('error', err instanceof Error ? err.message : '登录失败');
              });
            }}
          />
        ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {mode === 'password' ? (
            <>
              <Field label="账号">
                <TextInput value={account} onChange={setAccount} placeholder="手机号或邮箱" required autoComplete="username" />
              </Field>
              <Field label="密码">
                <TextInput value={password} onChange={setPassword} placeholder="请输入密码" type="password" required autoComplete="current-password" />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="验证码接收方式">
                <Button
                  type="button"
                  variant={codeChannel === 'phone' ? 'primary' : 'ghost'}
                  onClick={() => setCodeChannel('phone')}
                >
                  手机号
                </Button>
                <Button
                  type="button"
                  variant={codeChannel === 'email' ? 'primary' : 'ghost'}
                  onClick={() => setCodeChannel('email')}
                >
                  邮箱
                </Button>
              </div>
              {codeChannel === 'phone' ? (
                <>
                  <Field label="手机号">
                    <TextInput value={phone} onChange={setPhone} placeholder="请输入 11 位手机号" type="tel" required autoComplete="username" />
                  </Field>
                  <Field label="短信验证码">
                    <div className="flex gap-2">
                      <TextInput value={code} onChange={setCode} placeholder="6 位验证码" type="numeric" required />
                      <SmsCodeButton phone={phone} scene="login" />
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="邮箱">
                    <TextInput value={email} onChange={setEmail} placeholder="请输入邮箱地址" type="email" required autoComplete="username" />
                  </Field>
                  <Field label="邮箱验证码">
                    <div className="flex gap-2">
                      <TextInput value={emailCode} onChange={setEmailCode} placeholder="6 位验证码" type="numeric" required />
                      <EmailCodeButton email={email} scene="login" />
                    </div>
                  </Field>
                </>
              )}
            </>
          )}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </Button>
        </form>
        )}
        <div className="mt-5 flex items-center justify-between text-base">
          {/* 2026-10-25 修复：浏览器验证估算行内链接点击区仅约 20px 高，补 44px 最小触控高度。 */}
          <button className="inline-flex min-h-[44px] items-center px-2 text-medgreen-dark underline" onClick={() => navigate('/register')}>
            注册新账号
          </button>
          <ResetPasswordLink />
        </div>
      </Card>
    </main>
  );
}

/**
 * 微信扫码登录面板：建票 → 渲染二维码 → 每 2 秒轮询取票。
 * 用户在小程序内扫码并确认后，轮询拿到正式令牌交给 finishLogin 收尾；
 * 票据过期（404）停轮询并提供刷新。
 */
function ScanLoginPanel({ onConfirmed }: { onConfirmed: (result: AuthResult) => void }) {
  const [qr, setQr] = useState('');
  const [state, setState] = useState<'loading' | 'waiting' | 'expired' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    doneRef.current = false;
    (async () => {
      try {
        const ticket = await authApi.createScanTicket();
        const url = qrToDataUrl(ticket.qrContent, 220);
        if (cancelled) return;
        setQr(url);
        setState('waiting');
        timer = window.setInterval(async () => {
          try {
            const res = await authApi.pollScanTicket(ticket.ticketId);
            if (cancelled || doneRef.current) return;
            if (res.status === 'confirmed') {
              doneRef.current = true;
              window.clearInterval(timer);
              onConfirmed(res);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {state === 'loading' && <p className="text-neutral-600">正在生成二维码…</p>}
      {state === 'waiting' && qr && (
        <>
          <img src={qr} alt="微信扫码登录二维码" width={220} height={220} />
          <p className="text-center text-base text-neutral-700">
            请打开「药准时」小程序，使用其中「扫一扫」
            <br />
            扫描二维码并确认登录
          </p>
        </>
      )}
      {(state === 'expired' || state === 'error') && (
        <>
          <p className="text-neutral-700">{state === 'expired' ? '二维码已过期' : '二维码生成失败'}</p>
          <Button
            onClick={() => {
              setState('loading');
              setReloadKey((k) => k + 1);
            }}
          >
            刷新二维码
          </Button>
        </>
      )}
    </div>
  );
}

function ResetPasswordLink() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="inline-flex min-h-[44px] items-center px-2 text-neutral-600 underline" onClick={() => setOpen(true)}>
        忘记密码
      </button>
    );
  }

  const submit = async () => {
    if (channel === 'phone') {
      if (!phone.trim() || !code.trim()) {
        actions.toast('error', '请输入手机号与短信验证码');
        return;
      }
    } else {
      if (!email.trim() || !emailCode.trim()) {
        actions.toast('error', '请输入邮箱与邮箱验证码');
        return;
      }
    }
    if (newPassword.length < 8) {
      actions.toast('error', '新密码至少 8 位');
      return;
    }
    setBusy(true);
    try {
      if (channel === 'phone') {
        await authApi.resetPassword({ phone, code, newPassword });
      } else {
        await authApi.resetPassword({ email, code: emailCode, newPassword });
      }
      actions.toast('success', '密码已重置，请用新密码登录');
      setOpen(false);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '重置失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-label="重置密码">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h2 className="mb-4 text-xl font-semibold text-medgreen-dark">重置密码</h2>
        <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="找回密码方式">
          <Button
            type="button"
            variant={channel === 'phone' ? 'primary' : 'ghost'}
            onClick={() => setChannel('phone')}
          >
            手机号
          </Button>
          <Button
            type="button"
            variant={channel === 'email' ? 'primary' : 'ghost'}
            onClick={() => setChannel('email')}
          >
            邮箱
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          {channel === 'phone' ? (
            <>
              <Field label="手机号">
                <TextInput value={phone} onChange={setPhone} type="tel" placeholder="注册手机号" />
              </Field>
              <Field label="短信验证码">
                <div className="flex gap-2">
                  <TextInput value={code} onChange={setCode} placeholder="6 位验证码" />
                  <SmsCodeButton phone={phone} scene="reset" />
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="邮箱">
                <TextInput value={email} onChange={setEmail} type="email" placeholder="注册邮箱地址" />
              </Field>
              <Field label="邮箱验证码">
                <div className="flex gap-2">
                  <TextInput value={emailCode} onChange={setEmailCode} placeholder="6 位验证码" />
                  <EmailCodeButton email={email} scene="reset" />
                </div>
              </Field>
            </>
          )}
          <Field label="新密码" hint="至少 8 位，须同时包含字母与数字">
            <TextInput value={newPassword} onChange={setNewPassword} type="password" placeholder="至少 8 位，含字母与数字" />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button className="flex-1" disabled={busy} onClick={submit}>
              {busy ? '重置中…' : '确认重置'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
