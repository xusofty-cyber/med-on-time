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

/**
 * 后台管理平台路由。
 * 页面与 docs/dev/API_CONTRACT.md「后台接口」一一对应；/login 在布局外，
 * 其余页面经 RequireAuth 守卫（无 admin token 跳登录）。
 */
export default function App() {
  return (
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
  );
}
