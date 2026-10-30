import { useCallback, useEffect, useRef, useState } from 'react';
import Taro, { usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { notificationApi } from '../../lib/endpoints';
import { toastError } from '../../lib/api';
import { actions, getState } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { requestReminderSubscribe } from '../../lib/notify';
import { fmtDateTime } from '../../lib/time';
import type { NotificationItem, NotificationPrefs } from '../../lib/types';
import { Btn, Card, EmptyState, ErrorLine, Loading, PageShell, SwitchRow } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';

/** 消息中心：提醒偏好（站内/短信自选/微信占位）+ 站内通知列表（分页、点开即已读）。 */
export default function Notifications() {
  const t = useT();
  useNavTitle('nav.notifications');
  useSessionGuard();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const pageRef = useRef(1);
  const totalRef = useRef(0);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (page: number, replace: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await notificationApi.list(page);
      totalRef.current = res.total;
      pageRef.current = page;
      if (page === 1) {
        actions.setUnreadCount(res.unreadTotal ?? res.items.filter((x) => !x.isRead).length);
      }
      setItems((prev) => (replace || prev === null ? res.items : [...prev, ...res.items]));
      setError(null);
    } catch (e) {
      if (replace) setError(e);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    notificationApi
      .getPrefs()
      .then(setPrefs)
      .catch(() => setPrefs({ inApp: true, sms: false, wechat: false }));
    void loadPage(1, true);
  }, [loadPage]);

  usePullDownRefresh(() => {
    void loadPage(1, true).finally(() => Taro.stopPullDownRefresh());
  });

  useReachBottom(() => {
    if (items && items.length < totalRef.current) void loadPage(pageRef.current + 1, false);
  });

  const savePrefs = async (next: NotificationPrefs) => {
    setPrefs(next);
    try {
      const saved = await notificationApi.putPrefs(next);
      setPrefs(saved);
    } catch (e) {
      toastError(e);
      notificationApi.getPrefs().then(setPrefs).catch(() => undefined);
    }
  };

  const toggleWechat = async (on: boolean) => {
    if (!prefs) return;
    if (on) {
      /* 微信通道为占位：开启前先走订阅授权（模板未配置时给占位提示，见 lib/notify.ts） */
      const res = await requestReminderSubscribe();
      if (res !== 'ok') {
        setPrefs({ ...prefs, wechat: false });
        return;
      }
    }
    await savePrefs({ ...prefs, wechat: on });
  };

  const openItem = async (n: NotificationItem) => {
    if (!n.isRead) {
      try {
        await notificationApi.markRead(n.id);
        setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        actions.setUnreadCount(Math.max(0, getState().unreadCount - 1));
      } catch {
        /* 已读回写失败不阻塞阅读 */
      }
    }
    await Taro.showModal({ title: n.title, content: n.content, showCancel: false, confirmText: tr('notify.gotIt') });
  };

  return (
    <PageShell>
      <Text className='tx-title'>{t('nt.title')}</Text>
      <Card title={t('nt.prefs')}>
        {prefs === null ? (
          <Loading />
        ) : (
          <View className='col'>
            <SwitchRow
              label={t('nt.inApp')}
              desc={t('nt.inAppDesc')}
              checked={prefs.inApp}
              onChange={(v) => void savePrefs({ ...prefs, inApp: v })}
            />
            <SwitchRow
              label={t('nt.sms')}
              desc={t('nt.smsDesc')}
              checked={prefs.sms}
              onChange={(v) => void savePrefs({ ...prefs, sms: v })}
            />
            <SwitchRow
              label={t('nt.wechat')}
              desc={t('nt.wechatDesc')}
              checked={prefs.wechat}
              onChange={(v) => void toggleWechat(v)}
            />
          </View>
        )}
      </Card>
      <ErrorLine error={error} />
      <Card title={t('nt.list')}>
        {items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState text={t('nt.empty')} />
        ) : (
          <View className='col'>
            {items.map((n, i) => (
              <View
                key={n.id}
                onClick={() => void openItem(n)}
                style={{
                  padding: '20rpx 4rpx',
                  borderBottom: i < items.length - 1 ? '1rpx solid var(--color-background-muted)' : 'none',
                }}
              >
                <View className='row' style={{ gap: '10rpx' }}>
                  {!n.isRead && <View className='dot-red' />}
                  <Text className='tx-md tx-strong grow'>{n.title}</Text>
                  <Text className='tx-xs tx-sub'>{fmtDateTime(n.createdAt)}</Text>
                </View>
                <Text
                  className='tx-sm tx-sub'
                  style={{
                    display: 'block',
                    marginTop: '6rpx',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.content}
                </Text>
              </View>
            ))}
            {items.length < totalRef.current && (
              <View style={{ paddingTop: '12rpx' }}>
                <Btn variant='ghost' block onClick={() => void loadPage(pageRef.current + 1, false)}>
                  {t('nt.loadMore')}
                </Btn>
              </View>
            )}
          </View>
        )}
      </Card>
    </PageShell>
  );
}
