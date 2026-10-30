import { useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { tokenStore, toastError, toastOk } from '../../lib/api';
import { authApi, memberApi } from '../../lib/endpoints';
import { actions } from '../../lib/store';
import { navigateAfterAuth } from '../../lib/hooks';
import { Btn, Card, ErrorLine, Field, PageShell, SegTabs, TxtInput } from '../../components/ui';
import { EmailCodeButton } from '../../components/EmailCodeButton';
import { tr, useNavTitle, useT } from '../../lib/i18n';

/** 注册：邮箱 + 邮箱验证码 + 密码（≥8 位）+ 昵称（选填）。与 Web 端 Register 同逻辑。
 * 验证码通道：邮箱为唯一可用通道（默认）；短信通道暂未开通（个人拿不到腾讯云短信签名/模板），
 * 短信入口保留并标注，发码/提交一律拦截提示并切回邮箱 tab，不调后端接口。 */
export default function Register() {
  const t = useT();
  useNavTitle('nav.register');
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
      toastError(new Error(t('auth.smsNotOpen')));
      setChannel('email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(new Error(t('auth.invalidEmail')));
      return;
    }
    if (!emailCode.trim()) {
      setError(new Error(t('auth.enterEmailCode')));
      return;
    }
    if (password.length < 8) {
      setError(new Error(t('reg.passwordTooShort')));
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
      toastOk(t('reg.success'));
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
        {t('reg.pageTitle')}
      </Text>
      <Card>
        <View className='col' style={{ gap: '24rpx' }}>
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
                <TxtInput value={phone} onChange={setPhone} placeholder={t('reg.phonePlaceholder')} type='number' maxlength={11} />
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
                <TxtInput value={email} onChange={setEmail} placeholder={t('auth.emailPlaceholder')} maxlength={254} />
              </Field>
              <Field label={t('auth.emailCode')}>
                <View className='row' style={{ gap: '12rpx' }}>
                  <View className='grow'>
                    <TxtInput value={emailCode} onChange={setEmailCode} placeholder={t('auth.codePlaceholder')} type='number' maxlength={6} />
                  </View>
                  <EmailCodeButton email={email} scene='register' />
                </View>
              </Field>
            </>
          )}
          <Field label={t('reg.setPassword')} hint={t('reg.passwordHint')}>
            <TxtInput value={password} onChange={setPassword} placeholder={t('reg.passwordPlaceholder')} password />
          </Field>
          <Field label={t('reg.nickname')}>
            <TxtInput value={nickname} onChange={setNickname} placeholder={t('reg.nicknamePlaceholder')} />
          </Field>
          {channel === 'email' && (
            <Field label={t('reg.phoneOptional')} hint={t('reg.phoneOptionalHint')}>
              <TxtInput value={emailPhone} onChange={setEmailPhone} placeholder={t('reg.phoneOptionalPlaceholder')} type='number' maxlength={11} />
            </Field>
          )}
          <ErrorLine error={error} />
          <Btn block disabled={busy} onClick={submit}>
            {busy ? t('reg.registering') : t('reg.registerBtn')}
          </Btn>
          <Text className='tx-md' style={{ textAlign: 'center' }}>
            {t('reg.hasAccount')}
            <Text className='tx-green' onClick={() => Taro.navigateBack()}>
              {t('reg.goLogin')}
            </Text>
          </Text>
        </View>
      </Card>
    </PageShell>
  );
}
