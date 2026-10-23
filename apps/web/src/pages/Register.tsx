import { FormEvent, useState } from 'react';
import { authApi, memberApi } from '../lib/endpoints';
import { tokenStore } from '../lib/api';
import { actions } from '../lib/store';
import { navigate } from '../lib/router';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui';
import { EmailCodeButton } from '../components/EmailCodeButton';

export default function Register() {
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
      setError(new Error('密码至少 8 位'));
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
      tokenStore.set(result.accessToken, result.refreshToken);
      if (result.account) actions.setAccount(result.account);
      else {
        try {
          actions.setAccount(await authApi.me());
        } catch {
          /* me 失败时由 App 守卫兜底回登录页 */
        }
      }
      // 注册即自动建有本人成员，立即装载（与 Login 同口径，避免初次进入显示「还没有成员」）
      try {
        actions.setMembers(await memberApi.list());
      } catch {
        /* 装载失败不阻断注册流程 */
      }
      actions.toast('success', '注册成功，请先添加要照护的成员');
      navigate('/members');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-8 text-center text-3xl font-bold text-medgreen">注册药准时账号</h1>
      <Card>
        <div className="mb-5 grid grid-cols-2 gap-2" role="tablist" aria-label="注册方式">
          <Button variant={mode === 'phone' ? 'primary' : 'ghost'} onClick={() => setMode('phone')}>
            手机号
          </Button>
          <Button variant={mode === 'email' ? 'primary' : 'ghost'} onClick={() => setMode('email')}>
            邮箱
          </Button>
        </div>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {mode === 'phone' ? (
            <>
              <Field label="手机号" hint="短信通道开通前为未验证注册：暂不能用于短信提醒与找回密码，可日后补验">
                <TextInput value={phone} onChange={setPhone} placeholder="11 位手机号" type="tel" required autoComplete="username" />
              </Field>
            </>
          ) : (
            <>
              <Field label="邮箱">
                <TextInput value={email} onChange={setEmail} placeholder="请输入邮箱地址" type="email" required autoComplete="username" />
              </Field>
              <Field label="邮箱验证码">
                <div className="flex gap-2">
                  <TextInput value={emailCode} onChange={setEmailCode} placeholder="6 位验证码" required />
                  <EmailCodeButton email={email} scene="register" />
                </div>
              </Field>
            </>
          )}
          <Field label="设置密码" hint="至少 8 位，用于密码登录">
            <TextInput value={password} onChange={setPassword} placeholder="设置登录密码" type="password" required autoComplete="new-password" />
          </Field>
          <Field label="昵称（选填）">
            <TextInput value={nickname} onChange={setNickname} placeholder="家人怎么称呼您" />
          </Field>
          {mode === 'email' && (
            <Field label="手机号（选填）" hint="选填：未验证，暂不能用于短信提醒与找回密码">
              <TextInput value={emailPhone} onChange={setEmailPhone} placeholder="11 位手机号（选填）" type="tel" autoComplete="tel" />
            </Field>
          )}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? '注册中…' : '注册并登录'}
          </Button>
        </form>
        <p className="mt-5 text-center text-base">
          已有账号？
          <button className="text-medgreen-dark underline" onClick={() => navigate('/login')}>
            去登录
          </button>
        </p>
      </Card>
    </main>
  );
}
