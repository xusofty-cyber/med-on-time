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
import { tr, useT } from '../../i18n';

function localeOptions(): { label: string; value: string }[] {
  return [
    { label: tr('common.langZhCN'), value: 'zh-CN' },
    { label: tr('common.langZhTW'), value: 'zh-TW' },
    { label: tr('common.langEn'), value: 'en' },
  ];
}

/** 协议文档版本管理（consent_document）：按 (doc_type, locale, version) 唯一，版本化发布 */
export default function ConsentsTab() {
  const t = useT();
  const actionRef = useRef<ActionType>();
  const [editing, setEditing] = useState<ConsentItem | 'new' | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();

  const columns: ProColumns<ConsentItem>[] = [
    {
      title: t('cons.keyword'),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: t('cons.keywordPlaceholder') },
    },
    {
      title: t('cons.docType'),
      dataIndex: 'docType',
      width: 130,
      valueEnum: consentDocTypeEnum(),
      render: (_, r) => consentDocTypeText(r.docType),
    },
    { title: t('cons.version'), dataIndex: 'docVersion', hideInSearch: true, width: 90 },
    {
      title: t('cons.language'),
      dataIndex: 'locale',
      hideInSearch: true,
      width: 100,
      render: (_, r) => localeText(r.locale),
    },
    { title: t('cons.title'), dataIndex: 'title', hideInSearch: true, ellipsis: true },
    { title: t('cons.contentRef'), dataIndex: 'contentRef', hideInSearch: true, ellipsis: true },
    {
      title: t('cons.effectiveDate'),
      dataIndex: 'effectiveDate',
      hideInSearch: true,
      width: 110,
      render: (_, r) => fmtDate(r.effectiveDate),
    },
    {
      title: t('cons.material'),
      dataIndex: 'isMaterialChange',
      hideInSearch: true,
      width: 90,
      render: (_, r) =>
        r.isMaterialChange ? <Tag color="red">{t('cons.needReconfirm')}</Tag> : <span style={{ color: token.colorTextSecondary }}>{t('common.no')}</span>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      valueEnum: consentStatusEnum(),
      render: (_, r) => {
        const m = consentStatusMeta(r.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: t('cons.publisher'),
      dataIndex: 'publisherName',
      hideInSearch: true,
      width: 110,
      render: (_, r) => r.publisherName ?? '-',
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
            title={t('cons.deleteConfirm')}
            onConfirm={async () => {
              await deleteConsent(record.id);
              message.success(t('cons.deleted'));
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
            {t('cons.newVersion')}
          </Button>,
        ]}
      />

      <ModalForm<ConsentUpsertPayload>
        title={editing === 'new' ? t('cons.newTitle') : t('cons.editTitle')}
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
            message.success(t('cons.created'));
          } else if (editing) {
            await updateConsent(editing.id, payload);
            message.success(t('cons.updated'));
          }
          setEditing(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect
          name="docType"
          label={t('cons.docType')}
          options={Object.entries(consentDocTypeEnum()).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
        <ProFormText name="docVersion" label={t('cons.version')} placeholder={t('cons.versionPlaceholder')} rules={[{ required: true }]} />
        <ProFormSelect name="locale" label={t('cons.language')} options={localeOptions()} rules={[{ required: true }]} />
        <ProFormText name="title" label={t('cons.title')} rules={[{ required: true }]} />
        <ProFormText
          name="contentRef"
          label={t('cons.contentRefLabel')}
          rules={[{ required: true }]}
          extra={t('cons.contentRefExtra')}
        />
        <ProFormText name="contentSha256" label={t('cons.contentSha256')} fieldProps={{ maxLength: 64 }} />
        <ProFormDatePicker name="effectiveDate" label={t('cons.effectiveDate')} rules={[{ required: true }]} />
        <ProFormSelect
          name="status"
          label={t('common.status')}
          options={Object.entries(consentStatusEnum()).map(([value, v]) => ({ value, label: v.text }))}
          rules={[{ required: true }]}
        />
        <ProFormSwitch
          name="isMaterialChange"
          label={t('cons.materialLabel')}
        />
      </ModalForm>
    </>
  );
}
