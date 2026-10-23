import { ReactNode, useEffect } from 'react';
import { actions, useApp } from '../lib/store';
import { navigate } from '../lib/router';
import { tokenStore } from '../lib/api';
import { authApi, notificationApi } from '../lib/endpoints';
import { RELATIONSHIP_LABELS } from '../lib/dict';

const NAV = [
  { path: '/', name: 'today', label: '今日提醒', icon: '💊' },
  { path: '/members', name: 'members', label: '成员', icon: '👪' },
  { path: '/plans', name: 'plans', label: '用药计划', icon: '📋' },
  { path: '/adherence', name: 'adherence', label: '依从统计', icon: '📈' },
  { path: '/stock', name: 'stock', label: '库存', icon: '🗄️' },
  { path: '/ehr', name: 'ehr', label: '健康档案', icon: '🩺' },
  { path: '/authorizations', name: 'authorizations', label: '照护授权', icon: '🤝' },
  { path: '/settings', name: 'settings', label: '设置', icon: '⚙️' },
];

export default function Layout({ routeName, children }: { routeName: string; children: ReactNode }) {
  const account = useApp((s) => s.account);
  const members = useApp((s) => s.members);
  const currentMemberId = useApp((s) => s.currentMemberId);
  const unread = useApp((s) => s.unreadCount);

  useEffect(() => {
    let alive = true;
    const load = () =>
      notificationApi
        .list(1)
        .then((r) => {
          if (alive) actions.setUnreadCount(r.items.filter((n) => !n.isRead && !n.readAt).length);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* 退出以本地清会话为准 */
    }
    tokenStore.clear();
    actions.resetSession();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#f4f8f6]">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <button className="text-xl font-bold text-medgreen" onClick={() => navigate('/')}>
            药准时
          </button>
          <div className="ml-2 flex items-center gap-2">
            <label className="sr-only" htmlFor="member-switch">
              当前成员
            </label>
            <select
              id="member-switch"
              className="input max-w-[220px]"
              value={currentMemberId ?? ''}
              onChange={(e) => actions.setCurrentMember(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}（{RELATIONSHIP_LABELS[m.relationship] ?? m.relationship}
                  {m.accessLevel && m.accessLevel !== 'owner' ? ` · ${m.accessLevel}` : ''}）
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button className="btn-icon relative" aria-label="消息中心" onClick={() => navigate('/notifications')}>
              🔔
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            <span className="hidden text-neutral-600 sm:block">{account?.nickname ?? ''}</span>
            <button className="btn btn-ghost" onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5">
        <nav className="sticky top-[72px] hidden h-fit w-44 shrink-0 flex-col gap-1 md:flex" aria-label="主导航">
          {NAV.map((item) => (
            <button
              key={item.name}
              className={`nav-link text-left ${routeName === item.name ? 'nav-link-active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-neutral-200 bg-white md:hidden"
        aria-label="移动端导航"
      >
        {[
          NAV[0]!,
          NAV[2]!,
          NAV[3]!,
          NAV[5]!,
          NAV[7]!,
        ].map((item) => (
          <button
            key={item.name}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs ${
              routeName === item.name ? 'font-semibold text-medgreen-dark' : 'text-neutral-600'
            }`}
            onClick={() => navigate(item.path)}
          >
            <span className="text-lg" aria-hidden>
              {item.icon}
            </span>
            {item.label.replace('今日提醒', '今日').replace('依从统计', '统计').replace('健康档案', '档案')}
          </button>
        ))}
      </nav>
    </div>
  );
}
