import { useCallback, useEffect, useState } from 'react';
import { notificationApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorText, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/time';
import { tr, useT } from '../lib/i18n';
import type { NotificationItem, NotificationPrefs } from '../lib/types';

export default function Notifications() {
  const tr = useT();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 30;
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (targetPage = page) => {
    try {
      const res = await notificationApi.list(targetPage, pageSize);
      setItems(res.items);
      setTotal(res.total);
      const count =
        typeof res.unreadCount === 'number'
          ? res.unreadCount
          : res.items.filter((n) => !n.isRead && !n.readAt).length;
      actions.setUnreadCount(count);
    } catch (e) {
      setError(e);
    }
    try {
      setPrefs(await notificationApi.getPrefs());
    } catch {
      setPrefs({ inApp: true, sms: false, wechat: false });
    }
  }, [page]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const read = async (item: NotificationItem) => {
    if (item.isRead || item.readAt) return;
    try {
      await notificationApi.markRead(item.id);
      setItems((list) => {
        const next = (list ?? []).map((n) => (n.id === item.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n));
        actions.setUnreadCount(next.filter((n) => !n.isRead && !n.readAt).length);
        return next;
      });
    } catch {
      /* 已读标记失败不打扰阅读 */
    }
  };

  const readAll = async () => {
    const unread = (items ?? []).filter((n) => !n.isRead && !n.readAt);
    await Promise.all(unread.map(read));
    actions.setUnreadCount(0);
    actions.toast('success', tr('notif.readAllToast'));
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    setPrefs(next);
    try {
      const saved = await notificationApi.putPrefs(next);
      setPrefs(saved);
      actions.toast('success', tr('notif.prefsSavedToast'));
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('ehr.saveFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-medgreen-dark">{tr('notif.title')}</h1>
        <Button variant="soft" onClick={readAll}>
          {tr('notif.readAllBtn')}
        </Button>
      </div>
      <ErrorText error={error} />

      <Card title={tr('notif.prefsCard')}>
        {prefs === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-4">
            <PrefRow
              title={tr('notif.inApp')}
              desc={tr('notif.inAppDesc')}
              checked={true}
              disabled
              onChange={() => undefined}
            />
            <PrefRow
              title={tr('notif.sms')}
              desc={tr('notif.smsDesc')}
              checked={prefs.sms}
              onChange={(v) => updatePrefs({ ...prefs, sms: v })}
            />
            <PrefRow
              title={tr('notif.wechat')}
              desc={tr('notif.wechatDesc')}
              checked={false}
              disabled
              onChange={() => undefined}
            />
          </div>
        )}
      </Card>

      <Card title={tr('notif.inApp')}>
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text={tr('notif.empty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {items.map((n) => {
              const unread = !n.isRead && !n.readAt;
              return (
                <li key={n.id}>
                  <button className="w-full px-1 py-3 text-left" onClick={() => read(n)}>
                    <span className="flex items-center gap-2">
                      <span className={`font-medium ${unread ? 'text-medgreen-dark' : 'text-neutral-700'}`}>{n.title}</span>
                      {unread && <Badge tone="red">{tr('notif.unreadBadge')}</Badge>}
                      <span className="ml-auto text-sm text-neutral-400">{fmtDateTime(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-neutral-600">{n.content}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm text-neutral-600">
            <span>
              {tr('notif.pageInfo', { page, pages: Math.ceil(total / pageSize), total })}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {tr('notif.prevPage')}
              </Button>
              <Button
                variant="ghost"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {tr('notif.nextPage')}
              </Button>
            </div>
          </div>
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
        className="h-6 w-6 accent-[var(--color-brand-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
