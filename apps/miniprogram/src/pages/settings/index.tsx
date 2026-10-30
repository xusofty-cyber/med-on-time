import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { accountApi, authApi } from '../../lib/endpoints';
import { tokenStore, toastError, toastInfo, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { LOGIN_PAGE, useSessionGuard } from '../../lib/hooks';
import { requestReminderSubscribe } from '../../lib/notify';
import { accountStatusLabels } from '../../lib/dict';
import { fmtDateTime } from '../../lib/time';
import { themes, type MiniThemeId } from '../../lib/theme';
import { getLocale, LOCALES, setLocaleState, useNavTitle, useT, type Locale } from '../../lib/i18n';
import { APP_VERSION } from '../../config';
import type { UserSession } from '../../lib/types';
import { Badge, Btn, Card, EmptyState, ErrorLine, Field, Loading, PageShell, SegTabs, TxtInput } from '../../components/ui';

/** 设置：账号资料（含手机号微信核验）、微信绑定、消息订阅、登录会话、注销说明与申请、退出登录。与 Web 端 Settings 同口径。 */
export default function Settings() {
  const t = useT();
  useNavTitle('nav.settings');
  const [locale, setLocale] = useState<Locale>(getLocale());
  useSessionGuard();
  const account = useApp((s) => s.account);
  const themeId = useApp((s) => s.themeId);
  const [nickname, setNickname] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [profileError, setProfileError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  /** 账号资料拉取（首屏与手机号验证后刷新共用）。 */
  const loadProfile = async () => {
    try {
      const p = await accountApi.profile();
      actions.setAccount(p);
      setNickname(p.nickname);
      setTimezone(p.timezone);
    } catch (err) {
      setProfileError(err);
    }
  };

  useEffect(() => {
    void loadProfile();
    accountApi
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** getPhoneNumber 回调（必须原生 Button 触发）：微信核验真号后刷新资料。40910 等业务错误 message 直接透出。 */
  const onGetPhoneNumber = async (e: { detail: { code?: string; errMsg?: string } }) => {
    const errMsg = e.detail.errMsg ?? '';
    if (errMsg.includes('deny')) {
      toastInfo(t('set.phoneDenied'));
      return;
    }
    const phoneCode = e.detail.code;
    if (!phoneCode) {
      toastError(new Error(t('set.noPhoneCode')));
      return;
    }
    try {
      const updated = await authApi.verifyPhoneByWechat(phoneCode);
      actions.setAccount(updated);
      toastOk(t('set.phoneVerified'));
      await loadProfile();
    } catch (err) {
      toastError(err);
    }
  };

  const saveProfile = async () => {
    try {
      const saved = await accountApi.updateProfile({ nickname, timezone });
      actions.setAccount(saved);
      toastOk(t('set.profileSaved'));
    } catch (err) {
      setProfileError(err);
    }
  };

  const revoke = async (s: UserSession) => {
    try {
      await accountApi.revokeSession(s.id);
      setSessions((list) => (list ?? []).filter((x) => x.id !== s.id));
      toastOk(t('set.sessionRevoked'));
    } catch (e) {
      toastError(e);
    }
  };

  const bindWechat = async () => {
    try {
      let code: string;
      try {
        const res = await Taro.login();
        if (!res.code) throw new Error(t('auth.wxNoCode'));
        code = res.code;
      } catch {
        toastError(new Error(t('bind.wxFail')));
        return;
      }
      const r = await authApi.wechatBind(code);
      toastOk(r.message ?? t('bind.ok'));
      await loadProfile();
    } catch (e) {
      toastError(e);
    }
  };

  const applyCancel = async () => {
    const res = await Taro.showModal({
      title: t('set.cancelTitle'),
      content: t('set.cancelContent'),
      confirmText: t('set.cancelConfirm'),
      confirmColor: '#DC2626',
    });
    if (!res.confirm) return;
    setBusy(true);
    try {
      await accountApi.cancel(cancelReason || undefined);
      await Taro.showModal({
        title: t('set.cancelDoneTitle'),
        content: t('set.cancelDoneContent'),
        showCancel: false,
        confirmText: t('notify.gotIt'),
      });
      const p = await accountApi.profile();
      actions.setAccount(p);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    const res = await Taro.showModal({
      title: t('set.logoutTitle'),
      content: t('set.logoutContent'),
      confirmText: t('set.logoutConfirm'),
    });
    if (!res.confirm) return;
    try {
      await authApi.logout();
    } catch {
      /* 退出接口失败也照常清本地会话 */
    }
    tokenStore.clear();
    actions.resetSession();
    Taro.reLaunch({ url: LOGIN_PAGE });
  };

  const cancelling = account?.status === 'cancelling';

  return (
    <PageShell>
      <Text className='tx-title'>{t('nav.settings')}</Text>

      <Card title={t('set.profileCard')}>
        <ErrorLine error={profileError} />
        {!account ? (
          <Loading />
        ) : (
          <View className='col' style={{ gap: '24rpx' }}>
            <View className='row-wrap'>
              <Text className='tx-md tx-sub'>{t('set.phone', { p: account.phoneMasked ?? '—' })}</Text>
              <Badge tone={account.phoneVerified ? 'green' : 'amber'}>
                {account.phoneVerified ? t('set.verified') : t('set.unverified')}
              </Badge>
              <Badge tone={cancelling ? 'amber' : 'green'}>
                {accountStatusLabels()[account.status] ?? account.status}
              </Badge>
              {account.registeredAt && <Text className='tx-sm tx-sub'>{t('set.registeredAt', { t: fmtDateTime(account.registeredAt) })}</Text>}
            </View>
            {account.phoneVerified === false && (
              <View className='col' style={{ gap: '12rpx' }}>
                <Text className='tx-sm tx-sub' style={{ lineHeight: 1.6 }}>
                  {t('set.phoneUnverifiedNote')}
                </Text>
                {/* getPhoneNumber 必须使用 @tarojs/components 原生 Button，项目 Btn（View 封装）无法触发微信授权 */}
                <Button
                  className='btn btn-soft btn-block'
                  openType='getPhoneNumber'
                  onGetPhoneNumber={onGetPhoneNumber}
                >
                  {t('set.verifyPhone')}
                </Button>
              </View>
            )}
            <Field label={t('set.nickname')}>
              <TxtInput value={nickname} onChange={setNickname} />
            </Field>
            <Field label={t('set.timezone')} hint={t('set.timezoneHint')}>
              <TxtInput value={timezone} onChange={setTimezone} placeholder='Asia/Shanghai' />
            </Field>
            <View>
              <Btn onClick={saveProfile}>{t('set.saveProfile')}</Btn>
            </View>
          </View>
        )}
      </Card>

      <Card title={t('set.themeCard')}>
        <View className='col' style={{ gap: '16rpx' }}>
          <SegTabs
            options={themes().map((th) => ({ value: th.id, label: th.label }))}
            value={themeId}
            onChange={(v) => actions.setThemeId(v as MiniThemeId)}
          />
          <Text className='tx-sm tx-sub' style={{ lineHeight: 1.7 }}>
            {themes().find((th) => th.id === themeId)?.description ?? ''}
            {t('set.themeNote')}
          </Text>
        </View>
      </Card>

      <Card title={t('common.language')}>
        <SegTabs
          options={LOCALES.map((l) => ({ value: l.value, label: t(l.labelKey) }))}
          value={locale}
          onChange={(v) => {
            setLocaleState(v as Locale);
            setLocale(v as Locale);
          }}
        />
      </Card>

      <Card title={t('set.bindingCard')}>
        <View className='menu-row'>
          <View className='col' style={{ gap: '4rpx' }}>
            <Text className='tx-md tx-strong'>{t('set.wxBindRow')}</Text>
            <Text className='tx-sm tx-sub'>
              {account?.hasWechat ? t('set.wxBoundDesc') : t('set.wxUnboundDesc')}
            </Text>
          </View>
          {account?.hasWechat ? (
            <Badge tone='green'>{t('me.bound')}</Badge>
          ) : (
            <Btn variant='soft' onClick={bindWechat}>
              {t('me.wxBind')}
            </Btn>
          )}
        </View>
        <View className='menu-row menu-row-last'>
          <View className='col grow' style={{ gap: '4rpx', marginRight: '16rpx' }}>
            <Text className='tx-md tx-strong'>{t('set.subscribeRow')}</Text>
            <Text className='tx-sm tx-sub'>{t('set.subscribeDesc')}</Text>
          </View>
          <Btn variant='soft' onClick={() => void requestReminderSubscribe()}>
            {t('set.subscribeBtn')}
          </Btn>
        </View>
      </Card>

      <Card title={t('set.sessionsCard')}>
        {sessions === null ? (
          <Loading />
        ) : sessions.length === 0 ? (
          <EmptyState text={t('set.noSessions')} />
        ) : (
          <View className='col'>
            {sessions.map((s, i) => (
              <View
                key={s.id}
                className='row-between'
                style={{
                  padding: '18rpx 0',
                  borderBottom: i < sessions.length - 1 ? '1rpx solid var(--color-background-muted)' : 'none',
                }}
              >
                <View className='col' style={{ gap: '4rpx' }}>
                  <Text className='tx-md'>
                    {s.deviceName ?? s.userAgent ?? t('scan.unknownDevice')}
                    {s.current ? t('set.currentDevice') : ''}
                  </Text>
                  <Text className='tx-sm tx-sub'>
                    {s.ipAddress ?? ''}
                    {s.lastActiveAt ? t('set.lastActive', { t: fmtDateTime(s.lastActiveAt) }) : ''}
                  </Text>
                </View>
                {!s.current && (
                  <Btn variant='ghost' onClick={() => void revoke(s)}>
                    {t('set.revoke')}
                  </Btn>
                )}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title={t('set.cancelCard')}>
        <View className='col' style={{ gap: '16rpx' }}>
          <Text className='tx-md tx-sub' style={{ lineHeight: 1.7 }}>
            {t('set.cancelNote')}
          </Text>
          {cancelling ? (
            <Text className='tx-md' style={{ color: 'var(--color-status-warning-text)' }}>
              {t('set.cancellingStatus', { t: account?.cancelApplyAt ? fmtDateTime(account.cancelApplyAt) : '—' })}
            </Text>
          ) : (
            <>
              <Field label={t('set.cancelReason')}>
                <TxtInput value={cancelReason} onChange={setCancelReason} placeholder={t('set.cancelReasonPlaceholder')} />
              </Field>
              <View>
                <Btn variant='danger' disabled={busy} onClick={applyCancel}>
                  {t('set.applyCancel')}
                </Btn>
              </View>
            </>
          )}
        </View>
      </Card>

      <Btn variant='ghost' block onClick={logout}>
        {t('set.logout')}
      </Btn>
      <Text className='tx-sm tx-sub' style={{ textAlign: 'center' }}>
        {t('set.version', { v: APP_VERSION })}
      </Text>
    </PageShell>
  );
}
