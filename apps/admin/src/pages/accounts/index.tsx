import { EyeOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormTextArea,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { Button, Descriptions, Drawer, List, Popconfirm, Space, Tag, message, theme as antdTheme } from 'antd';
import { useRef, useState } from 'react';
import {
  freezeAccount,
  getAccount,
  listAccounts,
  unfreezeAccount,
} from '../../api/admin';
import type { AccountDetail, AccountItem } from '../../api/types';
import {
  accountStatusEnum,
  accountStatusMeta,
  registerChannelText,
  relationshipText,
  memberStatusMeta,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDateTime, shortId } from '../../utils/format';
import { tr, useT } from '../../i18n';

/** 账号管理：列表（搜索/分页/状态）+ 详情抽屉 + 冻结/解冻 */
export default function AccountsPage() {
  const t = useT();
  const actionRef = useRef<ActionType>();
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState<AccountItem | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await getAccount(id));
    } finally {
      setDetailLoading(false);
    }
  };

  const doUnfreeze = async (record: AccountItem) => {
    await unfreezeAccount(record.id);
    message.success(t('acct.unfrozen', { name: record.nickname }));
    actionRef.current?.reload();
    if (detail?.id === record.id) setDetail(await getAccount(record.id));
  };

  const columns: ProColumns<AccountItem>[] = [
    {
      title: t('acct.keyword'),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: t('acct.keywordPlaceholder') },
    },
    { title: t('acct.id'), dataIndex: 'id', hideInSearch: true, width: 110, render: (_, r) => <span title={r.id}>{shortId(r.id)}</span> },
    { title: t('acct.nickname'), dataIndex: 'nickname', hideInSearch: true, ellipsis: true },
    {
      title: t('acct.phone'),
      dataIndex: 'phoneMasked',
      hideInSearch: true,
      width: 130,
      render: (_, r) => r.phoneMasked ?? r.phone ?? '-',
    },
    {
      title: t('acct.channel'),
      dataIndex: 'registerChannel',
      hideInSearch: true,
      width: 110,
      render: (_, r) => registerChannelText(r.registerChannel),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      valueEnum: accountStatusEnum(),
      render: (_, r) => {
        const m = accountStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    { title: t('acct.memberCount'), dataIndex: 'memberCount', hideInSearch: true, width: 80, render: (_, r) => r.memberCount ?? '-' },
    {
      title: t('acct.registeredAt'),
      dataIndex: 'registeredAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.registeredAt),
    },
    {
      title: t('acct.lastLogin'),
      dataIndex: 'lastLoginAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.lastLoginAt),
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
            {t('acct.detailBtn')}
          </Button>
          {record.status === 'frozen' ? (
            <Popconfirm title={t('acct.unfreezeConfirm', { name: record.nickname })} onConfirm={() => doUnfreeze(record)}>
              <Button type="link" size="small" icon={<UnlockOutlined />}>
                {t('acct.unfreeze')}
              </Button>
            </Popconfirm>
          ) : record.status === 'active' ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<LockOutlined />}
              onClick={() => setFreezeTarget(record)}
            >
              {t('acct.freeze')}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer title={t('acct.title')} subTitle={t('acct.subTitle')}>
      <ProTable<AccountItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={toProTable((q) => listAccounts(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? t('acct.detailTitle', { name: detail.nickname }) : t('acct.detailTitlePlain')}
        width={560}
        open={!!detail || detailLoading}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        extra={
          detail && detail.status === 'frozen' ? (
            <Popconfirm title={t('acct.unfreezeConfirmShort')} onConfirm={() => doUnfreeze(detail)}>
              <Button icon={<UnlockOutlined />}>{t('acct.unfreezeAccount')}</Button>
            </Popconfirm>
          ) : detail && detail.status === 'active' ? (
            <Button danger icon={<LockOutlined />} onClick={() => setFreezeTarget(detail)}>
              {t('acct.freezeAccount')}
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('acct.id')}>{detail.id}</Descriptions.Item>
              <Descriptions.Item label={t('acct.nickname')}>{detail.nickname}</Descriptions.Item>
              <Descriptions.Item label={t('acct.phone')}>{detail.phoneMasked ?? detail.phone ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={accountStatusMeta(detail.status).color}>
                  {accountStatusMeta(detail.status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('acct.channel')}>{registerChannelText(detail.registerChannel)}</Descriptions.Item>
              <Descriptions.Item label={t('acct.registeredAt')}>{fmtDateTime(detail.registeredAt)}</Descriptions.Item>
              <Descriptions.Item label={t('acct.lastLogin')}>{fmtDateTime(detail.lastLoginAt)}</Descriptions.Item>
              <Descriptions.Item label={t('acct.timezone')}>{detail.timezone ?? '-'}</Descriptions.Item>
              {detail.cancelApplyAt && (
                <Descriptions.Item label={t('acct.cancelApply')}>{fmtDateTime(detail.cancelApplyAt)}</Descriptions.Item>
              )}
              {detail.cancelReason && (
                <Descriptions.Item label={t('acct.cancelReason')}>{detail.cancelReason}</Descriptions.Item>
              )}
              {detail.oauthBindings && detail.oauthBindings.length > 0 && (
                <Descriptions.Item label={t('acct.oauthBindings')}>
                  {detail.oauthBindings.map((b) => b.provider).join(t('acct.joinSeparator'))}
                </Descriptions.Item>
              )}
            </Descriptions>
            <h4 style={{ margin: '20px 0 8px' }}>{t('acct.membersHead', { n: detail.members?.length ?? 0 })}</h4>
            <List
              size="small"
              bordered
              dataSource={detail.members ?? []}
              locale={{ emptyText: t('acct.noMembers') }}
              renderItem={(m) => (
                <List.Item>
                  <span>
                    {m.displayName}
                    <span style={{ color: token.colorTextSecondary, marginLeft: 8 }}>{relationshipText(m.relationship)}</span>
                  </span>
                  <Tag color={memberStatusMeta(m.status).color}>{memberStatusMeta(m.status).text}</Tag>
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>

      <ModalForm<{ reason?: string }>
        title={freezeTarget ? t('acct.freezeTitle', { name: freezeTarget.nickname }) : t('acct.freezeTitlePlain')}
        open={!!freezeTarget}
        onOpenChange={(open) => {
          if (!open) setFreezeTarget(null);
        }}
        width={440}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!freezeTarget) return false;
          await freezeAccount(freezeTarget.id, values.reason);
          message.success(t('acct.frozen', { name: freezeTarget.nickname }));
          setFreezeTarget(null);
          actionRef.current?.reload();
          if (detail?.id === freezeTarget.id) setDetail(await getAccount(freezeTarget.id));
          return true;
        }}
      >
        <p style={{ color: token.colorTextSecondary }}>
          {t('acct.freezeNote')}
        </p>
        <ProFormTextArea name="reason" label={t('acct.freezeReason')} fieldProps={{ rows: 3, maxLength: 200 }} />
      </ModalForm>
    </PageContainer>
  );
}
