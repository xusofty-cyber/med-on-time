import {
  AuditOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  RobotOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ProLayout } from '@ant-design/pro-components';
import { Dropdown, Select } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getAdminProfile } from '../services/session';
import { ADMIN_THEMES, themes, useAdminTheme } from '../theme';
import { LOCALES, getLocale, setLocaleState, useT, type Locale } from '../i18n';

const MENU_DEFS = [
  { path: '/dashboard', nameKey: 'nav.dashboard', icon: <DashboardOutlined /> },
  { path: '/accounts', nameKey: 'nav.accounts', icon: <UserOutlined /> },
  { path: '/members', nameKey: 'nav.members', icon: <TeamOutlined /> },
  { path: '/drugs', nameKey: 'nav.drugs', icon: <MedicineBoxOutlined /> },
  { path: '/plans', nameKey: 'nav.plans', icon: <ScheduleOutlined /> },
  { path: '/content', nameKey: 'nav.content', icon: <FileTextOutlined /> },
  { path: '/disputes', nameKey: 'nav.disputes', icon: <CustomerServiceOutlined /> },
  { path: '/audit', nameKey: 'nav.audit', icon: <AuditOutlined /> },
  { path: '/system/app-versions', nameKey: 'nav.appVersions', icon: <SettingOutlined /> },
  { path: '/system/ai-providers', nameKey: 'nav.aiProviders', icon: <RobotOutlined /> },
] as const;

/** 全局布局：ProLayout 侧边菜单 + 顶栏管理员信息/退出 */
export default function AdminLayout() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const profile = getAdminProfile();
  const { themeId, setThemeId } = useAdminTheme();

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <ProLayout
      title={t('nav.appTitle')}
      logo={false}
      layout="mix"
      fixSiderbar
      fixedHeader
      siderWidth={216}
      location={{ pathname: location.pathname }}
      route={{ path: '/', routes: MENU_DEFS.map((m) => ({ path: m.path, name: t(m.nameKey), icon: m.icon })) }}
      menuItemRender={(item, dom) => <Link to={item.path ?? '/dashboard'}>{dom}</Link>}
      token={ADMIN_THEMES[themeId].proLayoutToken}
      /* 主题切换入口（阶段 2）：顶栏选择器，三套主题即时切换、localStorage 持久化。 */
      actionsRender={() => [
        <Select
          key="theme"
          value={themeId}
          onChange={setThemeId}
          style={{ width: 212 }}
          aria-label={t('nav.themeAria')}
          options={themes().map((th) => ({
            value: th.id,
            label: th.id === 'a' ? t('nav.themeWithDesc', { label: th.label, desc: th.description }) : th.label,
          }))}
        />,
        <Select
          key="locale"
          value={getLocale()}
          onChange={(v) => setLocaleState(v as Locale)}
          style={{ width: 130 }}
          aria-label={t('common.language')}
          options={LOCALES.map((l) => ({ value: l.value, label: t(l.labelKey) }))}
        />,
      ]}
      avatarProps={{
        icon: <UserOutlined />,
        size: 'small',
        title: profile ? t('nav.profileTitle', { name: profile.realName, username: profile.username }) : t('nav.admin'),
        render: (_props, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  label: profile
                    ? t('nav.roleLabel', {
                        roles: profile.roles?.length
                          ? profile.roles.join(t('nav.roleSeparator'))
                          : t('nav.admin'),
                      })
                    : t('nav.admin'),
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: t('nav.logout'),
                  onClick: logout,
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
    >
      <Outlet />
    </ProLayout>
  );
}
