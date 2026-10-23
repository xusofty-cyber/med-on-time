import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { ApiError, tokenStore, toastError, toastInfo, toastOk } from '../../lib/api';
import { authApi, memberApi } from '../../lib/endpoints';
import { actions, useApp } from '../../lib/store';
import { HOME_TAB } from '../../lib/hooks';
import type { Account, AuthResult } from '../../lib/types';
import { Btn, Card, ErrorLine, Field, SegTabs, TxtInput } from '../../components/ui';
import { SmsCodeButton } from '../../components/SmsCodeButton';

/** 登录：手机号 + 密码 / 短信验证码双模式；含忘记密码（验证码重置）。与 Web 端 Login 同逻辑。 */
export default function Login() {
  const booted = useApp((s) => s.booted);
  const account = useApp((s) => s.account);
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [wxBusy, setWxBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  /* 微信登录后手机号未验证：先展示引导卡片，不跳首页。ref 在 setAccount 之前置位，避免会话恢复 effect 抢先跳转 */
  const [needPhoneVerify, setNeedPhoneVerify] = useState(false);
  const phoneVerifyPendingRef = useRef(false);

  /* 已登录状态下进入登录页（冷启动恢复会话）→ 直接进今日提醒；待完成手机号验证时除外 */
  useEffect(() => {
    if (booted && account && !phoneVerifyPendingRef.current) Taro.switchTab({ url: HOME_TAB });
  }, [booted, account]);

  /** 落令牌 / setAccount / 拉成员（与原 submit 同口径）；onAccount 在 setAccount 前回调，供微信登录预置验证引导标记。 */
  const persistSession = async (result: AuthResult, onAccount?: (acct: Account | null) => void) => {
    tokenStore.set(result.accessToken, result.refreshToken);
    let acct: Account | null = result.account ?? null;
    if (!acct) {
      try {
        acct = await authApi.me();
      } catch {
        /* me 失败时由页面守卫兜底 */
      }
    }
    onAccount?.(acct);
    if (acct) actions.setAccount(acct);
    try {
      actions.setMembers(await memberApi.list());
    } catch {
      /* 成员拉取失败不阻塞登录，进首页后会再提示 */
    }
    return acct;
  };

  const submit = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setError(new Error('请输入正确的 11 位手机号'));
      return;
    }
    if (mode === 'password' && !password) {
      setError(new Error('请输入密码'));
      return;
    }
    if (mode === 'code' && !code) {
      setError(new Error('请输入短信验证码'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'password' ? await authApi.login({ phone, password }) : await authApi.loginByCode({ phone, code });
      await persistSession(result);
      toastOk('登录成功');
      Taro.switchTab({ url: HOME_TAB });
    } catch (err) {
      if (err instanceof ApiError && err.code === 401) setError(new Error('手机号或密码不正确'));
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  /** 微信一键登录：Taro.login() 取 code → 后端换令牌。后端未配微信时业务码 40312 的 message 经 ErrorLine 直接透出。 */
  const wechatLogin = async () => {
    setWxBusy(true);
    setError(null);
    try {
      let code: string;
      try {
        const res = await Taro.login();
        if (!res.code) throw new Error('未获取到微信登录凭证');
        code = res.code;
      } catch {
        toastError(new Error('微信登录失败，请重试'));
        return;
      }
      const result = await authApi.wechatMiniappLogin({ code });
      const acct = await persistSession(result, (a) => {
        if (a?.phoneVerified === false) phoneVerifyPendingRef.current = true;
      });
      toastOk('登录成功');
      if (acct?.phoneVerified === false) {
        /* 先不跳首页，页面内展示手机号验证引导卡片 */
        setNeedPhoneVerify(true);
        return;
      }
      Taro.switchTab({ url: HOME_TAB });
    } catch (err) {
      setError(err);
    } finally {
      setWxBusy(false);
    }
  };

  const goHomeAfterPhoneVerifyGuide = () => {
    phoneVerifyPendingRef.current = false;
    setNeedPhoneVerify(false);
    Taro.switchTab({ url: HOME_TAB });
  };

  /** getPhoneNumber 回调（必须原生 Button 触发）：e.detail.code 为微信核验动态令牌。 */
  const onGetPhoneNumber = async (e: { detail: { code?: string; errMsg?: string } }) => {
    const errMsg = e.detail.errMsg ?? '';
    if (errMsg.includes('deny')) {
      toastInfo('可稍后在设置页完成手机号验证');
      return;
    }
    const phoneCode = e.detail.code;
    if (!phoneCode) {
      toastError(new Error('未获取到手机号授权，请重试'));
      return;
    }
    try {
      const updated = await authApi.verifyPhoneByWechat(phoneCode);
      actions.setAccount(updated);
      toastOk('手机号已验证');
      goHomeAfterPhoneVerifyGuide();
    } catch (err) {
      /* 40910（与已登记号码不一致）等业务错误 message 直接透出 */
      toastError(err);
    }
  };

  return (
    <View className='pg' style={{ paddingTop: '72rpx' }}>
      <View className='col' style={{ alignItems: 'center', gap: '12rpx' }}>
        <Text className='tx-title' style={{ fontSize: '56rpx' }}>
          药准时 MedOnTime
        </Text>
        <Text className='tx-md tx-sub'>按时吃药，家人放心</Text>
      </View>
      <Card>
        <View className='col' style={{ gap: '24rpx' }}>
          <SegTabs
            options={[
              { value: 'password', label: '密码登录' },
              { value: 'code', label: '验证码登录' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'password' | 'code')}
          />
          <Field label='手机号'>
            <TxtInput value={phone} onChange={setPhone} placeholder='请输入 11 位手机号' type='number' maxlength={11} />
          </Field>
          {mode === 'password' ? (
            <Field label='密码'>
              <TxtInput value={password} onChange={setPassword} placeholder='请输入密码' password />
            </Field>
          ) : (
            <Field label='短信验证码'>
              <View className='row' style={{ gap: '12rpx' }}>
                <View className='grow'>
                  <TxtInput value={code} onChange={setCode} placeholder='6 位验证码' type='number' maxlength={6} />
                </View>
                <SmsCodeButton phone={phone} scene='login' />
              </View>
            </Field>
          )}
          <ErrorLine error={error} />
          <Btn block disabled={busy} onClick={submit}>
            {busy ? '登录中…' : '登录'}
          </Btn>
          <Btn variant='soft' block disabled={wxBusy} onClick={wechatLogin}>
            {wxBusy ? '微信登录中…' : '微信一键登录'}
          </Btn>
          <View className='row-between'>
            <Text className='tx-md tx-green' onClick={() => Taro.navigateTo({ url: '/pages/register/index' })}>
              注册新账号
            </Text>
            <Text className='tx-md tx-sub' onClick={() => setResetOpen((v) => !v)}>
              忘记密码
            </Text>
          </View>
          {resetOpen && <ResetPasswordForm onDone={() => setResetOpen(false)} />}
        </View>
      </Card>
      {needPhoneVerify && (
        <Card>
          <View className='col' style={{ gap: '20rpx' }}>
            <Text className='tx-h'>还差一步：验证手机号</Text>
            <Text className='tx-md tx-sub' style={{ lineHeight: 1.7 }}>
              完成手机号验证后可接收短信提醒并接受家人照护授权
            </Text>
            {/* getPhoneNumber 必须使用 @tarojs/components 原生 Button，项目 Btn（View 封装）无法触发微信授权 */}
            <Button
              className='btn btn-primary btn-block'
              openType='getPhoneNumber'
              onGetPhoneNumber={onGetPhoneNumber}
            >
              验证手机号
            </Button>
            <Btn variant='ghost' block onClick={goHomeAfterPhoneVerifyGuide}>
              稍后再说
            </Btn>
          </View>
        </Card>
      )}
      <Text className='tx-sm tx-sub' style={{ textAlign: 'center' }}>
        登录即代表同意《用户协议》与《隐私政策》；用药数据仅用于提醒与照护。
      </Text>
    </View>
  );
}

function ResetPasswordForm({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await authApi.resetPassword({ phone, code, newPassword });
      toastOk('密码已重置，请用新密码登录');
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className='col' style={{ gap: '20rpx', borderTop: '1rpx solid #eef1ef', paddingTop: '24rpx' }}>
      <Text className='tx-h'>重置密码</Text>
      <Field label='手机号'>
        <TxtInput value={phone} onChange={setPhone} placeholder='注册手机号' type='number' maxlength={11} />
      </Field>
      <Field label='短信验证码'>
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <TxtInput value={code} onChange={setCode} placeholder='6 位验证码' type='number' maxlength={6} />
          </View>
          <SmsCodeButton phone={phone} scene='reset' />
        </View>
      </Field>
      <Field label='新密码'>
        <TxtInput value={newPassword} onChange={setNewPassword} placeholder='至少 8 位' password />
      </Field>
      <View className='row' style={{ gap: '12rpx' }}>
        <View className='grow'>
          <Btn variant='ghost' block onClick={onDone}>
            取消
          </Btn>
        </View>
        <View className='grow'>
          <Btn block disabled={busy} onClick={submit}>
            确认重置
          </Btn>
        </View>
      </View>
    </View>
  );
}
