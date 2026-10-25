import { useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { tokenStore, toastError, toastOk } from '../../lib/api';
import { authApi, memberApi } from '../../lib/endpoints';
import { actions } from '../../lib/store';
import { navigateAfterAuth } from '../../lib/hooks';
import { Btn, Card, ErrorLine, Field, PageShell, SegTabs, TxtInput } from '../../components/ui';
import { EmailCodeButton } from '../../components/EmailCodeButton';

/** 注册：邮箱 + 邮箱验证码 + 密码（≥8 位）+ 昵称（选填）。与 Web 端 Register 同逻辑。
 * 验证码通道：邮箱为唯一可用通道（默认）；短信通道暂未开通（个人拿不到腾讯云短信签名/模板），
 * 短信入口保留并标注，发码/提交一律拦截提示并切回邮箱 tab，不调后端接口。 */
export default function Register() {
  /* 注册通道：默认邮箱（唯一可用通道）；手机号入口保留但暂未开通 */
  const [channel, setChannel] = useState<'phone' | 'email'>('email');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPhone, setEmailPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (channel === 'phone') {
      /* 短信通道暂未开通：不调接口，提示并切回邮箱 tab */
      toastError(new Error('短信通道暂未开通，请使用邮箱验证码'));
      setChannel('email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(new Error('请输入正确的邮箱地址'));
      return;
    }
    if (!emailCode.trim()) {
      setError(new Error('请输入邮箱验证码'));
      return;
    }
    if (password.length < 8) {
      setError(new Error('密码至少 8 位'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.registerByEmail({
        email,
        code: emailCode,
        password,
        nickname: nickname || undefined,
        phone: emailPhone || undefined,
      });
      tokenStore.set(result.accessToken, result.refreshToken);
      if (result.account) actions.setAccount(result.account);
      else {
        try {
          actions.setAccount(await authApi.me());
        } catch {
          /* 守卫兜底 */
        }
      }
      try {
        actions.setMembers(await memberApi.list());
      } catch {
        /* 同上 */
      }
      toastOk('注册成功，请先添加要照护的成员');
      navigateAfterAuth();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell style={{ paddingTop: '56rpx' }}>
      <Text className='tx-title' style={{ textAlign: 'center' }}>
        注册药准时账号
      </Text>
      <Card>
        <View className='col' style={{ gap: '24rpx' }}>
          <SegTabs
            options={[
              { value: 'phone', label: '手机号（暂未开通）' },
              { value: 'email', label: '邮箱' },
            ]}
            value={channel}
            onChange={(v) => setChannel(v as 'phone' | 'email')}
          />
          {channel === 'phone' ? (
            <>
              <Text className='tx-sm' style={{ color: 'var(--color-status-danger-text)' }}>
                短信通道暂未开通，请使用邮箱验证码
              </Text>
              <Field label='手机号'>
                <TxtInput value={phone} onChange={setPhone} placeholder='11 位手机号' type='number' maxlength={11} />
              </Field>
              <Field label='短信验证码'>
                <View className='row' style={{ gap: '12rpx' }}>
                  <View className='grow'>
                    <TxtInput value={code} onChange={setCode} placeholder='6 位验证码' type='number' maxlength={6} />
                  </View>
                  <Btn
                    variant='soft'
                    onClick={() => {
                      toastError(new Error('短信通道暂未开通，请使用邮箱验证码'));
                      setChannel('email');
                    }}
                  >
                    发送验证码
                  </Btn>
                </View>
              </Field>
            </>
          ) : (
            <>
              <Field label='邮箱'>
                <TxtInput value={email} onChange={setEmail} placeholder='请输入邮箱地址' maxlength={254} />
              </Field>
              <Field label='邮箱验证码'>
                <View className='row' style={{ gap: '12rpx' }}>
                  <View className='grow'>
                    <TxtInput value={emailCode} onChange={setEmailCode} placeholder='6 位验证码' type='number' maxlength={6} />
                  </View>
                  <EmailCodeButton email={email} scene='register' />
                </View>
              </Field>
            </>
          )}
          <Field label='设置密码' hint='至少 8 位，用于密码登录'>
            <TxtInput value={password} onChange={setPassword} placeholder='设置登录密码' password />
          </Field>
          <Field label='昵称（选填）'>
            <TxtInput value={nickname} onChange={setNickname} placeholder='家人怎么称呼您' />
          </Field>
          {channel === 'email' && (
            <Field label='手机号（选填）' hint='选填：未验证，暂不能用于短信提醒与找回密码'>
              <TxtInput value={emailPhone} onChange={setEmailPhone} placeholder='11 位手机号（选填）' type='number' maxlength={11} />
            </Field>
          )}
          <ErrorLine error={error} />
          <Btn block disabled={busy} onClick={submit}>
            {busy ? '注册中…' : '注册并登录'}
          </Btn>
          <Text className='tx-md' style={{ textAlign: 'center' }}>
            已有账号？
            <Text className='tx-green' onClick={() => Taro.navigateBack()}>
              去登录
            </Text>
          </Text>
        </View>
      </Card>
    </PageShell>
  );
}
