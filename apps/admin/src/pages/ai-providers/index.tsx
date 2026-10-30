import {
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  createAiProvider,
  deleteAiProvider,
  listAiProviders,
  testAiProvider,
  updateAiProvider,
} from '../../api/admin';
import type { AiProviderItem, AiProviderPayload } from '../../api/types';
import { fmtDateTime } from '../../utils/format';
import { tr, useT } from '../../i18n';

function capabilityOptions(): { value: string; label: string }[] {
  return [
    { value: 'general', label: tr('ai.cap.general') },
    { value: 'photo_recognize', label: tr('ai.cap.photo_recognize') },
    { value: 'health_qa', label: tr('ai.cap.health_qa') },
  ];
}

function capabilityLabel(v: string): string {
  return capabilityOptions().find((o) => o.value === v)?.label ?? v;
}

interface FormValues {
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey?: string;
  capability: string;
  isActive: boolean;
}

/**
 * 大模型配置（2026-10-24 负责人要求）：模型名称 / API key / 请求 URL 均在后台可配。
 * key 只写不回显（列表仅掩码）；同一 capability 启用一条即生效，调用时先按
 * capability 精确匹配，未命中回落 general。拍照识别须选视觉模型（如 glm-4v-flash）。
 */
export default function AiProvidersPage() {
  const t = useT();
  const [rows, setRows] = useState<AiProviderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiProviderItem | null>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAiProviders());
    } catch {
      /* 错误已由 request.ts 全局提示 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ capability: 'general', isActive: false });
    setModalOpen(true);
  };

  const openEdit = (row: AiProviderItem) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      name: row.name,
      modelName: row.modelName,
      baseUrl: row.baseUrl,
      apiKey: undefined,
      capability: row.capability,
      isActive: row.isActive,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const payload: AiProviderPayload = {
        name: values.name,
        modelName: values.modelName,
        baseUrl: values.baseUrl,
        capability: values.capability,
        isActive: values.isActive,
      };
      if (values.apiKey) payload.apiKey = values.apiKey;
      if (editing) {
        await updateAiProvider(editing.id, payload);
        message.success(t('ai.updated'));
      } else {
        await createAiProvider(payload);
        message.success(t('ai.created'));
      }
      setModalOpen(false);
      void load();
    } catch {
      /* 表单校验未通过或请求异常（request.ts 已全局提示） */
    }
  };

  const toggleActive = async (row: AiProviderItem, next: boolean) => {
    try {
      await updateAiProvider(row.id, { isActive: next });
      message.success(next ? t('ai.activated') : t('ai.deactivated'));
      void load();
    } catch {
      /* 错误已由 request.ts 全局提示 */
    }
  };

  const runTest = async (row: AiProviderItem) => {
    setTestingId(row.id);
    try {
      const res = await testAiProvider(row.id, { silent: true });
      message.success(t('ai.testOk', { model: res.model, ms: res.latencyMs }));
    } catch {
      message.error(t('ai.testFail'));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('ai.alertTitle')}
        description={t('ai.alertDesc')}
      />
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('ai.new')}
        </Button>
      </div>
      <Table<AiProviderItem>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: t('ai.name'), dataIndex: 'name' },
          { title: t('ai.model'), dataIndex: 'modelName' },
          {
            title: t('ai.capability'),
            dataIndex: 'capability',
            render: (v: string) => capabilityLabel(v),
          },
          {
            title: t('ai.baseUrl'),
            dataIndex: 'baseUrl',
            ellipsis: true,
          },
          { title: 'API key', dataIndex: 'apiKeyMasked' },
          {
            title: t('ai.active'),
            dataIndex: 'isActive',
            render: (v: boolean, row) => (
              <Space>
                <Switch
                  checked={v}
                  onChange={(next) => void toggleActive(row, next)}
                />
                {v ? <Tag color="green">{t('ai.activeTag')}</Tag> : <Tag>{t('ai.inactiveTag')}</Tag>}
              </Space>
            ),
          },
          {
            title: t('common.updatedAt'),
            dataIndex: 'updatedAt',
            render: (v: string) => fmtDateTime(v),
          },
          {
            title: t('common.actions'),
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  loading={testingId === row.id}
                  onClick={() => void runTest(row)}
                >
                  {t('ai.test')}
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(row)}
                >
                  {t('cnt.edit')}
                </Button>
                <Popconfirm
                  title={t('ai.deleteConfirm')}
                  onConfirm={async () => {
                    try {
                      await deleteAiProvider(row.id);
                      message.success(t('ai.deleted'));
                      void load();
                    } catch {
                      /* 错误已由 request.ts 全局提示 */
                    }
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? t('ai.editTitle') : t('ai.newTitle')}
        open={modalOpen}
        onOk={() => void submit()}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('ai.name')}
            rules={[{ required: true, message: t('ai.nameRequired') }]}
          >
            <Input placeholder={t('ai.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="modelName"
            label={t('ai.modelName')}
            rules={[{ required: true, message: t('ai.modelRequired') }]}
          >
            <Input placeholder={t('ai.modelPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label={t('ai.baseUrl')}
            rules={[{ required: true, message: t('ai.baseUrlRequired') }]}
          >
            <Input placeholder={t('ai.baseUrlPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API key"
            rules={
              editing
                ? []
                : [{ required: true, message: t('ai.keyRequired') }]
            }
            extra={editing ? t('ai.keyKeepHint') : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="capability" label={t('ai.capability')}>
            <Select options={capabilityOptions()} />
          </Form.Item>
          <Form.Item name="isActive" label={t('ai.setActive')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
