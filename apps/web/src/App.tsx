import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import { Toasts } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import Today from './pages/Today';
import Members from './pages/Members';
import Plans from './pages/Plans';
import Adherence from './pages/Adherence';
import Stock from './pages/Stock';
import Ehr from './pages/Ehr';
import Authorizations from './pages/Authorizations';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import { tokenStore, setSessionExpiredHandler } from './lib/api';
import { authApi, memberApi } from './lib/endpoints';
import { actions, applyCareMode, useApp } from './lib/store';
import { PUBLIC_ROUTES, navigate, useRoute } from './lib/router';

/**
 * Web 用户门户（需求 V1.8 / UI V1.0）：
 * 路由 /login /register /（今日提醒）/members /plans /adherence /stock /ehr
 *      /authorizations /notifications /settings（hash 路由，零新增依赖）。
 * 会话：token 存 localStorage，401 由请求层刷新；成员切换驱动关怀模式与全部成员域页面。
 */
export default function App() {
  const route = useRoute();
  const account = useApp((s) => s.account);
  const currentMemberId = useApp((s) => s.currentMemberId);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      actions.resetSession();
      navigate('/login');
    });
    applyCareMode();
    (async () => {
      if (tokenStore.access) {
        try {
          const me = await authApi.me();
          actions.setAccount(me);
          actions.setMembers(await memberApi.list());
        } catch {
          tokenStore.clear();
          actions.resetSession();
        }
      }
      setBooted(true);
    })();
  }, []);

  /* 当前成员变化时装载其关怀/提醒设置并切换 data-care-mode */
  useEffect(() => {
    if (!account || !currentMemberId) return;
    let alive = true;
    memberApi
      .getCareSettings(currentMemberId)
      .then((s) => {
        if (alive) actions.setCareSettings(s);
      })
      .catch(() => {
        if (alive) actions.setCareSettings(null);
      });
    return () => {
      alive = false;
    };
  }, [account, currentMemberId]);

  const isPublic = PUBLIC_ROUTES.has(route.name);

  useEffect(() => {
    if (!booted) return;
    if (!account && !isPublic) navigate('/login');
    if (account && isPublic) navigate('/');
  }, [booted, account, isPublic, route.name]);

  if (!booted) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="spinner" aria-label="加载中" />
      </main>
    );
  }

  if (!account || isPublic) {
    return (
      <>
        <Toasts />
        {route.name === 'register' ? <Register /> : <Login />}
      </>
    );
  }

  const page = (() => {
    switch (route.name) {
      case 'members':
        return <Members />;
      case 'plans':
        return <Plans />;
      case 'adherence':
        return <Adherence />;
      case 'stock':
        return <Stock />;
      case 'ehr':
        return <Ehr />;
      case 'authorizations':
        return <Authorizations />;
      case 'notifications':
        return <Notifications />;
      case 'settings':
        return <Settings />;
      default:
        return <Today />;
    }
  })();

  return (
    <>
      <Toasts />
      <Layout routeName={route.name}>{page}</Layout>
    </>
  );
}
