import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { accountApi, authApi } from '../../lib/endpoints';
import { tokenStore, toastError, toastInfo, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { LOGIN_PAGE, useSessionGuard } from '../../lib/hooks';
import { requestReminderSubscribe } from '../../lib/notify';
import { ACCOUNT_STATUS_LABELS } from '../../lib/dict';
import { fmtDateTime } from '../../lib/time';
import { THEMES, type MiniThemeId } from '../../lib/theme';
import { APP_VERSION } from '../../config';
import type { UserSession } from '../../lib/types';
import { Badge, Btn, Card, EmptyState, ErrorLine, Field, Loading, PageShell, SegTabs, TxtInput } from '../../components/ui';

/** 设置：账号资料（含手机号微信核验）、微信绑定、消息订阅、登录会话、注销说明与申请、退出登录。与 Web 端 Settings 同口径。 */
export default function Settings() {
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
      toastInfo('已取消，可随时在此完成手机号验证');
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
      await loadProfile();
    } catch (err) {
      toastError(err);
    }
  };

  const saveProfile = async () => {
    try {
      const saved = await accountApi.updateProfile({ nickname, timezone });
      actions.setAccount(saved);
      toastOk('账号资料已保存');
    } catch (err) {
      setProfileError(err);
    }
  };

  const revoke = async (s: UserSession) => {
    try {
      await accountApi.revokeSession(s.id);
      setSessions((list) => (list ?? []).filter((x) => x.id !== s.id));
      toastOk('该设备会话已退出');
    } catch (e) {
      toastError(e);
    }
  };

  const bindWechat = async () => {
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
      const r = await authApi.wechatBind(code);
      toastOk(r.message ?? '微信绑定成功');
      await loadProfile();
    } catch (e) {
      toastError(e);
    }
  };

  const applyCancel = async () => {
    const res = await Taro.showModal({
      title: '申请注销账号',
      content:
        '提交后进入 30 天冷静期：冷静期内可联系客服撤销；期满后可识别个人信息将被物理删除，健康明细做不可逆匿名化归档，账号不可恢复。确定提交吗？',
      confirmText: '提交申请',
      confirmColor: '#DC2626',
    });
    if (!res.confirm) return;
    setBusy(true);
    try {
      await accountApi.cancel(cancelReason || undefined);
      await Taro.showModal({
        title: '注销申请已提交',
        content: '已进入 30 天冷静期。冷静期内正常登录并联系客服即可撤销申请；期满后账号与可识别信息将被删除。',
        showCancel: false,
        confirmText: '知道了',
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
      title: '退出登录',
      content: '退出后本机不再保持登录状态，提醒的订阅消息不受影响。',
      confirmText: '退出',
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
      <Text className='tx-title'>设置</Text>

      <Card title='账号资料'>
        <ErrorLine error={profileError} />
        {!account ? (
          <Loading />
        ) : (
          <View className='col' style={{ gap: '24rpx' }}>
            <View className='row-wrap'>
              <Text className='tx-md tx-sub'>手机号：{account.phoneMasked ?? '—'}</Text>
              <Badge tone={account.phoneVerified ? 'green' : 'amber'}>
                {account.phoneVerified ? '已验证' : '未验证'}
              </Badge>
              <Badge tone={cancelling ? 'amber' : 'green'}>
                {ACCOUNT_STATUS_LABELS[account.status] ?? account.status}
              </Badge>
              {account.registeredAt && <Text className='tx-sm tx-sub'>注册于 {fmtDateTime(account.registeredAt)}</Text>}
            </View>
            {account.phoneVerified === false && (
              <View className='col' style={{ gap: '12rpx' }}>
                <Text className='tx-sm tx-sub' style={{ lineHeight: 1.6 }}>
                  手机号未验证：完成验证后可接收短信提醒并接受家人照护授权（微信核验真号，无需短信验证码）
                </Text>
                {/* getPhoneNumber 必须使用 @tarojs/components 原生 Button，项目 Btn（View 封装）无法触发微信授权 */}
                <Button
                  className='btn btn-soft btn-block'
                  openType='getPhoneNumber'
                  onGetPhoneNumber={onGetPhoneNumber}
                >
                  验证手机号
                </Button>
              </View>
            )}
            <Field label='昵称'>
              <TxtInput value={nickname} onChange={setNickname} />
            </Field>
            <Field label='账号时区' hint='成员各自的提醒时间以成员时区为准，这里是账号默认时区'>
              <TxtInput value={timezone} onChange={setTimezone} placeholder='Asia/Shanghai' />
            </Field>
            <View>
              <Btn onClick={saveProfile}>保存资料</Btn>
            </View>
          </View>
        )}
      </Card>

      <Card title='界面主题'>
        <View className='col' style={{ gap: '16rpx' }}>
          <SegTabs
            options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
            value={themeId}
            onChange={(v) => actions.setThemeId(v as MiniThemeId)}
          />
          <Text className='tx-sm tx-sub' style={{ lineHeight: 1.7 }}>
            {THEMES.find((t) => t.id === themeId)?.description ?? ''}
            切换后立即生效，保存在本机。主题 B（临床极简）仅 Admin 与 PC Web 可用，移动端不提供。
          </Text>
        </View>
      </Card>

      <Card title='账号绑定与订阅'>
        <View className='menu-row'>
          <View className='col' style={{ gap: '4rpx' }}>
            <Text className='tx-md tx-strong'>微信绑定</Text>
            <Text className='tx-sm tx-sub'>
              {account?.hasWechat ? '已绑定微信，可用微信一键登录并接收订阅消息提醒' : '绑定后可用微信登录并接收订阅消息提醒'}
            </Text>
          </View>
          {account?.hasWechat ? (
            <Badge tone='green'>已绑定</Badge>
          ) : (
            <Btn variant='soft' onClick={bindWechat}>
              绑定微信
            </Btn>
          )}
        </View>
        <View className='menu-row menu-row-last'>
          <View className='col grow' style={{ gap: '4rpx', marginRight: '16rpx' }}>
            <Text className='tx-md tx-strong'>订阅用药提醒消息</Text>
            <Text className='tx-sm tx-sub'>微信订阅消息需您主动授权；模板在公众平台配置完成后在此订阅</Text>
          </View>
          <Btn variant='soft' onClick={() => void requestReminderSubscribe()}>
            去订阅
          </Btn>
        </View>
      </Card>

      <Card title='登录会话'>
        {sessions === null ? (
          <Loading />
        ) : sessions.length === 0 ? (
          <EmptyState text='暂无其他登录会话。' />
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
                    {s.deviceName ?? s.userAgent ?? '未知设备'}
                    {s.current ? '（本机）' : ''}
                  </Text>
                  <Text className='tx-sm tx-sub'>
                    {s.ipAddress ?? ''}
                    {s.lastActiveAt ? ` · 最近活跃 ${fmtDateTime(s.lastActiveAt)}` : ''}
                  </Text>
                </View>
                {!s.current && (
                  <Btn variant='ghost' onClick={() => void revoke(s)}>
                    退出该设备
                  </Btn>
                )}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title='注销账号'>
        <View className='col' style={{ gap: '16rpx' }}>
          <Text className='tx-md tx-sub' style={{ lineHeight: 1.7 }}>
            注销说明：提交申请后进入 30
            天冷静期，期间账号可正常登录、可联系客服撤销申请；冷静期届满后，手机号、昵称等可识别个人信息将被物理删除，用药与健康明细仅以不可逆匿名化形式归档，账号不可恢复。若您是照护人，名下由他人授权照护的成员不受影响；您自有成员的计划将停止生成提醒。
          </Text>
          {cancelling ? (
            <Text className='tx-md' style={{ color: 'var(--color-status-warning-text)' }}>
              当前状态：注销冷静期中（申请时间 {account?.cancelApplyAt ? fmtDateTime(account.cancelApplyAt) : '—'}
              ）。如需撤销，请联系客服。
            </Text>
          ) : (
            <>
              <Field label='注销原因（选填）'>
                <TxtInput value={cancelReason} onChange={setCancelReason} placeholder='帮助我们改进，可留空' />
              </Field>
              <View>
                <Btn variant='danger' disabled={busy} onClick={applyCancel}>
                  申请注销
                </Btn>
              </View>
            </>
          )}
        </View>
      </Card>

      <Btn variant='ghost' block onClick={logout}>
        退出登录
      </Btn>
      <Text className='tx-sm tx-sub' style={{ textAlign: 'center' }}>
        药准时 MedOnTime · 小程序版本 {APP_VERSION}
      </Text>
    </PageShell>
  );
}
