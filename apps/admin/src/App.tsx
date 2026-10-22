import { Card, Layout, Menu, Typography } from 'antd';

const { Header, Sider, Content } = Layout;

/**
 * 后台管理平台脚手架首页。页面与权限口径以后台需求 V1.5 为准，
 * 数据经 @med-on-time/api-client（OpenAPI 生成）调用 services/api。
 */
export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={220}>
        <div style={{ padding: '16px', fontWeight: 600, color: '#0B6B4F' }}>
          药准时 · 后台管理
        </div>
        <Menu
          mode="inline"
          defaultSelectedKeys={['dashboard']}
          items={[
            { key: 'dashboard', label: '运营看板' },
            { key: 'users', label: '账号与成员' },
            { key: 'drugs', label: '药品主数据' },
            { key: 'content', label: '内容与模板' },
            { key: 'ai', label: 'AI 管理' },
            { key: 'system', label: '系统与审计' },
          ]}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', paddingInline: 24 }}>
          <Typography.Text strong>运营看板</Typography.Text>
        </Header>
        <Content style={{ padding: 24 }}>
          <Card>
            脚手架已就绪：设计定稿（需求 V1.8 / 后台 V1.5 / 数据库 V1.2 / 架构 V1.5
            已冻结）已落为代码骨架，业务页面按模块迭代接入。
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
