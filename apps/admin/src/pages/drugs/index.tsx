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
import { tr, useT } from '../../i18n';
import { fmtDateTime, prettyJson } from '../../utils/format';

const STATUS_KEYS = ['all', 'pending_review', 'approved', 'rejected', 'draft', 'off_shelf'] as const;

/** 药品库管理：按核验状态过滤 + 说明书全字段详情 + 双人核验（初核/复核两段） + seed 导入 */
export default function DrugsPage() {
  const t = useT();
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
      title: t('drug.importTitle'),
      content: t('drug.importContent'),
      okText: t('drug.importOk'),
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
      title: t('drug.keyword'),
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: t('drug.keywordPlaceholder') },
    },
    { title: t('drug.genericName'), dataIndex: 'genericName', hideInSearch: true, ellipsis: true },
    { title: t('drug.brandName'), dataIndex: 'brandName', hideInSearch: true, ellipsis: true, render: (_, r) => r.brandName ?? '-' },
    { title: t('drug.manufacturer'), dataIndex: 'manufacturer', hideInSearch: true, ellipsis: true, render: (_, r) => r.manufacturer ?? '-' },
    { title: t('drug.approvalNumber'), dataIndex: 'approvalNumber', hideInSearch: true, width: 130, render: (_, r) => r.approvalNumber ?? '-' },
    {
      title: t('drug.formSpec'),
      dataIndex: 'specification',
      hideInSearch: true,
      width: 170,
      render: (_, r) => t('drug.formSpecValue', { form: dosageFormText(r.dosageForm), spec: r.specification, unit: r.unit }),
    },
    {
      title: t('drug.source'),
      dataIndex: 'sourceType',
      hideInSearch: true,
      width: 100,
      render: (_, r) => drugSourceText(r.sourceType),
    },
    {
      title: t('drug.reviewStatus'),
      dataIndex: 'reviewStatus',
      hideInSearch: true,
      width: 110,
      render: (_, r) => {
        const m = drugReviewMeta(r.reviewStatus);
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: t('drug.reviewProgress'),
      dataIndex: 'reviewStage',
      hideInSearch: true,
      width: 130,
      render: (_, r) => {
        if (r.reviewStatus !== 'pending_review') return '-';
        const stage = r.review?.stage;
        if (stage === 'verify') return <Tag color="blue">{t('drug.stageVerifyDone')}</Tag>;
        if (stage === 'review') return <Tag color="orange">{t('drug.stageReview')}</Tag>;
        return <Tag color="orange">{t('drug.stagePending')}</Tag>;
      },
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updatedAt',
      hideInSearch: true,
      width: 150,
      render: (_, r) => fmtDateTime(r.updatedAt),
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
            {t('drug.detailBtn')}
          </Button>
          {record.reviewStatus === 'pending_review' && (
            <Button type="link" size="small" onClick={() => { setDetail(null); setReviewTarget(record); }}>
              {t('drug.review')}
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
      title={t('drug.title')}
      subTitle={t('drug.subTitle')}
      extra={
        <Button type="primary" icon={<ImportOutlined />} loading={importing} onClick={doImport}>
          {t('drug.importBtn')}
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
          message={t('drug.importDone')}
          description={
            <span>
              {t('drug.importSummary', { total: importResult.total ?? importResult.imported, imported: importResult.imported })}
              {importResult.updated !== undefined && t('drug.importUpdated', { n: importResult.updated })}
              {importResult.skipped !== undefined && t('drug.importSkipped', { n: importResult.skipped })}
              {importResult.pendingUnpublished !== undefined &&
                t('drug.importPending', { n: importResult.pendingUnpublished })}
              {importResult.message ? t('drug.importMsgSuffix', { msg: importResult.message }) : ''}
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
              key === 'all' ? t('common.all') : drugReviewMeta(key).text,
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
        title={detail ? t('drug.detailTitle', { name: detail.genericName }) : t('drug.detailTitlePlain')}
        width={760}
        open={!!detail || detailLoading}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        extra={
          detail?.reviewStatus === 'pending_review' ? (
            <Button type="primary" onClick={() => setReviewTarget(detail)}>
              {t('drug.doReview')}
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <>
            <Descriptions column={2} bordered size="small" title={t('drug.basicInfo')}>
              <Descriptions.Item label={t('drug.genericName')}>{detail.genericName}</Descriptions.Item>
              <Descriptions.Item label={t('drug.brandName')}>{detail.brandName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('drug.manufacturer')}>{detail.manufacturer ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('drug.approvalNumber')}>{detail.approvalNumber ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('drug.barcode')}>{detail.barcode ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('drug.category')}>{detail.categoryName ?? detail.categoryId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('drug.dosageForm')}>{dosageFormText(detail.dosageForm)}</Descriptions.Item>
              <Descriptions.Item label={t('drug.spec')}>{detail.specification}</Descriptions.Item>
              <Descriptions.Item label={t('drug.package')}>{detail.packageDesc ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('drug.minUnit')}>{detail.unit}</Descriptions.Item>
              <Descriptions.Item label="OTC">{detail.isOtc ? t('drug.otcYes') : t('drug.otcNo')}</Descriptions.Item>
              <Descriptions.Item label={t('drug.source')}>{drugSourceText(detail.sourceType)}</Descriptions.Item>
              <Descriptions.Item label={t('drug.reviewStatus')}>
                <Tag color={drugReviewMeta(detail.reviewStatus).color}>
                  {drugReviewMeta(detail.reviewStatus).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.updatedAt')}>{fmtDateTime(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>

            <h4 style={{ margin: '20px 0 8px' }}>{t('drug.progressHead')}</h4>
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
                  title: t('drug.stepReviewTitle'),
                  description: detail.review?.reviewer?.at
                    ? `${detail.review.reviewer.adminName ?? t('drug.reviewerFallback')} · ${fmtDateTime(detail.review.reviewer.at)}${detail.review.reviewer.comment ? ` · ${detail.review.reviewer.comment}` : ''}`
                    : t('drug.waitReview'),
                },
                {
                  title: t('drug.stepVerifyTitle'),
                  description: detail.review?.verifier?.at
                    ? `${detail.review.verifier.adminName ?? t('drug.verifierFallback')} · ${fmtDateTime(detail.review.verifier.at)}${detail.review.verifier.comment ? ` · ${detail.review.verifier.comment}` : ''}`
                    : t('drug.waitVerify'),
                },
                {
                  title: detail.reviewStatus === 'rejected' ? t('drug.stepRejected') : t('drug.stepPublish'),
                  description:
                    detail.reviewStatus === 'approved'
                      ? t('drug.publishDone')
                      : detail.reviewStatus === 'rejected'
                        ? t('drug.publishRejected')
                        : t('drug.publishPending'),
                },
              ]}
            />

            <h4 style={{ margin: '20px 0 8px' }}>{t('drug.labelHead')}</h4>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('drug.efficacy')}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.efficacy ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('drug.usage')}>
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {detail.usageDefault &&
                  typeof detail.usageDefault === 'object' &&
                  typeof (detail.usageDefault as { text?: unknown }).text === 'string'
                    ? (detail.usageDefault as { text: string }).text
                    : prettyJson(detail.usageDefault)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={t('drug.contra')}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.contraindications ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('drug.adverse')}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.adverseReactions ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('drug.interactions')}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{detail.interactions ?? '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('drug.storage')}>{detail.storageCondition ?? '-'}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <ModalForm<{ stage: 'review' | 'verify'; decision: 'approved' | 'rejected'; comment?: string }>
        title={reviewTarget ? t('drug.reviewTitle', { name: reviewTarget.genericName }) : t('drug.reviewTitlePlain')}
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
            message.error(t('drug.rejectNeedsComment'));
            return false;
          }
          const updated = await reviewDrug(reviewTarget.id, values);
          message.success(
            values.decision === 'approved'
              ? values.stage === 'verify'
                ? t('drug.verifyApproved')
                : t('drug.reviewApproved')
              : t('drug.rejectedDone'),
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
          message={t('drug.dualNote')}
        />
        <ProFormSelect
          name="stage"
          label={t('drug.stage')}
          options={[
            { label: t('drug.stageReviewOpt'), value: 'review' },
            { label: t('drug.stageVerifyOpt'), value: 'verify' },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="decision"
          label={t('drug.decision')}
          options={[
            { label: t('drug.approved'), value: 'approved', icon: <CheckOutlined /> },
            { label: t('drug.rejected'), value: 'rejected', icon: <CloseOutlined /> },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormTextArea
          name="comment"
          label={t('drug.comment')}
          fieldProps={{ rows: 3, maxLength: 500 }}
        />
      </ModalForm>
    </PageContainer>
  );
}
