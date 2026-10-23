import {
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProFormSelect,
  ProFormTextArea,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Modal,
  Segmented,
  Space,
  Steps,
  Tag,
  message,
} from 'antd';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDrug, importDrugSeed, listDrugs, reviewDrug } from '../../api/admin';
import type { DrugItem, ImportSeedResult } from '../../api/types';
import {
  dosageFormText,
  drugReviewMeta,
  drugSourceText,
} from '../../constants/labels';
import { toProTable } from '../../services/request';
import { fmtDateTime, prettyJson } from '../../utils/format';

const STATUS_KEYS = ['all', 'pending_review', 'approved', 'rejected', 'draft', 'off_shelf'] as const;

/** 药品库管理：按核验状态过滤 + 说明书全字段详情 + 双人核验（初核/复核两段） + seed 导入 */
export default function DrugsPage() {
  const [searchParams] = useSearchParams();
  const actionRef = useRef<ActionType>();
  const [reviewStatus, setReviewStatus] = useState<string>(
    searchParams.get('reviewStatus') ?? 'all',
  );
  const [detail, setDetail] = useState<DrugItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<DrugItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSeedResult | null>(null);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await getDrug(id));
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: string) => {
    setDetail(await getDrug(id));
  };

  const doImport = () => {
    Modal.confirm({
      title: '导入药品 seed 数据',
      content:
        '将调用 POST /admin/drugs/import-seed 导入 drug_seed_200.json（200 条）。其中待核验（pending_review）条目会以未发布状态入库，需双人核验通过后才对用户可见。',
      okText: '开始导入',
      onOk: async () => {
        setImporting(true);
        try {
          const result = await importDrugSeed();
          setImportResult(result);
          actionRef.current?.reload();
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const columns: ProColumns<DrugItem>[] = [
    {
      title: '关键字',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '通用名 / 商品名 / 企业 / 批准文号' },
    },
    { title: '通用名', dataIndex: 'genericName', hideInSearch: true, ellipsis: true },
    { title: '商品名', dataIndex: 'brandName', hideInSearch: true, ellipsis: true, render: (_, r) => r.brandName ?? '-' },
    { title: '生产企业', dataIndex: 'manufacturer', hideInSearch: true, ellipsis: true, render: (_, r) => r.manufacturer ?? '-' },
    { title: '批准文号', dataIndex: 'approvalNumber', hideInSearch: true, width: 130, render: (_, r) => r.approvalNumber ?? '-' },
    {
      title: '剂型 / 规格',
      dataIndex: 'specification',
      hideInSearch: true,
      width: 170,
      render: (_, r) => `${dosageFormText(r.dosageForm)} · ${r.specification}${r.unit}`,
    },
    {
      title: '来源',
      dataIndex: 'sourceType',
      hideInSearch: true,
      width: 100,
      render: (_, r) => drugSourceText(r.sourceType),
    },
    {
      title: '核验状态',
      dataIndex: 'reviewStatus',
      hideInSearch: true,
      width: 110,
      render: (_, r) => {
        const m = drugReviewMeta(r.reviewStatus);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '核验进度',
      dataIndex: 'reviewStage',
      hideInSearch: true,
      width: 130,
      render: (_, r) => {
        if (r.reviewStatus !== 'pending_review') return '-';
        const stage = r.review?.stage;
        if (stage === 'verify') return <Tag color="blue">初核已过 · 待复核</Tag>;
        if (stage === 'review') return <Tag color="orange">待初核</Tag>;
        return <Tag color="orange">待核验</Tag>;
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.updatedAt),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
            详情
          </Button>
          {record.reviewStatus === 'pending_review' && (
            <Button type="link" size="small" onClick={() => { setDetail(null); setReviewTarget(record); }}>
              核验
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const reviewStageOf = (drug: DrugItem): 'review' | 'verify' =>
    drug.review?.reviewer?.at ? 'verify' : 'review';

  return (
    <PageContainer
      title="药品库管理"
      subTitle="平台药品主数据（drug）：说明书维护、双人核验发布、seed 批量导入"
      extra={
        <Button type="primary" icon={<ImportOutlined />} loading={importing} onClick={doImport}>
          导入 seed 药品库
        </Button>
      }
    >
      {importResult && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setImportResult(null)}
          style={{ marginBottom: 16 }}
          message="seed 导入完成"
          description={
            <span>
              共 {importResult.total ?? importResult.imported} 条：新导入 {importResult.imported} 条
              {importResult.updated !== undefined && `，更新 ${importResult.updated} 条`}
              {importResult.skipped !== undefined && `，跳过 ${importResult.skipped} 条`}
              {importResult.pendingUnpublished !== undefined &&
                `；其中 ${importResult.pendingUnpublished} 条为待核验，已置未发布`}
              {importResult.message ? `。${importResult.message}` : ''}
            </span>
          }
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={reviewStatus}
          onChange={(v) => setReviewStatus(String(v))}
          options={STATUS_KEYS.map((key) => ({
            value: key,
            label:
              key === 'all' ? '全部' : drugReviewMeta(key).text,
          }))}
        />
      </div>

      <ProTable<DrugItem>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        params={{ reviewStatus: reviewStatus === 'all' ? undefined : reviewStatus }}
        request={toProTable((q) => listDrugs(q))}
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
      />

      <Drawer
        title={detail ? `药品详情 · ${detail.genericName}` : '药品详情'}
        width={760}
        open={!!detail || detailLoading}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        extra={
          detail?.reviewStatus === 'pending_review' ? (
            <Button type="primary" onClick={() => setReviewTarget(detail)}>
              执行核验
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <>
            <Descriptions column={2} bordered size="small" title="基本信息">
              <Descriptions.Item label="通用名">{detail.genericName}</Descriptions.Item>
              <Descriptions.Item label="商品名">{detail.brandName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="生产企业">{detail.manufacturer ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="批准文号">{detail.approvalNumber ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="条形码">{detail.barcode ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="分类">{detail.categoryName ?? detail.categoryId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="剂型">{dosageFormText(detail.dosageForm)}</Descriptions.Item>
              <Descriptions.Item label="规格">{detail.specification}</Descriptions.Item>
              <Descriptions.Item label="包装">{detail.packageDesc ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="最小单位">{detail.unit}</Descriptions.Item>
              <Descriptions.Item label="OTC">{detail.isOtc ? '是（非处方药）' : '否（处方药）'}</Descriptions.Item>
              <Descriptions.Item label="来源">{drugSourceText(detail.sourceType)}</Descriptions.Item>
              <Descriptions.Item label="核验状态">
                <Tag color={drugReviewMeta(detail.reviewStatus).color}>
                  {drugReviewMeta(detail.reviewStatus).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">{fmtDateTime(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>

            <h4 style={{ margin: '20px 0 8px' }}>双人核验进度</h4>
            <Steps
              size="small"
              current={
                detail.reviewStatus === 'approved'
                  ? 2
                  : detail.review?.reviewer?.at
                    ? 1
                    : 0
              }
              status={detail.reviewStatus === 'rejected' ? 'error' : undefined}
              items={[
                {
                  title: '初核（reviewer）',
                  description: detail.review?.reviewer?.at
                    ? `${detail.review.reviewer.adminName ?? '核验员'} · ${fmtDateTime(detail.review.reviewer.at)}${detail.review.reviewer.comment ? ` · ${detail.review.reviewer.comment}` : ''}`
                    : '待初核',
                },
                {
                  title: '复核（verifier）',
                  description: detail.review?.verifier?.at
                    ? `${detail.review.verifier.adminName ?? '复核员'} · ${fmtDateTime(detail.review.verifier.at)}${detail.review.verifier.comment ? ` · ${detail.review.verifier.comment}` : ''}`
                    : '待复核（须与初核为不同管理员）',
                },
                {
                  title: detail.reviewStatus === 'rejected' ? '已驳回' : '发布',
                  description:
                    detail.reviewStatus === 'approved'
                      ? '双人核验通过，已对用户可见'
                      : detail.reviewStatus === 'rejected'
                        ? '任一段驳回即退回，修正后重新提交'
                        : '双人核验通过后自动发布',
                },
              ]}
            />

            <h4 style={{ margin: '20px 0 8px' }}>说明书</h4>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="适应症">
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.efficacy ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="用法用量">
                <span style={{ whiteSpace: 'pre-wrap' }}>{prettyJson(detail.usageDefault)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="禁忌">
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.contraindications ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="不良反应">
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.adverseReactions ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="药物相互作用">
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.interactions ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="贮藏条件">{detail.storageCondition ?? '-'}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <ModalForm<{ stage: 'review' | 'verify'; decision: 'approved' | 'rejected'; comment?: string }>
        title={reviewTarget ? `药品核验 · ${reviewTarget.genericName}` : '药品核验'}
        open={!!reviewTarget}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null);
        }}
        width={480}
        modalProps={{ destroyOnClose: true }}
        initialValues={reviewTarget ? { stage: reviewStageOf(reviewTarget) } : undefined}
        onFinish={async (values) => {
          if (!reviewTarget) return false;
          if (values.decision === 'rejected' && !values.comment?.trim()) {
            message.error('驳回时必须填写核验意见');
            return false;
          }
          const updated = await reviewDrug(reviewTarget.id, values);
          message.success(
            values.decision === 'approved'
              ? values.stage === 'verify'
                ? '复核通过，药品已发布'
                : '初核通过，等待第二位管理员复核'
              : '已驳回该药品',
          );
          setReviewTarget(null);
          actionRef.current?.reload();
          if (detail?.id === updated.id) void refreshDetail(updated.id);
          return true;
        }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="双人核验：初核与复核必须由两名不同管理员完成，任一段驳回即退回修正。"
        />
        <ProFormSelect
          name="stage"
          label="核验阶段"
          options={[
            { label: '初核（reviewer）', value: 'review' },
            { label: '复核（verifier）', value: 'verify' },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="decision"
          label="核验结论"
          options={[
            { label: '通过', value: 'approved', icon: <CheckOutlined /> },
            { label: '驳回', value: 'rejected', icon: <CloseOutlined /> },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormTextArea
          name="comment"
          label="核验意见（驳回时必填）"
          fieldProps={{ rows: 3, maxLength: 500 }}
        />
      </ModalForm>
    </PageContainer>
  );
}
