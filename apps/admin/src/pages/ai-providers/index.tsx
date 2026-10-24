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

const CAPABILITY_OPTIONS = [
  { value: 'general', label: '通用（general）' },
  { value: 'photo_recognize', label: '拍照识别（photo_recognize）' },
  { value: 'health_qa', label: '健康问答（health_qa）' },
];

const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(
  CAPABILITY_OPTIONS.map((o) => [o.value, o.label]),
);

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
        message.success('配置已更新');
      } else {
        await createAiProvider(payload);
        message.success('配置已创建');
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
      message.success(next ? '已设为生效配置' : '已停用');
      void load();
    } catch {
      /* 错误已由 request.ts 全局提示 */
    }
  };

  const runTest = async (row: AiProviderItem) => {
    setTestingId(row.id);
    try {
      const res = await testAiProvider(row.id, { silent: true });
      message.success(`连接成功：${res.model}，延迟 ${res.latencyMs}ms`);
    } catch {
      message.error('连接失败，请检查 URL、key 与模型名');
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
        message="大模型接入配置"
        description="填写 OpenAI 兼容的请求 URL（如 https://open.bigmodel.cn/api/paas/v4）、模型名称与 API key。同一用途（capability）只有一条「生效」配置会被调用；拍照识别请单独配一条 photo_recognize 并选视觉模型（如 glm-4v-flash），未配时自动回落通用配置。API key 加密存储，页面只显示掩码。"
      />
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增配置
        </Button>
      </div>
      <Table<AiProviderItem>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '模型', dataIndex: 'modelName' },
          {
            title: '用途',
            dataIndex: 'capability',
            render: (v: string) => CAPABILITY_LABEL[v] ?? v,
          },
          {
            title: '请求 URL',
            dataIndex: 'baseUrl',
            ellipsis: true,
          },
          { title: 'API key', dataIndex: 'apiKeyMasked' },
          {
            title: '生效',
            dataIndex: 'isActive',
            render: (v: boolean, row) => (
              <Space>
                <Switch
                  checked={v}
                  onChange={(next) => void toggleActive(row, next)}
                />
                {v ? <Tag color="green">生效中</Tag> : <Tag>未启用</Tag>}
              </Space>
            ),
          },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            render: (v: string) => fmtDateTime(v),
          },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  loading={testingId === row.id}
                  onClick={() => void runTest(row)}
                >
                  测试连接
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(row)}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="删除该配置？"
                  onConfirm={async () => {
                    try {
                      await deleteAiProvider(row.id);
                      message.success('已删除');
                      void load();
                    } catch {
                      /* 错误已由 request.ts 全局提示 */
                    }
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑大模型配置' : '新增大模型配置'}
        open={modalOpen}
        onOk={() => void submit()}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请填写名称' }]}
          >
            <Input placeholder="如：智谱 GLM" />
          </Form.Item>
          <Form.Item
            name="modelName"
            label="模型名称"
            rules={[{ required: true, message: '请填写模型名称' }]}
          >
            <Input placeholder="如：glm-4-flash / glm-4v-flash" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="请求 URL"
            rules={[{ required: true, message: '请填写请求 URL' }]}
          >
            <Input placeholder="如：https://open.bigmodel.cn/api/paas/v4" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API key"
            rules={
              editing
                ? []
                : [{ required: true, message: '请填写 API key' }]
            }
            extra={editing ? '留空表示不更换现有 key' : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="capability" label="用途">
            <Select options={CAPABILITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="isActive" label="设为生效" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
