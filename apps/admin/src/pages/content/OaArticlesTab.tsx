import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Upload,
  message,
  theme as antdTheme,
  type TableColumnsType,
  type UploadProps,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  createOaArticle,
  deleteOaArticle,
  listOaArticles,
  syncOaArticle,
  unsyncOaArticle,
  updateOaArticle,
  uploadOaCover,
} from '../../api/admin';
import type { OaArticleItem, OaArticlePayload } from '../../api/types';
import { fmtDateTime } from '../../utils/format';
import { tr, useT } from '../../i18n';

function syncMeta(): Record<OaArticleItem['syncState'], { color: string; text: string }> {
  return {
    local: { color: 'default', text: tr('oa.syncLocal') },
    synced: { color: 'green', text: tr('oa.syncSynced') },
    dirty: { color: 'orange', text: tr('oa.syncDirty') },
  };
}

/** 与后端 sourceToHtml 同口径的预览转换（先转义再分段） */
function previewHtml(source: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/** 公众号文章：后台写稿 → 同步到公众号草稿箱；发布仍在公众号侧人工点（接口无权限） */
export default function OaArticlesTab() {
  const t = useT();
  /* 2026-10-25 修复：硬编码色值 #999/#eee 改读主题 token（跟随三套主题）。 */
  const { token } = antdTheme.useToken();
  const [rows, setRows] = useState<OaArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<OaArticleItem | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form] = Form.useForm<OaArticlePayload>();
  const contentWatch = Form.useWatch('contentSource', form);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listOaArticles());
    } catch {
      /* 错误已由 request.ts 全局提示 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEdit = (row: OaArticleItem | 'new') => {
    setEditing(row);
    form.setFieldsValue(
      row === 'new'
        ? { title: '', author: t('oa.defaultAuthor'), digest: '', contentSource: '' }
        : {
            title: row.title,
            author: row.author ?? '',
            digest: row.digest ?? '',
            contentSource: row.contentSource,
          },
    );
  };

  const save = async () => {
    let values: OaArticlePayload;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await createOaArticle(values);
        message.success(t('oa.created'));
        setEditing(created);
        void reload();
      } else if (editing) {
        const updated = await updateOaArticle(editing.id, values);
        message.success(t('oa.saved'));
        setEditing(updated);
        void reload();
      }
    } catch {
      /* 错误已由 request.ts 全局提示 */
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: string, fn: () => Promise<unknown>, okText: string) => {
    setBusyId(id);
    try {
      await fn();
      message.success(okText);
      void reload();
    } catch {
      /* 错误已由 request.ts 全局提示 */
    } finally {
      setBusyId(null);
    }
  };

  const coverUpload: UploadProps = {
    accept: 'image/png,image/jpeg,image/gif',
    showUploadList: false,
    beforeUpload: (file) => {
      if (editing === 'new' || !editing) {
        message.warning(t('oa.saveFirstWarn'));
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        message.error(t('oa.coverTooBig'));
        return false;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.split(',')[1] ?? '';
        setBusyId(editing.id);
        try {
          const updated = await uploadOaCover(editing.id, base64, file.type);
          setEditing(updated);
          message.success(t('oa.coverUploaded'));
          void reload();
        } catch {
          /* 错误已由 request.ts 全局提示 */
        } finally {
          setBusyId(null);
        }
      };
      reader.readAsDataURL(file);
      return false;
    },
  };

  const columns: TableColumnsType<OaArticleItem> = [
    {
      title: t('oa.cover'),
      dataIndex: 'coverUrl',
      width: 84,
      render: (url: string | null) =>
        url ? <Image src={url} width={56} height={56} style={{ objectFit: 'cover' }} /> : <Tag>{t('oa.noCover')}</Tag>,
    },
    { title: t('oa.title'), dataIndex: 'title', ellipsis: true },
    { title: t('oa.author'), dataIndex: 'author', width: 100, render: (v: string | null) => v ?? '—' },
    {
      title: t('oa.syncState'),
      dataIndex: 'syncState',
      width: 150,
      render: (s: OaArticleItem['syncState']) => { const m = syncMeta()[s]; return <Tag color={m.color}>{m.text}</Tag>; },
    },
    {
      title: t('oa.lastSynced'),
      dataIndex: 'lastSyncedAt',
      width: 170,
      render: (v: string | null) => (v ? fmtDateTime(v) : '—'),
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 300,
      render: (_, row) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            {t('oa.edit')}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={busyId === row.id}
            disabled={!row.coverMediaId}
            title={!row.coverMediaId ? t('oa.coverFirstTitle') : undefined}
            onClick={() =>
              act(row.id, () => syncOaArticle(row.id), t('oa.syncedToast'))
            }
          >
            {row.syncState === 'local' ? t('oa.sync') : t('oa.resync')}
          </Button>
          {row.wxDraftMediaId && (
            <Popconfirm
              title={t('oa.unsyncConfirm')}
              onConfirm={() => act(row.id, () => unsyncOaArticle(row.id), t('oa.unsynced'))}
            >
              <Button size="small" icon={<RollbackOutlined />} loading={busyId === row.id}>
                {t('oa.unsync')}
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={t('oa.deleteConfirm')}
            onConfirm={() => act(row.id, () => deleteOaArticle(row.id), t('oa.deleted'))}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === row.id}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const editingRow = editing !== 'new' ? editing : null;

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('oa.intro')}
      />
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>
          {t('oa.newArticle')}
        </Button>
      </div>
      <Table<OaArticleItem>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
      />
      <Modal
        title={editing === 'new' ? t('oa.newTitle') : t('oa.editTitle')}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setEditing(null)}>
            {t('common.close')}
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label={t('oa.titleLabel')} rules={[{ required: true, message: t('oa.titleRequired') }, { max: 64 }]}>
            <Input showCount maxLength={64} placeholder={t('oa.titlePlaceholder')} />
          </Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="author" label={t('oa.authorLabel')} style={{ flex: 1 }}>
              <Input maxLength={16} />
            </Form.Item>
            <Form.Item name="digest" label={t('oa.digestLabel')} style={{ flex: 2 }}>
              <Input maxLength={120} showCount />
            </Form.Item>
          </Space>
          <Form.Item label={t('oa.coverLabel')}>
            <Upload {...coverUpload}>
              <Button icon={<CloudUploadOutlined />} loading={editingRow ? busyId === editingRow.id : false}>
                {t('oa.uploadCover')}
              </Button>
            </Upload>
            {editingRow?.coverUrl && (
              <div style={{ marginTop: 8 }}>
                <Image src={editingRow.coverUrl} width={120} />
              </div>
            )}
            {editing === 'new' && <div style={{ marginTop: 8, color: token.colorTextSecondary }}>{t('oa.saveFirstNote')}</div>}
          </Form.Item>
          <Form.Item
            name="contentSource"
            label={t('oa.bodyLabel')}
            rules={[{ required: true, message: t('oa.bodyRequired') }]}
          >
            <Input.TextArea rows={12} placeholder={t('oa.bodyPlaceholder')} />
          </Form.Item>
          <Form.Item label={t('oa.previewLabel')}>
            <div
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                padding: '12px 16px',
                maxHeight: 260,
                overflow: 'auto',
                lineHeight: 1.8,
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml(contentWatch ?? '') }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
