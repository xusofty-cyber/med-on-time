import { useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { tokenStore, toastOk } from '../../lib/api';
import { authApi, memberApi } from '../../lib/endpoints';
import { actions } from '../../lib/store';
import { navigateAfterAuth } from '../../lib/hooks';
import { Btn, Card, ErrorLine, Field, PageShell, TxtInput } from '../../components/ui';
import { SmsCodeButton } from '../../components/SmsCodeButton';

/** 注册：手机号 + 短信验证码 + 密码（≥8 位）+ 昵称（选填）。与 Web 端 Register 同逻辑。 */
export default function Register() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setError(new Error('请输入正确的 11 位手机号'));
      return;
    }
    if (!code.trim()) {
      setError(new Error('请输入短信验证码'));
      return;
    }
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
          <Field label='手机号'>
            <TxtInput value={phone} onChange={setPhone} placeholder='11 位手机号' type='number' maxlength={11} />
          </Field>
          <Field label='短信验证码'>
            <View className='row' style={{ gap: '12rpx' }}>
              <View className='grow'>
                <TxtInput value={code} onChange={setCode} placeholder='6 位验证码' type='number' maxlength={6} />
              </View>
              <SmsCodeButton phone={phone} scene='register' />
            </View>
          </Field>
          <Field label='设置密码' hint='至少 8 位，用于密码登录'>
            <TxtInput value={password} onChange={setPassword} placeholder='设置登录密码' password />
          </Field>
          <Field label='昵称（选填）'>
            <TxtInput value={nickname} onChange={setNickname} placeholder='家人怎么称呼您' />
          </Field>
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
