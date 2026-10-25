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

/** 账号管理：列表（搜索/分页/状态）+ 详情抽屉 + 冻结/解冻 */
export default function AccountsPage() {
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
    message.success(`账号「${record.nickname}」已解冻`);
    actionRef.current?.reload();
    if (detail?.id === record.id) setDetail(await getAccount(record.id));
  };

  const columns: ProColumns<AccountItem>[] = [
    {
      title: '关键字',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '昵称 / 手机号' },
    },
    { title: '账号 ID', dataIndex: 'id', hideInSearch: true, width: 110, render: (_, r) => <span title={r.id}>{shortId(r.id)}</span> },
    { title: '昵称', dataIndex: 'nickname', hideInSearch: true, ellipsis: true },
    {
      title: '手机号',
      dataIndex: 'phoneMasked',
      hideInSearch: true,
      width: 130,
      render: (_, r) => r.phoneMasked ?? r.phone ?? '-',
    },
    {
      title: '注册渠道',
      dataIndex: 'registerChannel',
      hideInSearch: true,
      width: 110,
      render: (_, r) => registerChannelText(r.registerChannel),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      valueEnum: accountStatusEnum,
      render: (_, r) => {
        const m = accountStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    { title: '成员数', dataIndex: 'memberCount', hideInSearch: true, width: 80, render: (_, r) => r.memberCount ?? '-' },
    {
      title: '注册时间',
      dataIndex: 'registeredAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.registeredAt),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.lastLoginAt),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
            详情
          </Button>
          {record.status === 'frozen' ? (
            <Popconfirm title={`确认解冻账号「${record.nickname}」？`} onConfirm={() => doUnfreeze(record)}>
              <Button type="link" size="small" icon={<UnlockOutlined />}>
                解冻
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
              冻结
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer title="账号管理" subTitle="用户账号（user_account）检索、详情与冻结/解冻">
      <ProTable<AccountItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={toProTable((q) => listAccounts(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? `账号详情 · ${detail.nickname}` : '账号详情'}
        width={560}
        open={!!detail || detailLoading}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        extra={
          detail && detail.status === 'frozen' ? (
            <Popconfirm title="确认解冻该账号？" onConfirm={() => doUnfreeze(detail)}>
              <Button icon={<UnlockOutlined />}>解冻账号</Button>
            </Popconfirm>
          ) : detail && detail.status === 'active' ? (
            <Button danger icon={<LockOutlined />} onClick={() => setFreezeTarget(detail)}>
              冻结账号
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="账号 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="昵称">{detail.nickname}</Descriptions.Item>
              <Descriptions.Item label="手机号">{detail.phoneMasked ?? detail.phone ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={accountStatusMeta(detail.status).color}>
                  {accountStatusMeta(detail.status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="注册渠道">{registerChannelText(detail.registerChannel)}</Descriptions.Item>
              <Descriptions.Item label="注册时间">{fmtDateTime(detail.registeredAt)}</Descriptions.Item>
              <Descriptions.Item label="最近登录">{fmtDateTime(detail.lastLoginAt)}</Descriptions.Item>
              <Descriptions.Item label="时区">{detail.timezone ?? '-'}</Descriptions.Item>
              {detail.cancelApplyAt && (
                <Descriptions.Item label="注销申请">{fmtDateTime(detail.cancelApplyAt)}</Descriptions.Item>
              )}
              {detail.cancelReason && (
                <Descriptions.Item label="注销原因">{detail.cancelReason}</Descriptions.Item>
              )}
              {detail.oauthBindings && detail.oauthBindings.length > 0 && (
                <Descriptions.Item label="第三方绑定">
                  {detail.oauthBindings.map((b) => b.provider).join('、')}
                </Descriptions.Item>
              )}
            </Descriptions>
            <h4 style={{ margin: '20px 0 8px' }}>旗下成员（{detail.members?.length ?? 0}）</h4>
            <List
              size="small"
              bordered
              dataSource={detail.members ?? []}
              locale={{ emptyText: '暂无成员' }}
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
        title={freezeTarget ? `冻结账号 · ${freezeTarget.nickname}` : '冻结账号'}
        open={!!freezeTarget}
        onOpenChange={(open) => {
          if (!open) setFreezeTarget(null);
        }}
        width={440}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!freezeTarget) return false;
          await freezeAccount(freezeTarget.id, values.reason);
          message.success(`账号「${freezeTarget.nickname}」已冻结`);
          setFreezeTarget(null);
          actionRef.current?.reload();
          if (detail?.id === freezeTarget.id) setDetail(await getAccount(freezeTarget.id));
          return true;
        }}
      >
        <p style={{ color: token.colorTextSecondary }}>
          冻结后该账号将无法登录与接收提醒，旗下成员计划同步暂停投递。冻结原因将写入审计日志。
        </p>
        <ProFormTextArea name="reason" label="冻结原因" fieldProps={{ rows: 3, maxLength: 200 }} />
      </ModalForm>
    </PageContainer>
  );
}
