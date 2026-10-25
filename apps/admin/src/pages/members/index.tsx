import { EyeOutlined } from '@ant-design/icons';
import { PageContainer, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Descriptions, Drawer, List, Tag, theme as antdTheme } from 'antd';
import { useState } from 'react';
import { listMembers } from '../../api/admin';
import type { MemberItem } from '../../api/types';
import {
  authLevelText,
  authorizationStatusMeta,
  genderText,
  memberStatusEnum,
  memberStatusMeta,
  relationshipText,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDate, fmtDateTime, shortId } from '../../utils/format';

/** 成员管理：列表 + 所属账号 + 授权关系（照护人）展示 */
export default function MembersPage() {
  const [detail, setDetail] = useState<MemberItem | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const activeAuthCount = (record: MemberItem) =>
    (record.authorizations ?? []).filter((a) => a.status === 'active').length;

  const columns: ProColumns<MemberItem>[] = [
    {
      title: '关键字',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '成员名 / 账号昵称' },
    },
    {
      title: '所属账号 ID',
      dataIndex: 'accountId',
      hideInTable: true,
      fieldProps: { placeholder: '按账号 ID 精确筛选' },
    },
    { title: '成员 ID', dataIndex: 'id', hideInSearch: true, width: 110, render: (_, r) => <span title={r.id}>{shortId(r.id)}</span> },
    { title: '成员名', dataIndex: 'displayName', hideInSearch: true, ellipsis: true },
    {
      title: '与账号关系',
      dataIndex: 'relationship',
      hideInSearch: true,
      width: 110,
      render: (_, r) => relationshipText(r.relationship),
    },
    {
      title: '所属账号',
      dataIndex: 'accountNickname',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) =>
        r.account ? (
          <span>
            {r.account.nickname}
            <span style={{ color: token.colorTextSecondary, marginLeft: 6 }}>{r.account.phoneMasked ?? ''}</span>
          </span>
        ) : (
          shortId(r.accountId)
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueEnum: memberStatusEnum,
      render: (_, r) => {
        const m = memberStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '授权关系',
      dataIndex: 'authorizations',
      hideInSearch: true,
      width: 130,
      render: (_, r) => {
        const total = r.authorizations?.length ?? 0;
        if (total === 0) return <span style={{ color: token.colorTextSecondary }}>无照护人</span>;
        return (
          <span>
            生效 <Tag color="green">{activeAuthCount(r)}</Tag> / 共 {total}
          </span>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.createdAt),
    },
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
    <PageContainer title="成员管理" subTitle="成员（member）及其所属账号、照护授权关系">
      <ProTable<MemberItem>
        rowKey="id"
        columns={columns}
        request={toProTable((q) => listMembers(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? `成员详情 · ${detail.displayName}` : '成员详情'}
        width={560}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="成员 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="成员名">{detail.displayName}</Descriptions.Item>
              <Descriptions.Item label="与账号关系">{relationshipText(detail.relationship)}</Descriptions.Item>
              <Descriptions.Item label="性别">{genderText(detail.gender)}</Descriptions.Item>
              <Descriptions.Item label="出生日期">{fmtDate(detail.birthDate)}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={memberStatusMeta(detail.status).color}>
                  {memberStatusMeta(detail.status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="时区">{detail.timezone}</Descriptions.Item>
              <Descriptions.Item label="所属账号">
                {detail.account
                  ? `${detail.account.nickname}（${detail.account.phoneMasked ?? ''}）`
                  : detail.accountId}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{fmtDateTime(detail.createdAt)}</Descriptions.Item>
            </Descriptions>

            <h4 style={{ margin: '20px 0 8px' }}>
              授权关系 · 照护人（{detail.authorizations?.length ?? 0}）
            </h4>
            <List
              size="small"
              bordered
              dataSource={detail.authorizations ?? []}
              locale={{ emptyText: '暂无授权关系' }}
              renderItem={(a) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <span>
                        {a.caregiverNickname ?? shortId(a.caregiverAccountId)}
                        <Tag style={{ marginLeft: 8 }}>{authLevelText(a.level)}</Tag>
                        <Tag color={authorizationStatusMeta(a.status).color}>
                          {authorizationStatusMeta(a.status).text}
                        </Tag>
                      </span>
                    }
                    description={
                      <span>
                        邀请 {fmtDateTime(a.invitedAt)}
                        {a.expiresAt ? ` · 到期 ${fmtDateTime(a.expiresAt)}` : ' · 长期有效'}
                        {a.revokeReason ? ` · 撤销原因：${a.revokeReason}` : ''}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
            <p style={{ color: token.colorTextSecondary, marginTop: 12 }}>
              数据隔离红线：照护人仅可见被授权成员的数据，看不到同户其他成员。
            </p>
          </>
        )}
      </Drawer>
    </PageContainer>
  );
}
