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
  theme as antdTheme,
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
import { tr, useT } from '../../i18n';

/** 前后值双记录对比：对象走字段级对照表，其他类型走并排 JSON */
function ValueCompare({ before, after }: { before: unknown; after: unknown }) {
  const t = useT();
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();
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
          { title: t('disp.field'), dataIndex: 'key', width: 160 },
          {
            title: t('disp.before'),
            dataIndex: 'before',
            render: (v: unknown) => <span style={{ whiteSpace: 'pre-wrap' }}>{prettyJson(v)}</span>,
          },
          {
            title: t('disp.after'),
            dataIndex: 'after',
            render: (v: unknown) => (
              <span style={{ whiteSpace: 'pre-wrap', color: token.colorPrimary }}>{prettyJson(v)}</span>
            ),
          },
        ]}
      />
    );
  }

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Card size="small" title={t('disp.before')}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{prettyJson(before)}</pre>
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title={t('disp.after')}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{prettyJson(after)}</pre>
        </Card>
      </Col>
    </Row>
  );
}

/** 客服裁决：纠纷（授权/代操作争议）列表 + 前后值双记录 + 全权裁决提交 */
export default function DisputesPage() {
  const t = useT();
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();
  const actionRef = useRef<ActionType>();
  const [detail, setDetail] = useState<DisputeItem | null>(null);
  const [resolveTarget, setResolveTarget] = useState<DisputeItem | null>(null);

  const columns: ProColumns<DisputeItem>[] = [
    {
      title: t('disp.keyword'),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: t('disp.keywordPlaceholder') },
    },
    { title: t('disp.id'), dataIndex: 'id', hideInSearch: true, width: 110, render: (_, r) => <span title={r.id}>{shortId(r.id)}</span> },
    { title: t('disp.category'), dataIndex: 'category', hideInSearch: true, width: 120, render: (_, r) => r.category || '-' },
    { title: t('disp.subject'), dataIndex: 'subject', hideInSearch: true, ellipsis: true },
    {
      title: t('disp.related'),
      dataIndex: 'accountNickname',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) =>
        `${r.accountNickname ?? shortId(r.accountId)}${r.memberName ? t('disp.memberSuffix', { name: r.memberName }) : ''}`,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      valueEnum: disputeStatusEnum(),
      render: (_, r) => {
        const m = disputeStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: t('disp.submittedAt'),
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.createdAt),
    },
    {
      title: t('disp.resolver'),
      dataIndex: 'resolvedByName',
      hideInSearch: true,
      width: 110,
      render: (_, r) => r.resolvedByName ?? '-',
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>
            {t('disp.detailBtn')}
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
              {t('disp.resolve')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer title={t('disp.title')} subTitle={t('disp.subTitle')}>
      <ProTable<DisputeItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={toProTable((q) => listDisputes(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? t('disp.detailTitle', { subject: detail.subject }) : t('disp.detailTitlePlain')}
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
              {t('disp.doResolve')}
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('disp.id')}>{detail.id}</Descriptions.Item>
              <Descriptions.Item label={t('disp.category')}>{detail.category || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('disp.subject')}>{detail.subject}</Descriptions.Item>
              <Descriptions.Item label={t('disp.description')}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.description ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('disp.account')}>
                {detail.accountNickname ?? detail.accountId}
              </Descriptions.Item>
              <Descriptions.Item label={t('disp.member')}>{detail.memberName ?? detail.memberId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('disp.target')}>
                {detail.targetType ? `${detail.targetType} · ${detail.targetId ?? ''}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={disputeStatusMeta(detail.status).color}>
                  {disputeStatusMeta(detail.status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('disp.submittedAt')}>{fmtDateTime(detail.createdAt)}</Descriptions.Item>
              {detail.resolvedAt && (
                <>
                  <Descriptions.Item label={t('disp.decision')}>{detail.decision ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('disp.resolution')}>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{detail.resolution ?? '-'}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('disp.resolvedBy')}>
                    {detail.resolvedByName ?? '-'} · {fmtDateTime(detail.resolvedAt)}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            <h4 style={{ margin: '20px 0 8px' }}>{t('disp.compareHead')}</h4>
            <ValueCompare before={detail.beforeValue} after={detail.afterValue} />
            {detail.finalValue !== undefined && detail.finalValue !== null && (
              <>
                <h4 style={{ margin: '20px 0 8px' }}>{t('disp.finalValue')}</h4>
                <pre style={{ whiteSpace: 'pre-wrap', background: token.colorSuccessBg, padding: 12 }}>
                  {prettyJson(detail.finalValue)}
                </pre>
              </>
            )}
          </>
        )}
      </Drawer>

      <ModalForm<ResolveDisputePayload & { decision: string }>
        title={resolveTarget ? t('disp.resolveTitle', { subject: resolveTarget.subject }) : t('disp.resolveTitlePlain')}
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
          message.success(t('disp.resolvedToast'));
          setResolveTarget(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('disp.authorityNote')}
        />
        {resolveTarget && (
          <div style={{ marginBottom: 16 }}>
            <ValueCompare before={resolveTarget.beforeValue} after={resolveTarget.afterValue} />
          </div>
        )}
        <ProFormRadio.Group
          name="decision"
          label={t('disp.decision')}
          options={disputeDecisionOptions()}
          rules={[{ required: true, message: t('disp.decisionRequired') }]}
        />
        <ProFormTextArea
          name="finalValue"
          label={t('disp.finalValueLabel')}
          fieldProps={{ rows: 3 }}
          extra={t('disp.finalValueExtra')}
        />
        <ProFormTextArea
          name="resolution"
          label={t('disp.resolution')}
          fieldProps={{ rows: 4, maxLength: 1000 }}
          rules={[{ required: true, message: t('disp.resolutionRequired') }]}
        />
      </ModalForm>
    </PageContainer>
  );
}
