import { useCallback } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { Switch, Text, View } from '@tarojs/components';
import { accountApi, authApi, memberApi, notificationApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { themeSwitchColor } from '../../lib/theme';
import { useSessionGuard } from '../../lib/hooks';
import { accountStatusLabels, relationshipLabels } from '../../lib/dict';
import { Badge, Card, Loading, PageShell } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';

/**
 * 我的（tab）：账号概览、成员切换与管理入口、关怀模式开关（成员级）、
 * 照护授权 / 消息中心 / 设置入口（含注销说明，落在设置页）。
 */
export default function Me() {
  const t = useT();
  useNavTitle('nav.me');
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
      if (!res.code) throw new Error(tr('auth.wxNoCode'));
      const r = await authApi.wechatBind(res.code);
      toastOk(r.message ?? tr('me.bindOkFallback'));
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

  if (!booted) return <Loading text={t('flow.restoring')} />;
  if (!account) return <Loading text={t('flow.toLogin')} />;

  return (
    <PageShell>
      <Card>
        <View className='row-between'>
          <View className='col' style={{ gap: '6rpx' }}>
            <Text className='tx-title'>{account.nickname}</Text>
            <Text className='tx-md tx-sub'>{account.phoneMasked ?? ''}</Text>
          </View>
          <Badge tone={account.status === 'cancelling' ? 'amber' : 'green'}>
            {accountStatusLabels()[account.status] ?? account.status}
          </Badge>
        </View>
        {account.status === 'cancelling' && (
          <Text className='tx-sm' style={{ color: 'var(--color-status-warning-text)', display: 'block', marginTop: '10rpx' }}>
            {t('me.cancellingNote')}
          </Text>
        )}
      </Card>

      <Card title={t('me.currentMember')}>
        {members.length === 0 ? (
          <Text className='tx-md tx-sub'>{t('me.noMembers')}</Text>
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
                    {relationshipLabels()[m.relationship] ?? m.relationship}
                    {m.accessLevel && m.accessLevel !== 'owner' ? t('me.authSuffix', { level: m.accessLevel }) : ''}
                  </Text>
                </Text>
                {m.id === currentMemberId ? (
                  <Badge tone='green'>{t('me.currentMember')}</Badge>
                ) : (
                  <Text className='tx-md tx-green'>{t('me.switch')}</Text>
                )}
              </View>
            ))}
          </View>
        )}
        <View style={{ marginTop: '16rpx' }}>
          <MenuRow label={t('me.membersRow')} desc={t('me.membersRowDesc')} url='/pages/members/index' />
        </View>
      </Card>

      <Card title={t('me.careCard')}>
        <View className='row-between'>
          <View className='col grow' style={{ gap: '4rpx', marginRight: '16rpx' }}>
            <Text className='tx-md'>{current ? t('me.careOn', { name: current.displayName }) : t('me.careOnFallback')}</Text>
            <Text className='tx-sm tx-sub'>
              {t('me.careDesc')}
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
        <MenuRow label={t('authz.title')} desc={t('me.authzDesc')} url='/pages/authorizations/index' />
        <MenuRow
          label={t('nt.title')}
          desc={t('me.notifDesc')}
          url='/pages/notifications/index'
          badge={unread > 0 ? String(unread) : undefined}
        />
        {account.hasWechat ? (
          <View className='menu-row'>
            <View className='col' style={{ gap: '4rpx' }}>
              <Text className='tx-md tx-strong'>{t('me.wxLogin')}</Text>
              <Text className='tx-sm tx-sub'>{t('me.wxBoundDesc')}</Text>
            </View>
            <Badge tone='green'>{t('me.bound')}</Badge>
          </View>
        ) : (
          <View className='menu-row' onClick={() => void bindWechat()}>
            <View className='col' style={{ gap: '4rpx' }}>
              <Text className='tx-md tx-strong'>{t('me.wxBind')}</Text>
              <Text className='tx-sm tx-sub'>{t('me.wxBindDesc')}</Text>
            </View>
            <Text className='pick-arrow'>›</Text>
          </View>
        )}
        <MenuRow label={t('me.scanRow')} desc={t('me.scanDesc')} url='/pages/scan-login/index' />
        <MenuRow label={t('nav.settings')} desc={t('me.settingsDesc')} url='/pages/settings/index' last />
      </Card>

      <Text className='tx-sm tx-sub' style={{ textAlign: 'center' }}>
        {t('me.footer')}
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
