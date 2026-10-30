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
  theme as antdTheme,
  type TableColumnsType,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createArticle, deleteArticle, listArticles, updateArticle } from '../../api/admin';
import type { ArticleItem } from '../../api/types';
import { LOCALES, articleStatusMeta, localeText } from '../../constants/labels';
import { fmtDateTime, shortId } from '../../utils/format';
import { tr, useT } from '../../i18n';

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

function statusOptions(): { value: string; label: string }[] {
  return [
    { value: 'draft', label: tr('enum.articleStatus.draft') },
    { value: 'published', label: tr('enum.articleStatus.published') },
    { value: 'offline', label: tr('enum.articleStatus.offline') },
  ];
}

/** 文章多语言内容组：同一 contentGroupId 下简/繁/英三行，发布状态按语言独立 */
export default function ArticlesTab() {
  const t = useT();
  const [rows, setRows] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ArticleGroupRow | 'new' | null>(null);
  /* 阶段 2：色值一律读 AntD token。 */
  const { token } = antdTheme.useToken();
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
      const tasks: (() => Promise<unknown>)[] = [];

      for (const locale of LOCALES) {
        const lv = values.locales[locale];
        const existing = editing !== 'new' ? editing?.locales[locale] : undefined;
        const hasContent = !!(lv && (lv.title?.trim() || lv.body?.trim()));

        if (!hasContent) {
          if (existing) {
            tasks.push(() => deleteArticle(existing.id));
          }
          continue;
        }

        const buildPayload = (gid?: string) => ({
          title: lv.title?.trim() ?? '',
          body: lv.body ?? '',
          category: values.category,
          locale,
          status: lv.status,
          ...(gid ? { contentGroupId: gid } : {}),
        });

        if (existing) {
          tasks.push(() => updateArticle(existing.id, buildPayload(groupId)));
        } else if (!groupId) {
          const created = await createArticle(buildPayload(undefined));
          groupId = created.contentGroupId;
        } else {
          tasks.push(() => createArticle(buildPayload(groupId)));
        }
      }

      if (tasks.length > 0) {
        await Promise.all(tasks.map((fn) => fn()));
      }
      message.success(t('cnt.groupSaved'));
      setEditing(null);
      await reload();
    } catch {
      /* 错误已由 request.ts 全局提示 */
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = (group: ArticleGroupRow) => {
    Modal.confirm({
      title: t('cnt.deleteGroupTitle'),
      content: t('cnt.deleteGroupContent'),
      okType: 'danger',
      onOk: async () => {
        await Promise.all(
          Object.values(group.locales)
            .filter((i): i is ArticleItem => !!i)
            .map((i) => deleteArticle(i.id)),
        );
        message.success(t('cnt.groupDeleted'));
        await reload();
      },
    });
  };

  const columns: TableColumnsType<ArticleGroupRow> = [
    {
      title: t('cnt.group'),
      dataIndex: 'contentGroupId',
      width: 120,
      render: (v: string) => <span title={v}>{shortId(v)}</span>,
    },
    { title: t('cnt.category'), dataIndex: 'category', width: 120 },
    {
      title: t('cnt.repTitle'),
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
        if (!item) return <span style={{ color: token.colorTextSecondary }}>{t('cnt.notCreated')}</span>;
        const m = articleStatusMeta(item.status);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    })),
    {
      title: t('common.updatedAt'),
      dataIndex: 'updatedAt',
      width: 150,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 150,
      render: (_, g) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(g)}>
            {t('cnt.edit')}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeGroup(g)}
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>
          {t('cnt.newGroup')}
        </Button>
      </div>
      <Table<ArticleGroupRow>
        rowKey="contentGroupId"
        columns={columns}
        dataSource={groups}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Modal
        title={editing === 'new' ? t('cnt.newGroupTitle') : t('cnt.editGroupTitle')}
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
            label={t('cnt.category')}
            rules={[{ required: true, message: t('cnt.categoryRequired') }]}
          >
            <Input placeholder={t('cnt.categoryPlaceholder')} />
          </Form.Item>
          <Tabs
            items={LOCALES.map((locale) => ({
              key: locale,
              label: localeText(locale),
              forceRender: true,
              children: (
                <div>
                  <Form.Item name={['locales', locale, 'title']} label={t('cnt.fieldTitle')}>
                    <Input placeholder={t('cnt.titlePlaceholder')} maxLength={200} />
                  </Form.Item>
                  <Form.Item name={['locales', locale, 'body']} label={t('cnt.fieldBody')}>
                    <Input.TextArea rows={10} placeholder={t('cnt.bodyPlaceholder')} />
                  </Form.Item>
                  <Form.Item name={['locales', locale, 'status']} label={t('cnt.publishStatus')}>
                    <Select options={statusOptions()} style={{ width: 200 }} />
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
