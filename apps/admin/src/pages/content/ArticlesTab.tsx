import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  message,
  type TableColumnsType,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createArticle, deleteArticle, listArticles, updateArticle } from '../../api/admin';
import type { ArticleItem } from '../../api/types';
import { LOCALES, articleStatusMeta, localeText } from '../../constants/labels';
import { fmtDateTime, shortId } from '../../utils/format';

interface ArticleGroupRow {
  contentGroupId: string;
  category: string;
  locales: Partial<Record<string, ArticleItem>>;
  updatedAt: string;
}

interface LocaleFormValues {
  title?: string;
  body?: string;
  status: string;
}

interface GroupFormValues {
  category: string;
  locales: Record<string, LocaleFormValues>;
}

const STATUS_OPTIONS = Object.entries({
  draft: '草稿',
  published: '已发布',
  offline: '已下线',
}).map(([value, label]) => ({ value, label }));

/** 文章多语言内容组：同一 contentGroupId 下简/繁/英三行，发布状态按语言独立 */
export default function ArticlesTab() {
  const [rows, setRows] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ArticleGroupRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<GroupFormValues>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const all: ArticleItem[] = [];
      let page = 1;
      let total = Number.POSITIVE_INFINITY;
      while (all.length < total && page <= 50) {
        const data = await listArticles({ page, pageSize: 100 });
        all.push(...data.items);
        total = data.total;
        page += 1;
      }
      setRows(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groups = useMemo<ArticleGroupRow[]>(() => {
    const map = new Map<string, ArticleGroupRow>();
    rows.forEach((item) => {
      const group = map.get(item.contentGroupId) ?? {
        contentGroupId: item.contentGroupId,
        category: item.category,
        locales: {},
        updatedAt: item.updatedAt,
      };
      group.locales[item.locale] = item;
      if (item.updatedAt > group.updatedAt) group.updatedAt = item.updatedAt;
      map.set(item.contentGroupId, group);
    });
    return [...map.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [rows]);

  const openEdit = (group: ArticleGroupRow | 'new') => {
    setEditing(group);
    const locales: Record<string, LocaleFormValues> = {};
    LOCALES.forEach((locale) => {
      const item = group === 'new' ? undefined : group.locales[locale];
      locales[locale] = {
        title: item?.title ?? '',
        body: item?.body ?? '',
        status: item?.status ?? 'draft',
      };
    });
    form.setFieldsValue({
      category: group === 'new' ? '' : group.category,
      locales,
    });
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      let groupId = editing === 'new' ? undefined : editing?.contentGroupId;
      for (const locale of LOCALES) {
        const lv = values.locales[locale];
        if (!lv || (!lv.title?.trim() && !lv.body?.trim())) continue;
        const existing = editing !== 'new' ? editing?.locales[locale] : undefined;
        const payload = {
          title: lv.title?.trim() ?? '',
          body: lv.body ?? '',
          category: values.category,
          locale,
          status: lv.status,
          ...(groupId ? { contentGroupId: groupId } : {}),
        };
        if (existing) {
          await updateArticle(existing.id, payload);
        } else {
          const created = await createArticle(payload);
          groupId = created.contentGroupId;
        }
      }
      message.success('内容组已保存');
      setEditing(null);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = (group: ArticleGroupRow) => {
    Modal.confirm({
      title: '删除整个内容组？',
      content: '将删除该内容组下全部语言版本，此操作不可恢复。',
      okType: 'danger',
      onOk: async () => {
        await Promise.all(
          Object.values(group.locales)
            .filter((i): i is ArticleItem => !!i)
            .map((i) => deleteArticle(i.id)),
        );
        message.success('内容组已删除');
        await reload();
      },
    });
  };

  const columns: TableColumnsType<ArticleGroupRow> = [
    {
      title: '内容组',
      dataIndex: 'contentGroupId',
      width: 120,
      render: (v: string) => <span title={v}>{shortId(v)}</span>,
    },
    { title: '分类', dataIndex: 'category', width: 120 },
    {
      title: '代表标题',
      key: 'title',
      ellipsis: true,
      render: (_, g) =>
        g.locales['zh-CN']?.title ?? g.locales['zh-TW']?.title ?? g.locales.en?.title ?? '-',
    },
    ...LOCALES.map((locale) => ({
      title: localeText(locale),
      key: locale,
      width: 120,
      render: (_: unknown, g: ArticleGroupRow) => {
        const item = g.locales[locale];
        if (!item) return <span style={{ color: '#bfbfbf' }}>未创建</span>;
        const m = articleStatusMeta(item.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    })),
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 150,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, g) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(g)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeGroup(g)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>
          新建内容组
        </Button>
      </div>
      <Table<ArticleGroupRow>
        rowKey="contentGroupId"
        columns={columns}
        dataSource={groups}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Modal
        title={editing === 'new' ? '新建内容组' : '编辑内容组'}
        open={!!editing}
        width={860}
        onCancel={() => setEditing(null)}
        onOk={save}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请输入分类（如：用药知识 / 公告 / 帮助）' }]}
          >
            <Input placeholder="用药知识 / 公告 / 帮助" />
          </Form.Item>
          <Tabs
            items={LOCALES.map((locale) => ({
              key: locale,
              label: localeText(locale),
              forceRender: true,
              children: (
                <div>
                  <Form.Item name={['locales', locale, 'title']} label="标题">
                    <Input placeholder="该语言暂不创建时留空" maxLength={200} />
                  </Form.Item>
                  <Form.Item name={['locales', locale, 'body']} label="正文（HTML）">
                    <Input.TextArea rows={10} placeholder="富文本正文（HTML，入库前由后端做 XSS 清洗）" />
                  </Form.Item>
                  <Form.Item name={['locales', locale, 'status']} label="发布状态">
                    <Select options={STATUS_OPTIONS} style={{ width: 200 }} />
                  </Form.Item>
                </div>
              ),
            }))}
          />
        </Form>
      </Modal>
    </Spin>
  );
}
