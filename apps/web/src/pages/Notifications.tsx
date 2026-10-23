import { useCallback, useEffect, useState } from 'react';
import { notificationApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/time';
import type { NotificationItem, NotificationPrefs } from '../lib/types';

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const page = await notificationApi.list(1);
      setItems(page.items);
      actions.setUnreadCount(page.items.filter((n) => !n.isRead && !n.readAt).length);
    } catch (e) {
      setError(e);
    }
    try {
      setPrefs(await notificationApi.getPrefs());
    } catch {
      setPrefs({ inApp: true, sms: false, wechat: false });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const read = async (item: NotificationItem) => {
    if (item.isRead || item.readAt) return;
    try {
      await notificationApi.markRead(item.id);
      setItems((list) => (list ?? []).map((n) => (n.id === item.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
    } catch {
      /* 已读标记失败不打扰阅读 */
    }
  };

  const readAll = async () => {
    const unread = (items ?? []).filter((n) => !n.isRead && !n.readAt);
    for (const n of unread) await read(n);
    actions.setUnreadCount(0);
    actions.toast('success', '已全部标为已读');
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    setPrefs(next);
    try {
      const saved = await notificationApi.putPrefs(next);
      setPrefs(saved);
      actions.toast('success', '通知偏好已保存');
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '保存失败');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-medgreen-dark">消息中心</h1>
        <Button variant="soft" onClick={readAll}>
          全部已读
        </Button>
      </div>
      <ErrorText error={error} />

      <Card title="通知渠道偏好">
        {prefs === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-4">
            <PrefRow
              title="站内通知"
              desc="始终开启，消息中心与今日页横幅都会显示"
              checked={true}
              disabled
              onChange={() => undefined}
            />
            <PrefRow
              title="短信提醒"
              desc="用户自选开启：重要提醒（漏服、库存不足等）额外发短信到注册手机号"
              checked={prefs.sms}
              onChange={(v) => updatePrefs({ ...prefs, sms: v })}
            />
            <PrefRow
              title="微信提醒"
              desc="尚未开通，后续版本接入微信订阅消息"
              checked={false}
              disabled
              onChange={() => undefined}
            />
          </div>
        )}
      </Card>

      <Card title="站内通知">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="暂无通知。" />
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {items.map((n) => {
              const unread = !n.isRead && !n.readAt;
              return (
                <li key={n.id}>
                  <button className="w-full px-1 py-3 text-left" onClick={() => read(n)}>
                    <span className="flex items-center gap-2">
                      <span className={`font-medium ${unread ? 'text-medgreen-dark' : 'text-neutral-700'}`}>{n.title}</span>
                      {unread && <Badge tone="red">未读</Badge>}
                      <span className="ml-auto text-sm text-neutral-400">{fmtDateTime(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-neutral-600">{n.content}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PrefRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-neutral-500">{desc}</span>
      </span>
      <input
        type="checkbox"
        className="h-6 w-6 accent-[#0B6B4F]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
