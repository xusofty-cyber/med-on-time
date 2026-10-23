import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { accountApi, authApi } from '../../lib/endpoints';
import { tokenStore, toastError, toastInfo, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { LOGIN_PAGE, useSessionGuard } from '../../lib/hooks';
import { requestReminderSubscribe } from '../../lib/notify';
import { ACCOUNT_STATUS_LABELS } from '../../lib/dict';
import { fmtDateTime } from '../../lib/time';
import { APP_VERSION } from '../../config';
import type { UserSession } from '../../lib/types';
import { Badge, Btn, Card, EmptyState, ErrorLine, Field, Loading, TxtInput } from '../../components/ui';

/** 设置：账号资料、微信绑定（占位）、消息订阅、登录会话、注销说明与申请、退出登录。与 Web 端 Settings 同口径。 */
export default function Settings() {
  useSessionGuard();
  const account = useApp((s) => s.account);
  const [nickname, setNickname] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [profileError, setProfileError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountApi
      .profile()
      .then((p) => {
        actions.setAccount(p);
        setNickname(p.nickname);
        setTimezone(p.timezone);
      })
      .catch(setProfileError);
    accountApi
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

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
      const r = await authApi.bindWechat();
      toastInfo(r.message ?? '微信绑定尚未开通');
    } catch (e) {
      toastInfo(e instanceof Error ? e.message : '微信绑定尚未开通');
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
    <View className='pg'>
      <Text className='tx-title'>设置</Text>

      <Card title='账号资料'>
        <ErrorLine error={profileError} />
        {!account ? (
          <Loading />
        ) : (
          <View className='col' style={{ gap: '24rpx' }}>
            <View className='row-wrap'>
              <Text className='tx-md tx-sub'>手机号：{account.phoneMasked ?? '—'}</Text>
              <Badge tone={cancelling ? 'amber' : 'green'}>
                {ACCOUNT_STATUS_LABELS[account.status] ?? account.status}
              </Badge>
              {account.registeredAt && <Text className='tx-sm tx-sub'>注册于 {fmtDateTime(account.registeredAt)}</Text>}
            </View>
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

      <Card title='账号绑定与订阅'>
        <View className='menu-row'>
          <View className='col' style={{ gap: '4rpx' }}>
            <Text className='tx-md tx-strong'>微信绑定</Text>
            <Text className='tx-sm tx-sub'>绑定后可用微信登录并接收订阅消息提醒（尚未开通）</Text>
          </View>
          <Btn variant='soft' onClick={bindWechat}>
            绑定微信
          </Btn>
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
                  borderBottom: i < sessions.length - 1 ? '1rpx solid #EEF1EF' : 'none',
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
            <Text className='tx-md' style={{ color: '#92400E' }}>
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
    </View>
  );
}
