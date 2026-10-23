import { FormEvent, useState } from 'react';
import { authApi, memberApi } from '../lib/endpoints';
import { tokenStore } from '../lib/api';
import { actions } from '../lib/store';
import { navigate } from '../lib/router';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui';
import { SmsCodeButton } from '../components/SmsCodeButton';
import { ApiError } from '../lib/api';

export default function Login() {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [account, setAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'password' ? await authApi.login({ account, password }) : await authApi.loginByCode({ phone, code });
      tokenStore.set(result.accessToken, result.refreshToken);
      if (result.account) actions.setAccount(result.account);
      else {
        try {
          actions.setAccount(await authApi.me());
        } catch {
          /* me 失败时由 App 守卫兜底回登录页 */
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
        <div className="mb-5 grid grid-cols-2 gap-2" role="tablist" aria-label="登录方式">
          <Button variant={mode === 'password' ? 'primary' : 'ghost'} onClick={() => setMode('password')}>
            密码登录
          </Button>
          <Button variant={mode === 'code' ? 'primary' : 'ghost'} onClick={() => setMode('code')}>
            验证码登录
          </Button>
        </div>
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
          )}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </Button>
        </form>
        <div className="mt-5 flex items-center justify-between text-base">
          <button className="text-medgreen-dark underline" onClick={() => navigate('/register')}>
            注册新账号
          </button>
          <ResetPasswordLink />
        </div>
      </Card>
    </main>
  );
}

function ResetPasswordLink() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  if (!open) {
    return (
      <button className="text-neutral-600 underline" onClick={() => setOpen(true)}>
        忘记密码
      </button>
    );
  }
  const submit = async () => {
    try {
      await authApi.resetPassword({ phone, code, newPassword });
      actions.toast('success', '密码已重置，请用新密码登录');
      setOpen(false);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '重置失败');
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-label="重置密码">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h2 className="mb-4 text-xl font-semibold text-medgreen-dark">重置密码</h2>
        <div className="flex flex-col gap-4">
          <Field label="手机号">
            <TextInput value={phone} onChange={setPhone} type="tel" placeholder="注册手机号" />
          </Field>
          <Field label="短信验证码">
            <div className="flex gap-2">
              <TextInput value={code} onChange={setCode} placeholder="6 位验证码" />
              <SmsCodeButton phone={phone} scene="reset" />
            </div>
          </Field>
          <Field label="新密码">
            <TextInput value={newPassword} onChange={setNewPassword} type="password" placeholder="至少 8 位" />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button className="flex-1" onClick={submit}>
              确认重置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
