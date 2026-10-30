import { FormEvent, useState } from 'react';
import { authApi, memberApi } from '../lib/endpoints';
import { tokenStore } from '../lib/api';
import { actions } from '../lib/store';
import { navigate } from '../lib/router';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui';
import { EmailCodeButton } from '../components/EmailCodeButton';
import { tr, useT } from '../lib/i18n';

export default function Register() {
  const tr = useT();
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPhone, setEmailPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(new Error(tr('auth.passwordMin8')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'email'
          ? await authApi.registerByEmail({
              email,
              code: emailCode,
              password,
              nickname: nickname || undefined,
              phone: emailPhone || undefined,
            })
          : await authApi.register({ phone, password, nickname: nickname || undefined });
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
      // 注册即自动建有本人成员，立即装载（与 Login 同口径，避免初次进入显示「还没有成员」）
      try {
        actions.setMembers(await memberApi.list());
      } catch {
        /* 装载失败不阻断注册流程 */
      }
      actions.toast('success', tr('auth.registerSuccessToast'));
      navigate('/members');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-8 text-center text-3xl font-bold text-medgreen">{tr('auth.registerTitle')}</h1>
      <Card>
        <div className="mb-5 grid grid-cols-2 gap-2" role="tablist" aria-label={tr('auth.registerTablistLabel')}>
          <Button variant={mode === 'phone' ? 'primary' : 'ghost'} onClick={() => setMode('phone')}>
            {tr('auth.phone')}
          </Button>
          <Button variant={mode === 'email' ? 'primary' : 'ghost'} onClick={() => setMode('email')}>
            {tr('auth.email')}
          </Button>
        </div>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {mode === 'phone' ? (
            <>
              <Field label={tr('auth.phone')} hint={tr('auth.phoneUnverifiedHint')}>
                <TextInput value={phone} onChange={setPhone} placeholder={tr('auth.phoneShortPlaceholder')} type="tel" required autoComplete="username" />
              </Field>
            </>
          ) : (
            <>
              <Field label={tr('auth.email')}>
                <TextInput value={email} onChange={setEmail} placeholder={tr('auth.emailPlaceholder')} type="email" required autoComplete="username" />
              </Field>
              <Field label={tr('auth.emailCode')}>
                <div className="flex gap-2">
                  <TextInput value={emailCode} onChange={setEmailCode} placeholder={tr('auth.codePlaceholder6')} required />
                  <EmailCodeButton email={email} scene="register" />
                </div>
              </Field>
            </>
          )}
          <Field label={tr('auth.setPassword')} hint={tr('auth.setPasswordHint')}>
            <TextInput value={password} onChange={setPassword} placeholder={tr('auth.setPasswordPlaceholder')} type="password" required autoComplete="new-password" />
          </Field>
          <Field label={tr('auth.nicknameOptional')}>
            <TextInput value={nickname} onChange={setNickname} placeholder={tr('auth.nicknamePlaceholder')} />
          </Field>
          {mode === 'email' && (
            <Field label={tr('auth.phoneOptional')} hint={tr('auth.phoneOptionalHint')}>
              <TextInput value={emailPhone} onChange={setEmailPhone} placeholder={tr('auth.phoneOptionalPlaceholder')} type="tel" autoComplete="tel" />
            </Field>
          )}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? tr('auth.registering') : tr('auth.registerAndLogin')}
          </Button>
        </form>
        <p className="mt-5 text-center text-base">
          {tr('auth.haveAccount')}
          <button className="text-medgreen-dark underline" onClick={() => navigate('/login')}>
            {tr('auth.goLogin')}
          </button>
        </p>
      </Card>
    </main>
  );
}
