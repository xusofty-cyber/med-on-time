import { HistoryOutlined, SearchOutlined } from '@ant-design/icons';
import { PageContainer, ProTable, type ProColumns } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Timeline,
  message,
  theme as antdTheme,
} from 'antd';
import { useState } from 'react';
import { getPlanHistory, listPlans } from '../../api/admin';
import type { PlanHistoryItem, PlanItemRow } from '../../api/types';
import {
  operatorTypeMeta,
  planStatusMeta,
  planTypeText,
} from '../../constants/labels';
import { asList, toProTable } from '../../services/request';
import { fmtDateTime, shortId } from '../../utils/format';
import { tr, useT } from '../../i18n';

/** 计划监管：按成员查计划列表 + 字段级变更史时间线（plan_change_history） */
export default function PlansPage() {
  const t = useT();
  const [memberId, setMemberId] = useState('');
  const [queriedMemberId, setQueriedMemberId] = useState('');
  const [historyPlan, setHistoryPlan] = useState<PlanItemRow | null>(null);
  const [history, setHistory] = useState<PlanHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const openHistory = async (plan: PlanItemRow) => {
    setHistoryPlan(plan);
    setHistoryLoading(true);
    try {
      setHistory(asList(await getPlanHistory(plan.id)));
    } finally {
      setHistoryLoading(false);
    }
  };

  const columns: ProColumns<PlanItemRow>[] = [
    { title: t('plan.name'), dataIndex: 'name', hideInSearch: true, ellipsis: true },
    {
      title: t('plan.type'),
      dataIndex: 'planType',
      hideInSearch: true,
      width: 110,
      render: (_, r) => planTypeText(r.planType),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      hideInSearch: true,
      width: 100,
      render: (_, r) => {
        const m = planStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: t('plan.course'),
      dataIndex: 'startDate',
      hideInSearch: true,
      width: 200,
      render: (_, r) => t('plan.courseRange', { start: r.startDate?.slice(0, 10) ?? '-', end: r.endDate ? r.endDate.slice(0, 10) : t('plan.longTerm') }),
    },
    {
      title: t('plan.storage'),
      dataIndex: 'storageLocation',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => r.storageLocation ?? '-',
    },
    {
      title: t('plan.items'),
      dataIndex: 'items',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) =>
        r.items && r.items.length > 0
          ? r.items.map((i) => `${i.drugNameSnapshot} ${i.doseAmount}${i.doseUnit}`).join(t('plan.itemJoin'))
          : '-',
    },
    {
      title: t('plan.createdBy'),
      dataIndex: 'createdByNickname',
      hideInSearch: true,
      width: 120,
      render: (_, r) => r.createdByNickname ?? shortId(r.createdByAccountId),
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updatedAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.updatedAt),
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 110,
      render: (_, record) => (
        <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openHistory(record)}>
          {t('plan.history')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer title={t('plan.title')} subTitle={t('plan.subTitle')}>
      <Card style={{ marginBottom: 16 }}>
        <Form
          layout="inline"
          onFinish={() => {
            const id = memberId.trim();
            if (!id) {
              message.warning(t('plan.inputMemberId'));
              return;
            }
            setQueriedMemberId(id);
          }}
        >
          <Form.Item label={t('plan.memberId')} required>
            <Input
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder={t('plan.memberIdPlaceholder')}
              style={{ width: 360 }}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              {t('plan.query')}
            </Button>
          </Form.Item>
          <Form.Item>
            <span style={{ color: token.colorTextSecondary }}>
              {t('plan.isolationNote')}
            </span>
          </Form.Item>
        </Form>
      </Card>

      {queriedMemberId ? (
        <ProTable<PlanItemRow>
          key={queriedMemberId}
          rowKey="id"
          columns={columns}
          params={{ memberId: queriedMemberId }}
          request={toProTable((q) =>
            listPlans({ ...q, memberId: String(q.memberId ?? queriedMemberId) }),
          )}
          search={false}
          pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        />
      ) : (
        <Card>
          <Empty description={t('plan.emptyQuery')} />
        </Card>
      )}

      <Drawer
        title={historyPlan ? t('plan.historyTitle', { name: historyPlan.name }) : t('plan.history')}
        width={620}
        open={!!historyPlan}
        onClose={() => setHistoryPlan(null)}
      >
        <Spin spinning={historyLoading}>
          {history.length === 0 && !historyLoading ? (
            <Empty description={t('plan.noHistory')} />
          ) : (
            <Timeline
              items={history.map((h) => {
                const op = operatorTypeMeta(h.operatorType);
                return {
                  color: op.color === 'default' ? 'gray' : op.color,
                  children: (
                    <div>
                      <div>
                        <strong>{h.changedField}</strong>
                        <Tag color={op.color} style={{ marginLeft: 8 }}>
                          {op.text}
                          {h.operatorLevel ? ` · ${h.operatorLevel}` : ''}
                        </Tag>
                        <span style={{ color: token.colorTextSecondary }}>{fmtDateTime(h.createdAt)}</span>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Space size={6} wrap>
                          <Tag>{h.oldValue ?? t('plan.emptyValue')}</Tag>
                          <span>→</span>
                          <Tag color="green">{h.newValue ?? t('plan.emptyValue')}</Tag>
                        </Space>
                      </div>
                      <div style={{ color: token.colorTextSecondary, fontSize: 12, marginTop: 2 }}>
                        {t('plan.operator', { name: h.operatorName ?? h.operatorAccountId ?? t('plan.systemName') })}
                        {h.planItemId ? t('plan.itemRef', { id: shortId(h.planItemId) }) : ''}
                      </div>
                    </div>
                  ),
                };
              })}
            />
          )}
        </Spin>
        <p style={{ color: token.colorTextSecondary }}>
          {t('plan.historyNote')}
        </p>
      </Drawer>
    </PageContainer>
  );
}
