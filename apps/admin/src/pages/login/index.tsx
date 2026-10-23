import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminLogin } from '../../api/admin';
import { ApiError } from '../../services/request';
import { saveSession } from '../../services/session';

interface LoginValues {
  username: string;
  password: string;
}

/** 管理员登录（POST /admin/auth/login，token 主体为 admin） */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

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
        background: 'linear-gradient(135deg, #0B6B4F 0%, #084c38 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: 12,
          padding: '12px 8px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
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
            fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
            rules={[{ required: true, message: '请输入密码' }]}
          />
        </LoginForm>
      </div>
    </div>
  );
}
