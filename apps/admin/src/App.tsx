import { Component, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import AdminLayout from './layouts/AdminLayout';
import AccountsPage from './pages/accounts';
import AuditPage from './pages/audit';
import ContentPage from './pages/content';
import DashboardPage from './pages/dashboard';
import DisputesPage from './pages/disputes';
import DrugsPage from './pages/drugs';
import LoginPage from './pages/login';
import MembersPage from './pages/members';
import PlansPage from './pages/plans';
import AppVersionsPage from './pages/system';
import AiProvidersPage from './pages/ai-providers';

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[RootErrorBoundary]', error);
  }
  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面加载异常"
          subTitle={this.state.error.message || '发生了未预期的渲染错误'}
          extra={
            <Button
              type="primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.href = '/dashboard';
              }}
            >
              返回仪表盘
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}

/**
 * 后台管理平台路由。
 * 页面与 docs/dev/API_CONTRACT.md「后台接口」一一对应；/login 在布局外，
 * 其余页面经 RequireAuth 守卫（无 admin token 跳登录）。
 */
export default function App() {
  return (
    <RootErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/drugs" element={<DrugsPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/disputes" element={<DisputesPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/system/app-versions" element={<AppVersionsPage />} />
          <Route path="/system/ai-providers" element={<AiProvidersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </RootErrorBoundary>
  );
}
