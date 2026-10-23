import { FormEvent, useState } from 'react';
import { authApi } from '../lib/endpoints';
import { tokenStore } from '../lib/api';
import { actions } from '../lib/store';
import { navigate } from '../lib/router';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui';
import { SmsCodeButton } from '../components/SmsCodeButton';

export default function Register() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
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
      const result = await authApi.register({ phone, password, code, nickname: nickname || undefined });
      tokenStore.set(result.accessToken, result.refreshToken);
      if (result.account) actions.setAccount(result.account);
      else {
        try {
          actions.setAccount(await authApi.me());
        } catch {
          /* me 失败时由 App 守卫兜底回登录页 */
        }
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
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field label="手机号">
            <TextInput value={phone} onChange={setPhone} placeholder="11 位手机号" type="tel" required autoComplete="username" />
          </Field>
          <Field label="短信验证码">
            <div className="flex gap-2">
              <TextInput value={code} onChange={setCode} placeholder="6 位验证码" required />
              <SmsCodeButton phone={phone} scene="register" />
            </div>
          </Field>
          <Field label="设置密码" hint="至少 8 位，用于密码登录">
            <TextInput value={password} onChange={setPassword} placeholder="设置登录密码" type="password" required autoComplete="new-password" />
          </Field>
          <Field label="昵称（选填）">
            <TextInput value={nickname} onChange={setNickname} placeholder="家人怎么称呼您" />
          </Field>
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
