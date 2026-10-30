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
import { tr, useT } from '../lib/i18n';

export default function Login() {
  const tr = useT();
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
    actions.toast('success', tr('auth.loginSuccess'));
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
      if (err instanceof ApiError && err.code === 40100) setError(new Error(tr('auth.wrongCredentials')));
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-center text-3xl font-bold text-medgreen">{tr('auth.brandTitle')}</h1>
      <p className="mb-8 text-center text-neutral-600">{tr('auth.tagline')}</p>
      <Card>
        <div className="mb-5 grid grid-cols-3 gap-2" role="tablist" aria-label={tr('auth.tablistLabel')}>
          <Button variant={mode === 'password' ? 'primary' : 'ghost'} onClick={() => setMode('password')}>
            {tr('auth.loginByPassword')}
          </Button>
          <Button variant={mode === 'code' ? 'primary' : 'ghost'} onClick={() => setMode('code')}>
            {tr('auth.loginByCode')}
          </Button>
          <Button variant={mode === 'scan' ? 'primary' : 'ghost'} onClick={() => setMode('scan')}>
            {tr('auth.loginByScan')}
          </Button>
        </div>
        {mode === 'scan' ? (
          <ScanLoginPanel
            onConfirmed={(result) => {
              finishLogin(result).catch((err) => {
                setError(err);
                actions.toast('error', err instanceof Error ? err.message : tr('auth.loginFailed'));
              });
            }}
          />
        ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {mode === 'password' ? (
            <>
              <Field label={tr('auth.account')}>
                <TextInput value={account} onChange={setAccount} placeholder={tr('auth.accountPlaceholder')} required autoComplete="username" />
              </Field>
              <Field label={tr('auth.password')}>
                <TextInput value={password} onChange={setPassword} placeholder={tr('auth.passwordPlaceholder')} type="password" required autoComplete="current-password" />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={tr('auth.codeChannelLabel')}>
                <Button
                  type="button"
                  variant={codeChannel === 'phone' ? 'primary' : 'ghost'}
                  onClick={() => setCodeChannel('phone')}
                >
                  {tr('auth.phone')}
                </Button>
                <Button
                  type="button"
                  variant={codeChannel === 'email' ? 'primary' : 'ghost'}
                  onClick={() => setCodeChannel('email')}
                >
                  {tr('auth.email')}
                </Button>
              </div>
              {codeChannel === 'phone' ? (
                <>
                  <Field label={tr('auth.phone')}>
                    <TextInput value={phone} onChange={setPhone} placeholder={tr('auth.phonePlaceholder')} type="tel" required autoComplete="username" />
                  </Field>
                  <Field label={tr('auth.smsCode')}>
                    <div className="flex gap-2">
                      <TextInput value={code} onChange={setCode} placeholder={tr('auth.codePlaceholder6')} type="numeric" required />
                      <SmsCodeButton phone={phone} scene="login" />
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label={tr('auth.email')}>
                    <TextInput value={email} onChange={setEmail} placeholder={tr('auth.emailPlaceholder')} type="email" required autoComplete="username" />
                  </Field>
                  <Field label={tr('auth.emailCode')}>
                    <div className="flex gap-2">
                      <TextInput value={emailCode} onChange={setEmailCode} placeholder={tr('auth.codePlaceholder6')} type="numeric" required />
                      <EmailCodeButton email={email} scene="login" />
                    </div>
                  </Field>
                </>
              )}
            </>
          )}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? tr('auth.loggingIn') : tr('auth.login')}
          </Button>
        </form>
        )}
        <div className="mt-5 flex items-center justify-between text-base">
          {/* 2026-10-25 修复：浏览器验证估算行内链接点击区仅约 20px 高，补 44px 最小触控高度。 */}
          <button className="inline-flex min-h-[44px] items-center px-2 text-medgreen-dark underline" onClick={() => navigate('/register')}>
            {tr('auth.registerNew')}
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
      {state === 'loading' && <p className="text-neutral-600">{tr('auth.qrGenerating')}</p>}
      {state === 'waiting' && qr && (
        <>
          <img src={qr} alt={tr('auth.qrAlt')} width={220} height={220} />
          <p className="text-center text-base text-neutral-700">
            {tr('auth.scanHintA')}
            <br />
            {tr('auth.scanHintB')}
          </p>
        </>
      )}
      {(state === 'expired' || state === 'error') && (
        <>
          <p className="text-neutral-700">{state === 'expired' ? tr('auth.qrExpired') : tr('auth.qrFailed')}</p>
          <Button
            onClick={() => {
              setState('loading');
              setReloadKey((k) => k + 1);
            }}
          >
            {tr('auth.refreshQr')}
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
        {tr('auth.forgotPassword')}
      </button>
    );
  }

  const submit = async () => {
    if (channel === 'phone') {
      if (!phone.trim() || !code.trim()) {
        actions.toast('error', tr('auth.resetNeedPhoneCode'));
        return;
      }
    } else {
      if (!email.trim() || !emailCode.trim()) {
        actions.toast('error', tr('auth.resetNeedEmailCode'));
        return;
      }
    }
    if (newPassword.length < 8) {
      actions.toast('error', tr('auth.passwordTooShort'));
      return;
    }
    setBusy(true);
    try {
      if (channel === 'phone') {
        await authApi.resetPassword({ phone, code, newPassword });
      } else {
        await authApi.resetPassword({ email, code: emailCode, newPassword });
      }
      actions.toast('success', tr('auth.resetSuccess'));
      setOpen(false);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('auth.resetFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-label={tr('auth.resetTitle')}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h2 className="mb-4 text-xl font-semibold text-medgreen-dark">{tr('auth.resetTitle')}</h2>
        <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label={tr('auth.resetChannelLabel')}>
          <Button
            type="button"
            variant={channel === 'phone' ? 'primary' : 'ghost'}
            onClick={() => setChannel('phone')}
          >
            {tr('auth.phone')}
          </Button>
          <Button
            type="button"
            variant={channel === 'email' ? 'primary' : 'ghost'}
            onClick={() => setChannel('email')}
          >
            {tr('auth.email')}
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          {channel === 'phone' ? (
            <>
              <Field label={tr('auth.phone')}>
                <TextInput value={phone} onChange={setPhone} type="tel" placeholder={tr('auth.registeredPhone')} />
              </Field>
              <Field label={tr('auth.smsCode')}>
                <div className="flex gap-2">
                  <TextInput value={code} onChange={setCode} placeholder={tr('auth.codePlaceholder6')} />
                  <SmsCodeButton phone={phone} scene="reset" />
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label={tr('auth.email')}>
                <TextInput value={email} onChange={setEmail} type="email" placeholder={tr('auth.registeredEmail')} />
              </Field>
              <Field label={tr('auth.emailCode')}>
                <div className="flex gap-2">
                  <TextInput value={emailCode} onChange={setEmailCode} placeholder={tr('auth.codePlaceholder6')} />
                  <EmailCodeButton email={email} scene="reset" />
                </div>
              </Field>
            </>
          )}
          <Field label={tr('auth.newPassword')} hint={tr('auth.newPasswordHint')}>
            <TextInput value={newPassword} onChange={setNewPassword} type="password" placeholder={tr('auth.newPasswordPlaceholder')} />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button className="flex-1" disabled={busy} onClick={submit}>
              {busy ? tr('auth.resetting') : tr('auth.confirmReset')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
