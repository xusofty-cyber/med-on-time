import { EyeInvisibleOutlined, EyeOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { message, theme as antdTheme } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { adminLogin } from '../../api/admin';
import { ApiError } from '../../services/request';
import { isLoggedIn, saveSession } from '../../services/session';
import { ADMIN_THEMES, useAdminTheme } from '../../theme';

interface LoginValues {
  username: string;
  password: string;
}

/** 管理员登录（POST /admin/auth/login，token 主体为 admin） */
export default function LoginPage() {
  /* 阶段 2：登录渐变跟随主题（ADMIN_THEMES[].loginGradient），卡片底读 token。 */
  const { token } = antdTheme.useToken();
  const { themeId } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const rawFrom = (location.state as { from?: string } | null)?.from;
  const from = rawFrom && /^\/(?!\/|login)/.test(rawFrom) ? rawFrom : '/dashboard';

  if (isLoggedIn()) {
    return <Navigate to="/dashboard" replace />;
  }

  const onFinish = async (values: LoginValues): Promise<boolean> => {
    try {
      const result = await adminLogin(values.username, values.password);
      saveSession(result.accessToken, result.refreshToken, result.admin);
      message.success(`欢迎回来，${result.admin.realName}`);
      navigate(from, { replace: true });
      return true;
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '登录失败，请稍后重试');
      return false;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${ADMIN_THEMES[themeId].loginGradient[0]} 0%, ${ADMIN_THEMES[themeId].loginGradient[1]} 100%)`,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '100%',
          background: token.colorBgContainer,
          /* 2026-10-25 修复：卡片圆角/阴影原为写死的 12px/强阴影，主题 B 应为直角无阴影；
           * 改读 token（圆角 12/12/0）与主题定义的登录卡片阴影。 */
          borderRadius: token.borderRadius,
          padding: '12px 8px',
          boxShadow: ADMIN_THEMES[themeId].loginCardShadow,
        }}
      >
        <LoginForm<LoginValues>
          title="药准时 MedOnTime"
          subTitle="后台管理平台 · 仅限授权管理员"
          onFinish={onFinish}
          submitter={{ searchConfig: { submitText: '登录' } }}
        >
          <ProFormText
            name="username"
            label="管理员账号"
            fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
            rules={[{ required: true, message: '请输入管理员账号' }]}
          />
          <ProFormText.Password
            name="password"
            label="密码"
            fieldProps={{
              size: 'large',
              prefix: <LockOutlined />,
              /* 2026-10-25 修复：浏览器验证发现默认 eye 图标是 span，Tab 键跳过、
               * 键盘用户无法切换密码可见性。iconRender 改为原生 button（antd 会
               * 给它补 onClick 切换可见性）：原生 button 可 Tab 到达，Enter/Space
               * 触发 click 即切换；aria-label 供读屏。 */
              iconRender: (visible) => (
                <button
                  type="button"
                  className="pwd-eye-btn"
                  aria-label={visible ? '隐藏密码' : '显示密码'}
                  title={visible ? '隐藏密码' : '显示密码'}
                  onKeyPress={(e) => {
                    /* 2026-10-25 修复：ProForm 默认 Enter 提交表单（BaseForm onKeyPress），
                     * eye 按钮上按 Enter 会同时切换可见性与提交表单、触发空字段校验；
                     * 此处阻止 keypress 冒泡到 Form，Enter 只切换可见性。Space 不走
                     * Enter 分支，不受影响；按钮本身的 Enter 点击默认行为仍生效。 */
                    if (e.key === 'Enter') e.stopPropagation();
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: 'inherit',
                  }}
                >
                  {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                </button>
              ),
            }}
            rules={[{ required: true, message: '请输入密码' }]}
          />
        </LoginForm>
      </div>
    </div>
  );
}
