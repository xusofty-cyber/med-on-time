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
import { Dropdown } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getAdminProfile } from '../services/session';

const MENU_ROUTES = [
  { path: '/dashboard', name: '仪表盘', icon: <DashboardOutlined /> },
  { path: '/accounts', name: '账号管理', icon: <UserOutlined /> },
  { path: '/members', name: '成员管理', icon: <TeamOutlined /> },
  { path: '/drugs', name: '药品库管理', icon: <MedicineBoxOutlined /> },
  { path: '/plans', name: '计划监管', icon: <ScheduleOutlined /> },
  { path: '/content', name: '内容管理', icon: <FileTextOutlined /> },
  { path: '/disputes', name: '客服裁决', icon: <CustomerServiceOutlined /> },
  { path: '/audit', name: '审计日志', icon: <AuditOutlined /> },
  { path: '/system/app-versions', name: '应用版本', icon: <SettingOutlined /> },
  { path: '/system/ai-providers', name: '大模型配置', icon: <RobotOutlined /> },
];

/** 全局布局：ProLayout 侧边菜单 + 顶栏管理员信息/退出 */
export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = getAdminProfile();

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <ProLayout
      title="药准时 · 后台管理"
      logo={false}
      layout="mix"
      fixSiderbar
      fixedHeader
      siderWidth={216}
      location={{ pathname: location.pathname }}
      route={{ path: '/', routes: MENU_ROUTES }}
      menuItemRender={(item, dom) => <Link to={item.path ?? '/dashboard'}>{dom}</Link>}
      token={{ header: { colorBgHeader: '#ffffff' }, sider: { colorBgMenuItemSelected: '#e6f4ef' } }}
      avatarProps={{
        icon: <UserOutlined />,
        size: 'small',
        title: profile ? `${profile.realName}（${profile.username}）` : '管理员',
        render: (_props, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  label: profile
                    ? `角色：${profile.roles?.length ? profile.roles.join('、') : '管理员'}`
                    : '管理员',
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
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
