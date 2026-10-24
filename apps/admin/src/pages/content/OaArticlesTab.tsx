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

const SYNC_META: Record<OaArticleItem['syncState'], { color: string; text: string }> = {
  local: { color: 'default', text: '未同步' },
  synced: { color: 'green', text: '已同步到草稿箱' },
  dirty: { color: 'orange', text: '已修改待同步' },
};

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
        ? { title: '', author: '药准时', digest: '', contentSource: '' }
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
        message.success('已创建，继续传封面后可同步到草稿箱');
        setEditing(created);
        void reload();
      } else if (editing) {
        const updated = await updateOaArticle(editing.id, values);
        message.success('已保存');
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
        message.warning('请先保存文章，再上传封面');
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        message.error('封面图片需在 5MB 以内');
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
          message.success('封面已上传到微信素材库');
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
      title: '封面',
      dataIndex: 'coverUrl',
      width: 84,
      render: (url: string | null) =>
        url ? <Image src={url} width={56} height={56} style={{ objectFit: 'cover' }} /> : <Tag>无封面</Tag>,
    },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '作者', dataIndex: 'author', width: 100, render: (v: string | null) => v ?? '—' },
    {
      title: '同步状态',
      dataIndex: 'syncState',
      width: 150,
      render: (s: OaArticleItem['syncState']) => <Tag color={SYNC_META[s].color}>{SYNC_META[s].text}</Tag>,
    },
    {
      title: '最近同步',
      dataIndex: 'lastSyncedAt',
      width: 170,
      render: (v: string | null) => (v ? fmtDateTime(v) : '—'),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 300,
      render: (_, row) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={busyId === row.id}
            disabled={!row.coverMediaId}
            title={!row.coverMediaId ? '先在编辑里上传封面' : undefined}
            onClick={() =>
              act(row.id, () => syncOaArticle(row.id), '已同步到公众号草稿箱，去公众号后台点发布即可')
            }
          >
            {row.syncState === 'local' ? '同步到草稿箱' : '重新同步'}
          </Button>
          {row.wxDraftMediaId && (
            <Popconfirm
              title="撤回后将删除公众号草稿箱中的这篇草稿，本地文章保留。继续？"
              onConfirm={() => act(row.id, () => unsyncOaArticle(row.id), '已撤回同步')}
            >
              <Button size="small" icon={<RollbackOutlined />} loading={busyId === row.id}>
                撤回
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="删除文章？已同步的草稿会一并从草稿箱删除。"
            onConfirm={() => act(row.id, () => deleteOaArticle(row.id), '已删除')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === row.id}>
              删除
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
        message="写稿在这里完成，点「同步到草稿箱」后，去公众号后台（或手机公众号助手）在草稿箱里点发布。发布动作微信不开放接口，必须人工确认；群发每日限 1 次。"
      />
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>
          新建文章
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
        title={editing === 'new' ? '新建公众号文章' : '编辑公众号文章'}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setEditing(null)}>
            关闭
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题（微信上限 64 字）" rules={[{ required: true, message: '请填写标题' }, { max: 64 }]}>
            <Input showCount maxLength={64} placeholder="如：药准时使用指南" />
          </Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="author" label="作者（≤16 字）" style={{ flex: 1 }}>
              <Input maxLength={16} />
            </Form.Item>
            <Form.Item name="digest" label="摘要（可空，空时微信取正文首段）" style={{ flex: 2 }}>
              <Input maxLength={120} showCount />
            </Form.Item>
          </Space>
          <Form.Item label="封面图（微信图文必填，同步前先上传）">
            <Upload {...coverUpload}>
              <Button icon={<CloudUploadOutlined />} loading={editingRow ? busyId === editingRow.id : false}>
                上传封面到微信素材库
              </Button>
            </Upload>
            {editingRow?.coverUrl && (
              <div style={{ marginTop: 8 }}>
                <Image src={editingRow.coverUrl} width={120} />
              </div>
            )}
            {editing === 'new' && <div style={{ marginTop: 8, color: '#999' }}>先点「保存」创建文章，再回编辑上传封面。</div>}
          </Form.Item>
          <Form.Item
            name="contentSource"
            label="正文（纯文本：空行分段，段内回车换行）"
            rules={[{ required: true, message: '请填写正文' }]}
          >
            <Input.TextArea rows={12} placeholder={'第一段……\n\n第二段……'} />
          </Form.Item>
          <Form.Item label="预览（近似公众号排版）">
            <div
              style={{
                border: '1px solid #eee',
                borderRadius: 8,
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
