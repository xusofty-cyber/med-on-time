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
import { useT } from '../../i18n';

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
  const t = useT();
  const actionRef = useRef<ActionType>();
  const [editing, setEditing] = useState<AppVersionItem | 'new' | null>(null);

  const columns: ProColumns<AppVersionItem>[] = [
    {
      title: t('sys.keyword'),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: t('sys.keywordPlaceholder') },
    },
    {
      title: t('sys.platform'),
      dataIndex: 'platform',
      width: 130,
      valueEnum: platformEnum(),
      render: (_, r) => platformText(r.platform),
    },
    { title: t('sys.version'), dataIndex: 'version', hideInSearch: true, width: 110 },
    {
      title: t('sys.minVersion'),
      dataIndex: 'minSupportedVersion',
      hideInSearch: true,
      width: 120,
      render: (_, r) => r.minSupportedVersion ?? '-',
    },
    { title: t('sys.releaseNote'), dataIndex: 'releaseNote', hideInSearch: true, ellipsis: true, render: (_, r) => r.releaseNote ?? '-' },
    {
      title: t('sys.downloadUrl'),
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
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      valueEnum: appVersionStatusEnum(),
      render: (_, r) => {
        const m = appVersionStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
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
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditing(record)}>
            {t('cnt.edit')}
          </Button>
          <Popconfirm
            title={t('sys.deleteConfirm')}
            onConfirm={async () => {
              await deleteAppVersion(record.id);
              message.success(t('sys.deleted'));
              actionRef.current?.reload();
            }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={t('sys.title')}
      subTitle={t('sys.subTitle')}
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
            {t('sys.newVersion')}
          </Button>,
        ]}
      />

      <ModalForm<AppVersionPayload>
        title={editing === 'new' ? t('sys.newTitle') : t('sys.editTitle')}
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
            message.success(t('sys.created'));
          } else if (editing) {
            await updateAppVersion(editing.id, values);
            message.success(t('sys.updated'));
          }
          setEditing(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect
          name="platform"
          label={t('sys.platform')}
          options={Object.entries(platformEnum()).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
        <ProFormText name="version" label={t('sys.version')} placeholder={t('sys.versionPlaceholder')} rules={[{ required: true }]} />
        <ProFormText
          name="minSupportedVersion"
          label={t('sys.minVersion')}
          placeholder={t('sys.minVersionPlaceholder')}
        />
        <ProFormTextArea name="releaseNote" label={t('sys.releaseNote')} fieldProps={{ rows: 3 }} />
        <ProFormText
          name="downloadUrl"
          label={t('sys.downloadUrl')}
          placeholder={t('sys.urlPlaceholder')}
          rules={[{ type: 'url', pattern: /^https?:\/\//i, message: t('sys.urlInvalid') }]}
        />
        <ProFormSelect
          name="status"
          label={t('common.status')}
          options={Object.entries(appVersionStatusEnum()).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
      </ModalForm>
    </PageContainer>
  );
}
