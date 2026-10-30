import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { ApiError, tokenStore, toastError, toastInfo, toastOk } from '../../lib/api';
import { authApi, memberApi } from '../../lib/endpoints';
import { actions, useApp } from '../../lib/store';
import { navigateAfterAuth } from '../../lib/hooks';
import type { Account, AuthResult } from '../../lib/types';
import { Btn, Card, ErrorLine, Field, PageShell, SegTabs, TxtInput } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';
import { EmailCodeButton } from '../../components/EmailCodeButton';

/** 登录：手机号/邮箱 + 密码 / 邮箱验证码双模式；含忘记密码（验证码重置）。与 Web 端 Login 同逻辑。
 * 验证码通道：邮箱为唯一可用通道（默认）；短信通道暂未开通（个人拿不到腾讯云短信签名/模板），
 * 短信入口保留并标注，发码/提交一律拦截提示并切回邮箱 tab，不调后端接口。 */
export default function Login() {
  const t = useT();
  useNavTitle('nav.login');
  const booted = useApp((s) => s.booted);
  const account = useApp((s) => s.account);
  const [mode, setMode] = useState<'password' | 'code'>('password');
  /* 验证码通道：默认邮箱（唯一可用通道）；手机号入口保留但暂未开通 */
  const [codeChannel, setCodeChannel] = useState<'phone' | 'email'>('email');
  /* 密码模式为「手机号或邮箱」，验证码模式默认邮箱；同一输入框按模式校验 */
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [wxBusy, setWxBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  /* 微信登录后手机号未验证：先展示引导卡片，不跳首页。ref 在 setAccount 之前置位，避免会话恢复 effect 抢先跳转 */
  const [needPhoneVerify, setNeedPhoneVerify] = useState(false);
  const phoneVerifyPendingRef = useRef(false);

  /* 已登录状态下进入登录页（冷启动恢复会话）→ 直接进今日提醒或回跳待确认扫码页；待完成手机号验证时除外 */
  useEffect(() => {
    if (booted && account && !phoneVerifyPendingRef.current) navigateAfterAuth();
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
    const isEmail = identifier.includes('@');
    if (mode === 'code' && codeChannel === 'phone') {
      /* 短信通道暂未开通：不调接口，提示并切回邮箱 tab */
      toastError(new Error(t('auth.smsNotOpen')));
      setCodeChannel('email');
      return;
    }
    if (mode === 'code' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(new Error(t('auth.invalidEmail')));
      return;
    }
    if (mode === 'code' && !emailCode) {
      setError(new Error(t('auth.enterEmailCode')));
      return;
    }
    if (mode === 'password' && isEmail && !/^\S+@\S+\.\S+$/.test(identifier)) {
      setError(new Error(t('auth.invalidEmail')));
      return;
    }
    if (mode === 'password' && !isEmail && !/^1\d{10}$/.test(identifier)) {
      setError(new Error(t('auth.invalidIdentifier')));
      return;
    }
    if (mode === 'password' && !password) {
      setError(new Error(t('auth.enterPassword')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'password'
          ? await authApi.login({ account: identifier, password })
          : await authApi.loginByCode({ email, code: emailCode });
      await persistSession(result);
      toastOk(t('auth.loginOk'));
      navigateAfterAuth();
    } catch (err) {
      if (err instanceof ApiError && err.code === 401) setError(new Error(t('auth.wrongCredentials')));
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
        if (!res.code) throw new Error(t('auth.wxNoCode'));
        code = res.code;
      } catch {
        toastError(new Error(t('auth.wxFailed')));
        return;
      }
      const result = await authApi.wechatMiniappLogin({ code });
      const acct = await persistSession(result, (a) => {
        if (a?.phoneVerified === false) phoneVerifyPendingRef.current = true;
      });
      toastOk(t('auth.loginOk'));
      if (acct?.phoneVerified === false) {
        /* 先不跳首页，页面内展示手机号验证引导卡片 */
        setNeedPhoneVerify(true);
        return;
      }
      navigateAfterAuth();
    } catch (err) {
      setError(err);
    } finally {
      setWxBusy(false);
    }
  };

  const goHomeAfterPhoneVerifyGuide = () => {
    phoneVerifyPendingRef.current = false;
    setNeedPhoneVerify(false);
    navigateAfterAuth();
  };

  /** getPhoneNumber 回调（必须原生 Button 触发）：e.detail.code 为微信核验动态令牌。 */
  const onGetPhoneNumber = async (e: { detail: { code?: string; errMsg?: string } }) => {
    const errMsg = e.detail.errMsg ?? '';
    if (errMsg.includes('deny')) {
      toastInfo(t('auth.verifyLaterHint'));
      return;
    }
    const phoneCode = e.detail.code;
    if (!phoneCode) {
      toastError(new Error(t('auth.noPhoneAuth')));
      return;
    }
    try {
      const updated = await authApi.verifyPhoneByWechat(phoneCode);
      actions.setAccount(updated);
      toastOk(t('auth.phoneVerified'));
      goHomeAfterPhoneVerifyGuide();
    } catch (err) {
      /* 40910（与已登记号码不一致）等业务错误 message 直接透出 */
      toastError(err);
    }
  };

  return (
    <PageShell style={{ paddingTop: '72rpx' }}>
      <View className='col' style={{ alignItems: 'center', gap: '12rpx' }}>
        <Text className='tx-title' style={{ fontSize: '56rpx' }}>
          {t('auth.brandTitle')}
        </Text>
        <Text className='tx-md tx-sub'>{t('auth.tagline')}</Text>
      </View>
      <Card>
        <View className='col' style={{ gap: '24rpx' }}>
          <SegTabs
            options={[
              { value: 'password', label: t('auth.tabPassword') },
              { value: 'code', label: t('auth.tabCode') },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'password' | 'code')}
          />
          {mode === 'password' ? (
            <Field label={t('auth.account')}>
              <TxtInput value={identifier} onChange={setIdentifier} placeholder={t('auth.accountPlaceholder')} maxlength={64} />
            </Field>
          ) : (
            <>
              <SegTabs
                options={[
                  { value: 'phone', label: t('auth.channelPhoneSoon') },
                  { value: 'email', label: t('auth.channelEmail') },
                ]}
                value={codeChannel}
                onChange={(v) => setCodeChannel(v as 'phone' | 'email')}
              />
              {codeChannel === 'phone' ? (
                <>
                  <Text className='tx-sm' style={{ color: 'var(--color-status-danger-text)' }}>
                    {t('auth.smsNotOpen')}
                  </Text>
                  <Field label={t('auth.phone')}>
                    <TxtInput value={identifier} onChange={setIdentifier} placeholder={t('auth.phonePlaceholder')} type='number' maxlength={11} />
                  </Field>
                  <Field label={t('auth.smsCode')}>
                    <View className='row' style={{ gap: '12rpx' }}>
                      <View className='grow'>
                        <TxtInput value={code} onChange={setCode} placeholder={t('auth.codePlaceholder')} type='number' maxlength={6} />
                      </View>
                      <Btn
                        variant='soft'
                        onClick={() => {
                          toastError(new Error(tr('auth.smsNotOpen')));
                          setCodeChannel('email');
                        }}
                      >
                        {tr('auth.sendCode')}
                      </Btn>
                    </View>
                  </Field>
                </>
              ) : (
                <>
                  <Field label={t('auth.email')}>
                    <TxtInput value={email} onChange={setEmail} placeholder={t('auth.emailPlaceholder')} maxlength={254} />
                  </Field>
                  <Field label={t('auth.emailCode')}>
                    <View className='row' style={{ gap: '12rpx' }}>
                      <View className='grow'>
                        <TxtInput value={emailCode} onChange={setEmailCode} placeholder={t('auth.codePlaceholder')} type='number' maxlength={6} />
                      </View>
                      <EmailCodeButton email={email} scene='login' />
                    </View>
                  </Field>
                </>
              )}
            </>
          )}
          {mode === 'password' && (
            <Field label={t('auth.password')}>
              <TxtInput value={password} onChange={setPassword} placeholder={t('auth.passwordPlaceholder')} password />
            </Field>
          )}
          <ErrorLine error={error} />
          <Btn block disabled={busy} onClick={submit}>
            {busy ? t('auth.loggingIn') : t('auth.login')}
          </Btn>
          <Btn variant='soft' block disabled={wxBusy} onClick={wechatLogin}>
            {wxBusy ? t('auth.wxLoggingIn') : t('auth.wxLogin')}
          </Btn>
          <View className='row-between'>
            <Text className='tx-md tx-green' onClick={() => Taro.navigateTo({ url: '/pages/register/index' })}>
              {t('auth.registerNew')}
            </Text>
            <Text className='tx-md tx-sub' onClick={() => setResetOpen((v) => !v)}>
              {t('auth.forgot')}
            </Text>
          </View>
          {resetOpen && <ResetPasswordForm onDone={() => setResetOpen(false)} />}
        </View>
      </Card>
      {needPhoneVerify && (
        <Card>
          <View className='col' style={{ gap: '20rpx' }}>
            <Text className='tx-h'>{t('auth.verifyTitle')}</Text>
            <Text className='tx-md tx-sub' style={{ lineHeight: 1.7 }}>
              {t('auth.verifyDesc')}
            </Text>
            {/* getPhoneNumber 必须使用 @tarojs/components 原生 Button，项目 Btn（View 封装）无法触发微信授权 */}
            <Button
              className='btn btn-primary btn-block'
              openType='getPhoneNumber'
              onGetPhoneNumber={onGetPhoneNumber}
            >
              {t('auth.verifyPhoneBtn')}
            </Button>
            <Btn variant='ghost' block onClick={goHomeAfterPhoneVerifyGuide}>
              {t('auth.later')}
            </Btn>
          </View>
        </Card>
      )}
      <Text className='tx-sm tx-sub' style={{ textAlign: 'center' }}>
        {t('auth.consent')}
      </Text>
    </PageShell>
  );
}

function ResetPasswordForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  /* 找回通道：默认邮箱（唯一可用通道）；手机号入口保留但暂未开通 */
  const [channel, setChannel] = useState<'phone' | 'email'>('email');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (channel === 'phone') {
      /* 短信通道暂未开通：不调接口，提示并切回邮箱 tab */
      toastError(new Error(tr('auth.smsNotOpen')));
      setChannel('email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toastError(new Error(tr('auth.invalidEmail')));
      return;
    }
    if (!emailCode.trim()) {
      toastError(new Error(tr('auth.enterEmailCode')));
      return;
    }
    if (newPassword.length < 8) {
      toastError(new Error(tr('auth.newPasswordTooShort')));
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword({ email, code: emailCode, newPassword });
      toastOk(tr('auth.passwordReset'));
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className='col' style={{ gap: '20rpx', borderTop: '1rpx solid var(--color-background-muted)', paddingTop: '24rpx' }}>
      <Text className='tx-h'>{t('auth.resetTitle')}</Text>
      <SegTabs
        options={[
          { value: 'phone', label: t('auth.channelPhoneSoon') },
          { value: 'email', label: t('auth.channelEmail') },
        ]}
        value={channel}
        onChange={(v) => setChannel(v as 'phone' | 'email')}
      />
      {channel === 'phone' ? (
        <>
          <Text className='tx-sm' style={{ color: 'var(--color-status-danger-text)' }}>
            {t('auth.smsNotOpen')}
          </Text>
          <Field label={t('auth.phone')}>
            <TxtInput value={phone} onChange={setPhone} placeholder={t('auth.registerPhonePlaceholder')} type='number' maxlength={11} />
          </Field>
          <Field label={t('auth.smsCode')}>
            <View className='row' style={{ gap: '12rpx' }}>
              <View className='grow'>
                <TxtInput value={code} onChange={setCode} placeholder={t('auth.codePlaceholder')} type='number' maxlength={6} />
              </View>
              <Btn
                variant='soft'
                onClick={() => {
                  toastError(new Error(tr('auth.smsNotOpen')));
                  setChannel('email');
                }}
              >
                {tr('auth.sendCode')}
              </Btn>
            </View>
          </Field>
        </>
      ) : (
        <>
          <Field label={t('auth.email')}>
            <TxtInput value={email} onChange={setEmail} placeholder={t('auth.registerEmailPlaceholder')} maxlength={254} />
          </Field>
          <Field label={t('auth.emailCode')}>
            <View className='row' style={{ gap: '12rpx' }}>
              <View className='grow'>
                <TxtInput value={emailCode} onChange={setEmailCode} placeholder={t('auth.codePlaceholder')} type='number' maxlength={6} />
              </View>
              <EmailCodeButton email={email} scene='reset' />
            </View>
          </Field>
        </>
      )}
      <Field label={t('auth.newPassword')}>
        <TxtInput value={newPassword} onChange={setNewPassword} placeholder={t('auth.newPasswordPlaceholder')} password />
      </Field>
      <View className='row' style={{ gap: '12rpx' }}>
        <View className='grow'>
          <Btn variant='ghost' block onClick={onDone}>
            {tr('common.cancel')}
          </Btn>
        </View>
        <View className='grow'>
          <Btn block disabled={busy} onClick={submit}>
            {tr('auth.confirmReset')}
          </Btn>
        </View>
      </View>
    </View>
  );
}
