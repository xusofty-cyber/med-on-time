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
import { tr, useT } from '../../i18n';

/** 成员管理：列表 + 所属账号 + 授权关系（照护人）展示 */
export default function MembersPage() {
  const t = useT();
  const [detail, setDetail] = useState<MemberItem | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const activeAuthCount = (record: MemberItem) =>
    (record.authorizations ?? []).filter((a) => a.status === 'active').length;

  const columns: ProColumns<MemberItem>[] = [
    {
      title: t('memb.keyword'),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: t('memb.keywordPlaceholder') },
    },
    {
      title: t('memb.accountIdSearch'),
      dataIndex: 'accountId',
      hideInTable: true,
      fieldProps: { placeholder: t('memb.accountIdPlaceholder') },
    },
    { title: t('memb.id'), dataIndex: 'id', hideInSearch: true, width: 110, render: (_, r) => <span title={r.id}>{shortId(r.id)}</span> },
    { title: t('memb.name'), dataIndex: 'displayName', hideInSearch: true, ellipsis: true },
    {
      title: t('memb.relationship'),
      dataIndex: 'relationship',
      hideInSearch: true,
      width: 110,
      render: (_, r) => relationshipText(r.relationship),
    },
    {
      title: t('memb.account'),
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
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      valueEnum: memberStatusEnum(),
      render: (_, r) => {
        const m = memberStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: t('memb.auths'),
      dataIndex: 'authorizations',
      hideInSearch: true,
      width: 130,
      render: (_, r) => {
        const total = r.authorizations?.length ?? 0;
        if (total === 0) return <span style={{ color: token.colorTextSecondary }}>{t('memb.noCaregiver')}</span>;
        return (
          <span>
            {t('memb.authActivePrefix')} <Tag color="green">{activeAuthCount(r)}</Tag>{t('memb.authTotalSuffix', { total })}
          </span>
        );
      },
    },
    {
      title: t('common.createdAt'),
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.createdAt),
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 90,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>
          {t('acct.detailBtn')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer title={t('memb.title')} subTitle={t('memb.subTitle')}>
      <ProTable<MemberItem>
        rowKey="id"
        columns={columns}
        request={toProTable((q) => listMembers(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? t('memb.detailTitle', { name: detail.displayName }) : t('memb.detailTitlePlain')}
        width={560}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('memb.id')}>{detail.id}</Descriptions.Item>
              <Descriptions.Item label={t('memb.name')}>{detail.displayName}</Descriptions.Item>
              <Descriptions.Item label={t('memb.relationship')}>{relationshipText(detail.relationship)}</Descriptions.Item>
              <Descriptions.Item label={t('memb.gender')}>{genderText(detail.gender)}</Descriptions.Item>
              <Descriptions.Item label={t('memb.birthDate')}>{fmtDate(detail.birthDate)}</Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={memberStatusMeta(detail.status).color}>
                  {memberStatusMeta(detail.status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('memb.timezone')}>{detail.timezone}</Descriptions.Item>
              <Descriptions.Item label={t('memb.account')}>
                {detail.account
                  ? t('memb.accountTitle', { nickname: detail.account.nickname, phone: detail.account.phoneMasked ?? '' })
                  : detail.accountId}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.createdAt')}>{fmtDateTime(detail.createdAt)}</Descriptions.Item>
            </Descriptions>

            <h4 style={{ margin: '20px 0 8px' }}>
              {t('memb.authHead', { n: detail.authorizations?.length ?? 0 })}
            </h4>
            <List
              size="small"
              bordered
              dataSource={detail.authorizations ?? []}
              locale={{ emptyText: t('memb.noAuths') }}
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
                        {t('memb.invited', { time: fmtDateTime(a.invitedAt) })}
                        {a.expiresAt ? t('memb.expires', { time: fmtDateTime(a.expiresAt) }) : t('memb.longTerm')}
                        {a.revokeReason ? t('memb.revokeReason', { reason: a.revokeReason }) : ''}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
            <p style={{ color: token.colorTextSecondary, marginTop: 12 }}>
              {t('memb.isolationNote')}
            </p>
          </>
        )}
      </Drawer>
    </PageContainer>
  );
}
