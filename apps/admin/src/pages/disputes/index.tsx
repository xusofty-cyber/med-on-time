import { EyeOutlined, SolutionOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormRadio,
  ProFormTextArea,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Row,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { useRef, useState } from 'react';
import { listDisputes, resolveDispute } from '../../api/admin';
import type { DisputeItem, ResolveDisputePayload } from '../../api/types';
import {
  disputeDecisionOptions,
  disputeStatusEnum,
  disputeStatusMeta,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDateTime, prettyJson, shortId } from '../../utils/format';

/** 前后值双记录对比：对象走字段级对照表，其他类型走并排 JSON */
function ValueCompare({ before, after }: { before: unknown; after: unknown }) {
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  if (isPlainObject(before) || isPlainObject(after)) {
    const keys = [
      ...new Set([
        ...Object.keys(isPlainObject(before) ? before : {}),
        ...Object.keys(isPlainObject(after) ? after : {}),
      ]),
    ];
    return (
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={keys.map((key) => ({
          key,
          before: isPlainObject(before) ? before[key] : undefined,
          after: isPlainObject(after) ? after[key] : undefined,
        }))}
        columns={[
          { title: '字段', dataIndex: 'key', width: 160 },
          {
            title: '变更前值',
            dataIndex: 'before',
            render: (v: unknown) => <span style={{ whiteSpace: 'pre-wrap' }}>{prettyJson(v)}</span>,
          },
          {
            title: '变更后值',
            dataIndex: 'after',
            render: (v: unknown) => (
              <span style={{ whiteSpace: 'pre-wrap', color: '#0B6B4F' }}>{prettyJson(v)}</span>
            ),
          },
        ]}
      />
    );
  }

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Card size="small" title="变更前值">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{prettyJson(before)}</pre>
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="变更后值">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{prettyJson(after)}</pre>
        </Card>
      </Col>
    </Row>
  );
}

/** 客服裁决：纠纷（授权/代操作争议）列表 + 前后值双记录 + 全权裁决提交 */
export default function DisputesPage() {
  const actionRef = useRef<ActionType>();
  const [detail, setDetail] = useState<DisputeItem | null>(null);
  const [resolveTarget, setResolveTarget] = useState<DisputeItem | null>(null);

  const columns: ProColumns<DisputeItem>[] = [
    {
      title: '关键字',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '主题 / 账号 / 成员' },
    },
    { title: '纠纷 ID', dataIndex: 'id', hideInSearch: true, width: 110, render: (_, r) => <span title={r.id}>{shortId(r.id)}</span> },
    { title: '类型', dataIndex: 'category', hideInSearch: true, width: 120, render: (_, r) => r.category || '-' },
    { title: '主题', dataIndex: 'subject', hideInSearch: true, ellipsis: true },
    {
      title: '关联账号 / 成员',
      dataIndex: 'accountNickname',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) =>
        `${r.accountNickname ?? shortId(r.accountId)}${r.memberName ? ` · 成员 ${r.memberName}` : ''}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueEnum: disputeStatusEnum,
      render: (_, r) => {
        const m = disputeStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.createdAt),
    },
    {
      title: '裁决人',
      dataIndex: 'resolvedByName',
      hideInSearch: true,
      width: 110,
      render: (_, r) => r.resolvedByName ?? '-',
    },
    {
      title: '操作',
      valueType: 'option',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>
            详情
          </Button>
          {(record.status === 'pending' || record.status === 'processing') && (
            <Button
              type="link"
              size="small"
              icon={<SolutionOutlined />}
              onClick={() => {
                setDetail(null);
                setResolveTarget(record);
              }}
            >
              裁决
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer title="客服裁决" subTitle="授权与代操作纠纷：客服全权裁决，裁决结果与前后值双记录留痕">
      <ProTable<DisputeItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={toProTable((q) => listDisputes(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? `纠纷详情 · ${detail.subject}` : '纠纷详情'}
        width={720}
        open={!!detail}
        onClose={() => setDetail(null)}
        extra={
          detail && (detail.status === 'pending' || detail.status === 'processing') ? (
            <Button
              type="primary"
              icon={<SolutionOutlined />}
              onClick={() => {
                setResolveTarget(detail);
                setDetail(null);
              }}
            >
              执行裁决
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="纠纷 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="主题">{detail.subject}</Descriptions.Item>
              <Descriptions.Item label="说明">
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.description ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="关联账号">
                {detail.accountNickname ?? detail.accountId}
              </Descriptions.Item>
              <Descriptions.Item label="关联成员">{detail.memberName ?? detail.memberId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="争议对象">
                {detail.targetType ? `${detail.targetType} · ${detail.targetId ?? ''}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={disputeStatusMeta(detail.status).color}>
                  {disputeStatusMeta(detail.status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="提交时间">{fmtDateTime(detail.createdAt)}</Descriptions.Item>
              {detail.resolvedAt && (
                <>
                  <Descriptions.Item label="裁决结论">{detail.decision ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="裁决说明">
                    <span style={{ whiteSpace: 'pre-wrap' }}>{detail.resolution ?? '-'}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="裁决人 / 时间">
                    {detail.resolvedByName ?? '-'} · {fmtDateTime(detail.resolvedAt)}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            <h4 style={{ margin: '20px 0 8px' }}>争议变更双记录（裁决依据，裁决后保留）</h4>
            <ValueCompare before={detail.beforeValue} after={detail.afterValue} />
            {detail.finalValue !== undefined && detail.finalValue !== null && (
              <>
                <h4 style={{ margin: '20px 0 8px' }}>裁定值</h4>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f6ffed', padding: 12 }}>
                  {prettyJson(detail.finalValue)}
                </pre>
              </>
            )}
          </>
        )}
      </Drawer>

      <ModalForm<ResolveDisputePayload & { decision: string }>
        title={resolveTarget ? `执行裁决 · ${resolveTarget.subject}` : '执行裁决'}
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) setResolveTarget(null);
        }}
        width={560}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!resolveTarget) return false;
          await resolveDispute(resolveTarget.id, {
            decision: values.decision,
            resolution: values.resolution,
            finalValue: values.finalValue,
          });
          message.success('裁决已提交，前后值与裁决结果已双记录留痕');
          setResolveTarget(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="客服全权裁决：裁决生效后，对应数据将按裁定值回写并以「客服裁决（admin_cs）」记入变更史，前后值永久保留。"
        />
        {resolveTarget && (
          <div style={{ marginBottom: 16 }}>
            <ValueCompare before={resolveTarget.beforeValue} after={resolveTarget.afterValue} />
          </div>
        )}
        <ProFormRadio.Group
          name="decision"
          label="裁决结论"
          options={disputeDecisionOptions}
          rules={[{ required: true, message: '请选择裁决结论' }]}
        />
        <ProFormTextArea
          name="finalValue"
          label="裁定值（结论为自定义裁定时填写）"
          fieldProps={{ rows: 3 }}
          extra="文本或 JSON；选择维持前/后值时可留空"
        />
        <ProFormTextArea
          name="resolution"
          label="裁决说明"
          fieldProps={{ rows: 4, maxLength: 1000 }}
          rules={[{ required: true, message: '裁决说明必填，将随双记录一并留痕' }]}
        />
      </ModalForm>
    </PageContainer>
  );
}
