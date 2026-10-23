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

/** 计划监管：按成员查计划列表 + 字段级变更史时间线（plan_change_history） */
export default function PlansPage() {
  const [memberId, setMemberId] = useState('');
  const [queriedMemberId, setQueriedMemberId] = useState('');
  const [historyPlan, setHistoryPlan] = useState<PlanItemRow | null>(null);
  const [history, setHistory] = useState<PlanHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    { title: '计划名', dataIndex: 'name', hideInSearch: true, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'planType',
      hideInSearch: true,
      width: 110,
      render: (_, r) => planTypeText(r.planType),
    },
    {
      title: '状态',
      dataIndex: 'status',
      hideInSearch: true,
      width: 100,
      render: (_, r) => {
        const m = planStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '疗程',
      dataIndex: 'startDate',
      hideInSearch: true,
      width: 200,
      render: (_, r) => `${r.startDate?.slice(0, 10) ?? '-'} ~ ${r.endDate ? r.endDate.slice(0, 10) : '长期'}`,
    },
    {
      title: '存放位置',
      dataIndex: 'storageLocation',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => r.storageLocation ?? '-',
    },
    {
      title: '药品明细',
      dataIndex: 'items',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) =>
        r.items && r.items.length > 0
          ? r.items.map((i) => `${i.drugNameSnapshot} ${i.doseAmount}${i.doseUnit}`).join('；')
          : '-',
    },
    {
      title: '创建人',
      dataIndex: 'createdByNickname',
      hideInSearch: true,
      width: 120,
      render: (_, r) => r.createdByNickname ?? shortId(r.createdByAccountId),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.updatedAt),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 110,
      render: (_, record) => (
        <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openHistory(record)}>
          变更史
        </Button>
      ),
    },
  ];

  return (
    <PageContainer title="计划监管" subTitle="按成员维度查看用药计划与全部字段级变更记录">
      <Card style={{ marginBottom: 16 }}>
        <Form
          layout="inline"
          onFinish={() => {
            const id = memberId.trim();
            if (!id) {
              message.warning('请输入成员 ID');
              return;
            }
            setQueriedMemberId(id);
          }}
        >
          <Form.Item label="成员 ID" required>
            <Input
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="成员 UUID（可从成员管理复制）"
              style={{ width: 360 }}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询计划
            </Button>
          </Form.Item>
          <Form.Item>
            <span style={{ color: '#8c8c8c' }}>
              成员数据隔离：仅返回该成员的计划，变更史含代操作双记录（操作人 + 操作类型）。
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
          <Empty description="输入成员 ID 后查询其用药计划" />
        </Card>
      )}

      <Drawer
        title={historyPlan ? `变更史 · ${historyPlan.name}` : '变更史'}
        width={620}
        open={!!historyPlan}
        onClose={() => setHistoryPlan(null)}
      >
        <Spin spinning={historyLoading}>
          {history.length === 0 && !historyLoading ? (
            <Empty description="暂无变更记录" />
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
                        <span style={{ color: '#8c8c8c' }}>{fmtDateTime(h.createdAt)}</span>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Space size={6} wrap>
                          <Tag>{h.oldValue ?? '（空）'}</Tag>
                          <span>→</span>
                          <Tag color="green">{h.newValue ?? '（空）'}</Tag>
                        </Space>
                      </div>
                      <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 2 }}>
                        操作人：{h.operatorName ?? h.operatorAccountId ?? '系统'}
                        {h.planItemId ? ` · 明细 ${shortId(h.planItemId)}` : ''}
                      </div>
                    </div>
                  ),
                };
              })}
            />
          )}
        </Spin>
        <p style={{ color: '#8c8c8c' }}>
          说明：变更史为字段级双记录（old_value → new_value），与计划变更日志在同一次变更事务内双写；
          客服裁决产生的变更以「客服裁决」类型出现在此处。
        </p>
      </Drawer>
    </PageContainer>
  );
}
