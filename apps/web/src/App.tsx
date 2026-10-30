import { Component, useEffect, useState, type ReactNode } from 'react';
import Layout from './components/Layout';
import { Button, Card, EmptyState, Toasts } from './components/ui';
import Login from './pages/Login';
import ScanLogin from './pages/ScanLogin';
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
import { tokenStore, setSessionExpiredHandler, ApiError } from './lib/api';
import { authApi, memberApi } from './lib/endpoints';
import { actions, applyCareMode, useApp } from './lib/store';
import { PUBLIC_ROUTES, navigate, useRoute } from './lib/router';

/**
 * Web 用户门户（需求 V1.8 / UI V1.0）：
 * 路由 /login /register /（今日提醒）/members /plans /adherence /stock /ehr
 *      /authorizations /notifications /settings（hash 路由，零新增依赖）。
 * 会话：token 存 localStorage，401 由请求层刷新；成员切换驱动关怀模式与全部成员域页面。
 */
/**
 * 页面级错误边界（兜底）：单个页面渲染异常时只降级当前页并给出返回入口，
 * 不再整树卸载白屏（2026-10-23 白屏事故后加固；按 route key 重挂载自动复位）。
 */
class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[PageBoundary]', error);
  }
  render() {
    if (this.state.error) {
      return (
        <Card>
          <EmptyState text="这个页面出了点问题，您的其它数据不受影响。可以先返回今日提醒，或稍后刷新重试。" />
          <div className="mt-4">
            <Button
              onClick={() => {
                this.setState({ error: null });
                navigate('/');
              }}
            >
              返回今日提醒
            </Button>
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}

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
      if (tokenStore.access || tokenStore.refresh) {
        try {
          const me = await authApi.me();
          actions.setAccount(me);
          try {
            actions.setMembers(await memberApi.list());
          } catch {
            actions.toast('error', '成员列表加载失败，请稍后刷新重试');
          }
        } catch (err) {
          if (err instanceof ApiError && (err.httpStatus === 401 || err.code === 40100)) {
            tokenStore.clear();
            actions.resetSession();
          }
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
        {route.name === 'register' ? <Register /> : route.name === 'scan-login' ? <ScanLogin /> : <Login />}
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
      <Layout routeName={route.name}>
        <PageBoundary key={route.name}>{page}</PageBoundary>
      </Layout>
    </>
  );
}
