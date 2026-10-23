import { useCallback, useEffect, useRef, useState } from 'react';
import Taro, { usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { notificationApi } from '../../lib/endpoints';
import { toastError } from '../../lib/api';
import { actions } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { requestReminderSubscribe } from '../../lib/notify';
import { fmtDateTime } from '../../lib/time';
import type { NotificationItem, NotificationPrefs } from '../../lib/types';
import { Btn, Card, EmptyState, ErrorLine, Loading, SwitchRow } from '../../components/ui';

/** 消息中心：提醒偏好（站内/短信自选/微信占位）+ 站内通知列表（分页、点开即已读）。 */
export default function Notifications() {
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
      await requestReminderSubscribe();
    }
    await savePrefs({ ...prefs, wechat: on });
  };

  const openItem = async (n: NotificationItem) => {
    if (!n.isRead) {
      try {
        await notificationApi.markRead(n.id);
        setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        const page = await notificationApi.list(1);
        actions.setUnreadCount(page.items.filter((x) => !x.isRead).length);
      } catch {
        /* 已读回写失败不阻塞阅读 */
      }
    }
    await Taro.showModal({ title: n.title, content: n.content, showCancel: false, confirmText: '知道了' });
  };

  return (
    <View className='pg'>
      <Text className='tx-title'>消息中心</Text>
      <Card title='提醒偏好'>
        {prefs === null ? (
          <Loading />
        ) : (
          <View className='col'>
            <SwitchRow
              label='站内消息'
              desc='应用内通知中心与角标'
              checked={prefs.inApp}
              onChange={(v) => void savePrefs({ ...prefs, inApp: v })}
            />
            <SwitchRow
              label='短信提醒'
              desc='用户自选开启（MVP 常规渠道）；未打卡的到点提醒可经短信送达'
              checked={prefs.sms}
              onChange={(v) => void savePrefs({ ...prefs, sms: v })}
            />
            <SwitchRow
              label='微信订阅消息'
              desc='开启时将拉起订阅授权；模板配置完成前为占位通道'
              checked={prefs.wechat}
              onChange={(v) => void toggleWechat(v)}
            />
          </View>
        )}
      </Card>
      <ErrorLine error={error} />
      <Card title='站内通知'>
        {items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState text='暂无通知。新的服药提醒与照护动态会显示在这里。' />
        ) : (
          <View className='col'>
            {items.map((n, i) => (
              <View
                key={n.id}
                onClick={() => void openItem(n)}
                style={{
                  padding: '20rpx 4rpx',
                  borderBottom: i < items.length - 1 ? '1rpx solid #EEF1EF' : 'none',
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
                  加载更多
                </Btn>
              </View>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}
