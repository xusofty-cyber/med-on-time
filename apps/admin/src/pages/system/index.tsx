import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { Button, Popconfirm, Space, Tag, message } from 'antd';
import { useRef, useState } from 'react';
import {
  createAppVersion,
  deleteAppVersion,
  listAppVersions,
  updateAppVersion,
} from '../../api/admin';
import type { AppVersionItem, AppVersionPayload } from '../../api/types';
import {
  appVersionStatusEnum,
  appVersionStatusMeta,
  platformEnum,
  platformText,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDateTime } from '../../utils/format';

/** 校验 URL 协议是否仅为 http: 或 https:（防止 javascript: 伪协议 XSS） */
function safeHttpUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** 系统 · 应用版本管理（app_version）：低于 min_supported_version 的客户端将被强制升级 */
export default function AppVersionsPage() {
  const actionRef = useRef<ActionType>();
  const [editing, setEditing] = useState<AppVersionItem | 'new' | null>(null);

  const columns: ProColumns<AppVersionItem>[] = [
    {
      title: '关键字',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '版本号 / 更新说明' },
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 130,
      valueEnum: platformEnum,
      render: (_, r) => platformText(r.platform),
    },
    { title: '版本', dataIndex: 'version', hideInSearch: true, width: 110 },
    {
      title: '最低支持版本',
      dataIndex: 'minSupportedVersion',
      hideInSearch: true,
      width: 120,
      render: (_, r) => r.minSupportedVersion ?? '-',
    },
    { title: '更新说明', dataIndex: 'releaseNote', hideInSearch: true, ellipsis: true, render: (_, r) => r.releaseNote ?? '-' },
    {
      title: '下载地址',
      dataIndex: 'downloadUrl',
      hideInSearch: true,
      ellipsis: true,
      render: (_, r) => {
        const href = safeHttpUrl(r.downloadUrl);
        if (href) {
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {r.downloadUrl}
            </a>
          );
        }
        return r.downloadUrl ?? '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueEnum: appVersionStatusEnum,
      render: (_, r) => {
        const m = appVersionStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
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
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditing(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该版本记录？"
            onConfirm={async () => {
              await deleteAppVersion(record.id);
              message.success('已删除');
              actionRef.current?.reload();
            }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="应用版本管理"
      subTitle="各端版本发布与强更门槛（app_version，按 平台 + 版本 唯一）"
    >
      <ProTable<AppVersionItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={toProTable((q) => listAppVersions(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        toolBarRender={() => [
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            新建版本
          </Button>,
        ]}
      />

      <ModalForm<AppVersionPayload>
        title={editing === 'new' ? '新建版本' : '编辑版本'}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        width={520}
        modalProps={{ destroyOnClose: true }}
        initialValues={
          editing && editing !== 'new'
            ? {
                platform: editing.platform,
                version: editing.version,
                minSupportedVersion: editing.minSupportedVersion ?? undefined,
                releaseNote: editing.releaseNote ?? undefined,
                downloadUrl: editing.downloadUrl ?? undefined,
                status: editing.status,
              }
            : { status: 'active' }
        }
        onFinish={async (values) => {
          if (editing === 'new') {
            await createAppVersion(values);
            message.success('版本已创建');
          } else if (editing) {
            await updateAppVersion(editing.id, values);
            message.success('版本已更新');
          }
          setEditing(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect
          name="platform"
          label="平台"
          options={Object.entries(platformEnum).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
        <ProFormText name="version" label="版本号" placeholder="如 1.0.0" rules={[{ required: true }]} />
        <ProFormText
          name="minSupportedVersion"
          label="最低支持版本"
          placeholder="低于此版本的客户端将被强制升级"
        />
        <ProFormTextArea name="releaseNote" label="更新说明" fieldProps={{ rows: 3 }} />
        <ProFormText
          name="downloadUrl"
          label="下载地址"
          placeholder="https://"
          rules={[{ type: 'url', pattern: /^https?:\/\//i, message: '请输入以 http:// 或 https:// 开头的合法地址' }]}
        />
        <ProFormSelect
          name="status"
          label="状态"
          options={Object.entries(appVersionStatusEnum).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
      </ModalForm>
    </PageContainer>
  );
}
