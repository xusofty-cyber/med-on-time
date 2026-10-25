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

/** 审计日志（audit_log 分区表）：时间 / 操作者 / 对象过滤查询，只读 */
export default function AuditPage() {
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const columns: ProColumns<AuditLogItem>[] = [
    {
      title: '时间范围',
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
      title: '操作者类型',
      dataIndex: 'actorType',
      hideInTable: true,
      valueEnum: {
        admin: { text: '管理员' },
        account: { text: '用户账号' },
        system: { text: '系统' },
      },
    },
    {
      title: '操作者 ID',
      dataIndex: 'actorId',
      hideInTable: true,
      fieldProps: { placeholder: '管理员 / 账号 UUID' },
    },
    {
      title: '动作',
      dataIndex: 'action',
      hideInTable: true,
      fieldProps: { placeholder: '如 drug:review / account:freeze' },
    },
    {
      title: '对象类型',
      dataIndex: 'targetType',
      hideInTable: true,
      fieldProps: { placeholder: '如 drug / user_account / member' },
    },
    {
      title: '结果',
      dataIndex: 'result',
      hideInTable: true,
      valueEnum: auditResultEnum,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 170,
      render: (_, r) => fmtDateTimeFull(r.createdAt),
    },
    {
      title: '操作者',
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
    { title: '动作', dataIndex: 'action', hideInSearch: true, width: 180, ellipsis: true },
    {
      title: '对象',
      dataIndex: 'target',
      hideInSearch: true,
      width: 180,
      ellipsis: true,
      render: (_, r) => `${r.targetType}${r.targetId ? ` · ${shortId(r.targetId)}` : ''}`,
    },
    {
      title: '关联成员',
      dataIndex: 'memberId',
      hideInSearch: true,
      width: 110,
      render: (_, r) => (r.memberId ? <span title={r.memberId}>{shortId(r.memberId)}</span> : '-'),
    },
    {
      title: '结果',
      dataIndex: 'result',
      hideInSearch: true,
      width: 90,
      render: (_, r) => {
        const m = auditResultMeta(r.result);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    { title: 'IP', dataIndex: 'ipAddress', hideInSearch: true, width: 120, render: (_, r) => r.ipAddress ?? '-' },
    {
      title: '操作',
      valueType: 'option',
      width: 90,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <PageContainer title="审计日志" subTitle="全量操作审计（只追加、不可改删）：按时间 / 操作者 / 对象 / 结果过滤">
      <ProTable<AuditLogItem>
        rowKey="id"
        columns={columns}
        request={toProTable((q) => listAuditLogs(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title="审计详情"
        width={640}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="日志 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="时间">{fmtDateTimeFull(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="操作者">
                {actorTypeText(detail.actorType)} · {detail.actorName ?? detail.actorId}
              </Descriptions.Item>
              <Descriptions.Item label="动作">{detail.action}</Descriptions.Item>
              <Descriptions.Item label="对象">
                {detail.targetType}
                {detail.targetId ? ` · ${detail.targetId}` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="关联成员">{detail.memberId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="结果">
                <Tag color={auditResultMeta(detail.result).color}>
                  {auditResultMeta(detail.result).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="IP">{detail.ipAddress ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="User-Agent">{detail.userAgent ?? '-'}</Descriptions.Item>
            </Descriptions>
            <h4 style={{ margin: '20px 0 8px' }}>明细 detail（敏感值已脱敏）</h4>
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
