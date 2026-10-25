import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  ModalForm,
  ProFormDatePicker,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { Button, Popconfirm, Space, Tag, message, theme as antdTheme } from 'antd';
import dayjs from 'dayjs';
import { useRef, useState } from 'react';
import {
  createConsent,
  deleteConsent,
  listConsents,
  updateConsent,
} from '../../api/admin';
import type { ConsentItem, ConsentUpsertPayload } from '../../api/types';
import {
  consentDocTypeEnum,
  consentDocTypeText,
  consentStatusEnum,
  consentStatusMeta,
  localeText,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDate } from '../../utils/format';

const LOCALE_OPTIONS = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁體中文', value: 'zh-TW' },
  { label: 'English', value: 'en' },
];

/** 协议文档版本管理（consent_document）：按 (doc_type, locale, version) 唯一，版本化发布 */
export default function ConsentsTab() {
  const actionRef = useRef<ActionType>();
  const [editing, setEditing] = useState<ConsentItem | 'new' | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const columns: ProColumns<ConsentItem>[] = [
    {
      title: '关键字',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '标题 / 版本号 / 内容引用' },
    },
    {
      title: '文档类型',
      dataIndex: 'docType',
      width: 130,
      valueEnum: consentDocTypeEnum,
      render: (_, r) => consentDocTypeText(r.docType),
    },
    { title: '版本', dataIndex: 'docVersion', hideInSearch: true, width: 90 },
    {
      title: '语言',
      dataIndex: 'locale',
      hideInSearch: true,
      width: 100,
      render: (_, r) => localeText(r.locale),
    },
    { title: '标题', dataIndex: 'title', hideInSearch: true, ellipsis: true },
    { title: '内容引用', dataIndex: 'contentRef', hideInSearch: true, ellipsis: true },
    {
      title: '生效日期',
      dataIndex: 'effectiveDate',
      hideInSearch: true,
      width: 110,
      render: (_, r) => fmtDate(r.effectiveDate),
    },
    {
      title: '实质变更',
      dataIndex: 'isMaterialChange',
      hideInSearch: true,
      width: 90,
      render: (_, r) =>
        r.isMaterialChange ? <Tag color="red">需重新确认</Tag> : <span style={{ color: token.colorTextSecondary }}>否</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueEnum: consentStatusEnum,
      render: (_, r) => {
        const m = consentStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '发布人',
      dataIndex: 'publisherName',
      hideInSearch: true,
      width: 110,
      render: (_, r) => r.publisherName ?? '-',
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
            title="确认删除该协议版本？"
            onConfirm={async () => {
              await deleteConsent(record.id);
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

  const initialValues =
    editing && editing !== 'new'
      ? {
          docType: editing.docType,
          docVersion: editing.docVersion,
          locale: editing.locale,
          title: editing.title,
          contentRef: editing.contentRef,
          contentSha256: editing.contentSha256 ?? undefined,
          effectiveDate: editing.effectiveDate,
          isMaterialChange: editing.isMaterialChange,
          status: editing.status,
        }
      : { status: 'draft', isMaterialChange: false, locale: 'zh-CN' };

  return (
    <>
      <ProTable<ConsentItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={toProTable((q) => listConsents(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        toolBarRender={() => [
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            新建协议版本
          </Button>,
        ]}
      />

      <ModalForm<ConsentUpsertPayload>
        title={editing === 'new' ? '新建协议版本' : '编辑协议版本'}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        width={560}
        modalProps={{ destroyOnClose: true }}
        initialValues={initialValues}
        onFinish={async (values) => {
          const payload: ConsentUpsertPayload = {
            ...values,
            effectiveDate: dayjs(values.effectiveDate).format('YYYY-MM-DD'),
          };
          if (editing === 'new') {
            await createConsent(payload);
            message.success('协议版本已创建');
          } else if (editing) {
            await updateConsent(editing.id, payload);
            message.success('协议版本已更新');
          }
          setEditing(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect
          name="docType"
          label="文档类型"
          options={Object.entries(consentDocTypeEnum).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
        <ProFormText name="docVersion" label="版本号" placeholder="如 1.2.0" rules={[{ required: true }]} />
        <ProFormSelect name="locale" label="语言" options={LOCALE_OPTIONS} rules={[{ required: true }]} />
        <ProFormText name="title" label="标题" rules={[{ required: true }]} />
        <ProFormText
          name="contentRef"
          label="内容引用（对象存储键 / 内容 ID）"
          rules={[{ required: true }]}
          extra="正文不存数据库主表，此处登记引用与 SHA-256 指纹"
        />
        <ProFormText name="contentSha256" label="内容 SHA-256" fieldProps={{ maxLength: 64 }} />
        <ProFormDatePicker name="effectiveDate" label="生效日期" rules={[{ required: true }]} />
        <ProFormSelect
          name="status"
          label="状态"
          options={Object.entries(consentStatusEnum).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
        <ProFormSwitch
          name="isMaterialChange"
          label="实质变更（须用户重新确认）"
        />
      </ModalForm>
    </>
  );
}
