import {
  BellOutlined,
  CustomerServiceOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, Card, Col, Progress, Row, Spin, Statistic, theme as antdTheme } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../../api/admin';
import type { DashboardData } from '../../api/types';
import { ApiError } from '../../services/request';
import { fmtRate } from '../../utils/format';

/** 仪表盘（GET /admin/dashboard）：注册/活跃/成员/提醒投递/待核验药品计数卡 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* 阶段 2：色值一律读 AntD token（主题 0 取值与改前一致，#CF1322 已按红两级
   * 定案归并为 colorError #DC2626，#D46B08 沿用为 colorWarning）。 */
  const { token } = antdTheme.useToken();

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : '仪表盘数据加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageContainer title="仪表盘" subTitle="平台运营总览（数据来自 /admin/dashboard）">
      {error && (
        <Alert type="error" showIcon message="加载失败" description={error} style={{ marginBottom: 16 }} />
      )}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="注册账号总数"
                value={data?.accounts.total ?? 0}
                prefix={<UserOutlined style={{ color: token.colorPrimary }} />}
                suffix={
                  <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                    今日新增 {data?.accounts.newToday ?? 0}
                  </span>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="活跃账号 / 冻结账号"
                value={data?.accounts.active ?? 0}
                prefix={<UserOutlined style={{ color: token.colorPrimary }} />}
                suffix={
                  <span style={{ fontSize: 13, color: token.colorError }}>
                    冻结 {data?.accounts.frozen ?? 0}
                  </span>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="成员总数"
                value={data?.members.total ?? 0}
                prefix={<TeamOutlined style={{ color: token.colorPrimary }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable>
              <Link to="/drugs?reviewStatus=pending_review">
                <Statistic
                  title="待核验药品"
                  value={data?.drugs.pendingReview ?? 0}
                  prefix={<MedicineBoxOutlined style={{ color: token.colorWarning }} />}
                  valueStyle={{ color: (data?.drugs.pendingReview ?? 0) > 0 ? token.colorWarning : undefined }}
                  suffix={
                    <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                      药品库共 {data?.drugs.total ?? 0}
                    </span>
                  }
                />
              </Link>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="今日提醒投递" extra={<BellOutlined style={{ color: token.colorPrimary }} />}>
              <Row gutter={16} align="middle">
                <Col span={8}>
                  <Statistic title="已投递" value={data?.reminders.deliveredToday ?? 0} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="投递失败"
                    value={data?.reminders.failedToday ?? 0}
                    valueStyle={{ color: (data?.reminders.failedToday ?? 0) > 0 ? token.colorError : undefined }}
                  />
                </Col>
                <Col span={8}>
                  <div style={{ color: token.colorTextSecondary, fontSize: 14, marginBottom: 4 }}>投递成功率</div>
                  <Progress
                    percent={Math.round((data?.reminders.deliveryRateToday ?? 0) * 1000) / 10}
                    format={() => fmtRate(data?.reminders.deliveryRateToday)}
                    strokeColor={token.colorPrimary}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="待处理事项" extra={<CustomerServiceOutlined style={{ color: token.colorPrimary }} />}>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="待裁决纠纷"
                    value={data?.disputes?.pending ?? 0}
                    valueStyle={{ color: (data?.disputes?.pending ?? 0) > 0 ? token.colorWarning : undefined }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic title="注销冷静期账号" value={data?.accounts.cancelling ?? 0} />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Spin>
    </PageContainer>
  );
}
