import { EyeOutlined } from '@ant-design/icons';
import { PageContainer, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Descriptions, Drawer, Tag, theme as antdTheme } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { listAuditLogs } from '../../api/admin';
import type { AuditLogItem } from '../../api/types';
import {
  actorTypeText,
  auditResultEnum,
  auditResultMeta,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDateTimeFull, prettyJson, shortId } from '../../utils/format';
import { tr, useT } from '../../i18n';

/** 审计日志（audit_log 分区表）：时间 / 操作者 / 对象过滤查询，只读 */
export default function AuditPage() {
  const t = useT();
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const columns: ProColumns<AuditLogItem>[] = [
    {
      title: t('audit.timeRange'),
      dataIndex: 'createdAtRange',
      hideInTable: true,
      valueType: 'dateTimeRange',
      search: {
        transform: (value: [string, string]) => ({
          from: dayjs(value[0]).toISOString(),
          to: dayjs(value[1]).toISOString(),
        }),
      },
    },
    {
      title: t('audit.actorType'),
      dataIndex: 'actorType',
      hideInTable: true,
      valueEnum: {
        admin: { text: tr('enum.actorType.admin') },
        account: { text: tr('enum.actorType.account') },
        system: { text: tr('enum.actorType.system') },
      },
    },
    {
      title: t('audit.actorId'),
      dataIndex: 'actorId',
      hideInTable: true,
      fieldProps: { placeholder: t('audit.actorIdPlaceholder') },
    },
    {
      title: t('audit.action'),
      dataIndex: 'action',
      hideInTable: true,
      fieldProps: { placeholder: t('audit.actionPlaceholder') },
    },
    {
      title: t('audit.targetType'),
      dataIndex: 'targetType',
      hideInTable: true,
      fieldProps: { placeholder: t('audit.targetTypePlaceholder') },
    },
    {
      title: t('audit.result'),
      dataIndex: 'result',
      hideInTable: true,
      valueEnum: auditResultEnum(),
    },
    {
      title: t('audit.time'),
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 170,
      render: (_, r) => fmtDateTimeFull(r.createdAt),
    },
    {
      title: t('audit.actor'),
      dataIndex: 'actor',
      hideInSearch: true,
      width: 170,
      render: (_, r) => (
        <span>
          <Tag>{actorTypeText(r.actorType)}</Tag>
          {r.actorName ?? <span title={r.actorId}>{shortId(r.actorId)}</span>}
        </span>
      ),
    },
    { title: t('audit.action'), dataIndex: 'action', hideInSearch: true, width: 180, ellipsis: true },
    {
      title: t('audit.target'),
      dataIndex: 'target',
      hideInSearch: true,
      width: 180,
      ellipsis: true,
      render: (_, r) => `${r.targetType}${r.targetId ? ` · ${shortId(r.targetId)}` : ''}`,
    },
    {
      title: t('audit.member'),
      dataIndex: 'memberId',
      hideInSearch: true,
      width: 110,
      render: (_, r) => (r.memberId ? <span title={r.memberId}>{shortId(r.memberId)}</span> : '-'),
    },
    {
      title: t('audit.result'),
      dataIndex: 'result',
      hideInSearch: true,
      width: 90,
      render: (_, r) => {
        const m = auditResultMeta(r.result);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    { title: t('audit.ip'), dataIndex: 'ipAddress', hideInSearch: true, width: 120, render: (_, r) => r.ipAddress ?? '-' },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 90,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>
          {t('audit.detailBtn')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer title={t('audit.title')} subTitle={t('audit.subTitle')}>
      <ProTable<AuditLogItem>
        rowKey="id"
        columns={columns}
        request={toProTable((q) => listAuditLogs(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={t('audit.detailTitle')}
        width={640}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('audit.logId')}>{detail.id}</Descriptions.Item>
              <Descriptions.Item label={t('audit.time')}>{fmtDateTimeFull(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label={t('audit.actor')}>
                {actorTypeText(detail.actorType)} · {detail.actorName ?? detail.actorId}
              </Descriptions.Item>
              <Descriptions.Item label={t('audit.action')}>{detail.action}</Descriptions.Item>
              <Descriptions.Item label={t('audit.target')}>
                {detail.targetType}
                {detail.targetId ? ` · ${detail.targetId}` : ''}
              </Descriptions.Item>
              <Descriptions.Item label={t('audit.member')}>{detail.memberId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('audit.result')}>
                <Tag color={auditResultMeta(detail.result).color}>
                  {auditResultMeta(detail.result).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('audit.ip')}>{detail.ipAddress ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="User-Agent">{detail.userAgent ?? '-'}</Descriptions.Item>
            </Descriptions>
            <h4 style={{ margin: '20px 0 8px' }}>{t('audit.detailHead')}</h4>
            <pre
              style={{
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 6,
                padding: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {prettyJson(detail.detail)}
            </pre>
          </>
        )}
      </Drawer>
    </PageContainer>
  );
}
