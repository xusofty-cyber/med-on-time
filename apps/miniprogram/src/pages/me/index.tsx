import { useCallback } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { Switch, Text, View } from '@tarojs/components';
import { accountApi, authApi, memberApi, notificationApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { themeSwitchColor } from '../../lib/theme';
import { useSessionGuard } from '../../lib/hooks';
import { ACCOUNT_STATUS_LABELS, RELATIONSHIP_LABELS } from '../../lib/dict';
import { Badge, Card, Loading, PageShell } from '../../components/ui';

/**
 * 我的（tab）：账号概览、成员切换与管理入口、关怀模式开关（成员级）、
 * 照护授权 / 消息中心 / 设置入口（含注销说明，落在设置页）。
 */
export default function Me() {
  const { booted, account } = useSessionGuard();
  const members = useApp((s) => s.members);
  const currentMemberId = useApp((s) => s.currentMemberId);
  const care = useApp((s) => s.careSettings);
  const unread = useApp((s) => s.unreadCount);
  const themeId = useApp((s) => s.themeId);
  const current = members.find((m) => m.id === currentMemberId) ?? null;
  const canConfig = !!current && (!current.accessLevel || current.accessLevel === 'owner' || current.accessLevel === 'L3');

  const refreshUnread = useCallback(async () => {
    try {
      const page = await notificationApi.list(1);
      actions.setUnreadCount(page.unreadTotal ?? page.items.filter((n) => !n.isRead).length);
    } catch {
      /* 未读数拉取失败不打扰用户 */
    }
  }, []);
  useDidShow(() => void refreshUnread());

  /** 绑定微信：Taro.login 取 code → 后端 code2session 绑定到本账号；此后微信一键登录即进本账号。 */
  const bindWechat = async () => {
    try {
      const res = await Taro.login();
      if (!res.code) throw new Error('未获取到微信登录凭证');
      const r = await authApi.wechatBind(res.code);
      toastOk(r.message ?? '微信绑定成功，今后可用微信一键登录');
      actions.setAccount(await accountApi.profile());
    } catch (e) {
      toastError(e);
    }
  };

  const toggleCare = async (on: boolean) => {
    if (!currentMemberId || !care || !canConfig) return;
    try {
      const saved = await memberApi.putCareSettings(currentMemberId, { ...care, careMode: on });
      actions.setCareSettings(saved);
    } catch (e) {
      toastError(e);
    }
  };

  if (!booted) return <Loading text='正在恢复会话…' />;
  if (!account) return <Loading text='正在前往登录…' />;

  return (
    <PageShell>
      <Card>
        <View className='row-between'>
          <View className='col' style={{ gap: '6rpx' }}>
            <Text className='tx-title'>{account.nickname}</Text>
            <Text className='tx-md tx-sub'>{account.phoneMasked ?? ''}</Text>
          </View>
          <Badge tone={account.status === 'cancelling' ? 'amber' : 'green'}>
            {ACCOUNT_STATUS_LABELS[account.status] ?? account.status}
          </Badge>
        </View>
        {account.status === 'cancelling' && (
          <Text className='tx-sm' style={{ color: 'var(--color-status-warning-text)', display: 'block', marginTop: '10rpx' }}>
            账号处于注销冷静期（30 天），冷静期内如需撤销请联系客服或在设置页查看说明。
          </Text>
        )}
      </Card>

      <Card title='当前成员'>
        {members.length === 0 ? (
          <Text className='tx-md tx-sub'>还没有成员，先添加本人或要照护的家人。</Text>
        ) : (
          <View className='col' style={{ gap: '12rpx' }}>
            {members.map((m) => (
              <View
                key={m.id}
                className='row-between'
                style={{
                  background: m.id === currentMemberId ? 'var(--color-background-soft)' : 'var(--color-background-page)',
                  borderRadius: '16rpx',
                  padding: '18rpx 20rpx',
                }}
                onClick={() => actions.setCurrentMember(m.id)}
              >
                <Text className='tx-md'>
                  <Text className='tx-strong'>{m.displayName}</Text>
                  <Text className='tx-sub'>
                    {' '}
                    {RELATIONSHIP_LABELS[m.relationship] ?? m.relationship}
                    {m.accessLevel && m.accessLevel !== 'owner' ? ` · 授权 ${m.accessLevel}` : ''}
                  </Text>
                </Text>
                {m.id === currentMemberId ? (
                  <Badge tone='green'>当前成员</Badge>
                ) : (
                  <Text className='tx-md tx-green'>切换</Text>
                )}
              </View>
            ))}
          </View>
        )}
        <View style={{ marginTop: '16rpx' }}>
          <MenuRow label='成员管理' desc='添加 / 编辑成员与各自的关怀设置' url='/pages/members/index' />
        </View>
      </Card>

      <Card title='关怀模式'>
        <View className='row-between'>
          <View className='col grow' style={{ gap: '4rpx', marginRight: '16rpx' }}>
            <Text className='tx-md'>{current ? `为「${current.displayName}」开启大字版` : '大字版关怀模式'}</Text>
            <Text className='tx-sm tx-sub'>
              字号放大、按钮加大、对比度提高（成员级设置，各成员独立）。在成员管理里也可为每位成员分别设置提醒周期等选项。
            </Text>
          </View>
          <Switch
            checked={!!care?.careMode}
            disabled={!care || !currentMemberId || !canConfig}
            color={themeSwitchColor(themeId)}
            onChange={(e) => void toggleCare(e.detail.value)}
          />
        </View>
      </Card>

      <Card>
        <MenuRow label='照护授权' desc='把成员托付给家人照护，或接受他人的照护邀请' url='/pages/authorizations/index' />
        <MenuRow
          label='消息中心'
          desc='站内通知与提醒偏好'
          url='/pages/notifications/index'
          badge={unread > 0 ? String(unread) : undefined}
        />
        {account.hasWechat ? (
          <View className='menu-row'>
            <View className='col' style={{ gap: '4rpx' }}>
              <Text className='tx-md tx-strong'>微信登录</Text>
              <Text className='tx-sm tx-sub'>已绑定微信，可用微信一键登录本账号</Text>
            </View>
            <Badge tone='green'>已绑定</Badge>
          </View>
        ) : (
          <View className='menu-row' onClick={() => void bindWechat()}>
            <View className='col' style={{ gap: '4rpx' }}>
              <Text className='tx-md tx-strong'>绑定微信</Text>
              <Text className='tx-sm tx-sub'>绑定后可用微信一键登录本账号</Text>
            </View>
            <Text className='pick-arrow'>›</Text>
          </View>
        )}
        <MenuRow label='扫码登录网页版' desc='扫描网页版二维码，确认以本账号登录' url='/pages/scan-login/index' />
        <MenuRow label='设置' desc='账号资料、登录会话、消息订阅与注销说明' url='/pages/settings/index' last />
      </Card>

      <Text className='tx-sm tx-sub' style={{ textAlign: 'center' }}>
        药准时 MedOnTime · 提醒按成员本地时区生成，照护代操作全程双记录。
      </Text>
    </PageShell>
  );
}

function MenuRow({
  label,
  desc,
  url,
  badge,
  last,
}: {
  label: string;
  desc?: string;
  url: string;
  badge?: string;
  last?: boolean;
}) {
  return (
    <View className={`menu-row${last ? ' menu-row-last' : ''}`} onClick={() => Taro.navigateTo({ url })}>
      <View className='col' style={{ gap: '4rpx' }}>
        <Text className='tx-md tx-strong'>{label}</Text>
        {desc && <Text className='tx-sm tx-sub'>{desc}</Text>}
      </View>
      <View className='row' style={{ gap: '10rpx' }}>
        {badge && (
          <View
            style={{
              background: 'var(--color-status-danger)',
              color: 'var(--color-background-surface)',
              borderRadius: '999rpx',
              padding: '2rpx 14rpx',
            }}
          >
            <Text style={{ fontSize: '24rpx', color: 'var(--color-background-surface)' }}>{badge}</Text>
          </View>
        )}
        <Text className='pick-arrow'>›</Text>
      </View>
    </View>
  );
}
