import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCode, BusinessException } from '../../common/exceptions/business.exception';
import { uuidv7 } from '../../common/utils/uuidv7';

/** drug_seed_200.json 单条结构（POC-1 队列处置定版产出） */
interface DrugSeedRecord {
  generic_name?: string | null;
  product_name?: string | null;
  manufacturer?: string | null;
  approval_number?: string | null;
  specification?: string | null;
  dosage_form?: string | null;
  unit?: string | null;
  efficacy?: string | null;
  usage_text?: string | null;
  contraindications?: string | null;
  adverse_reactions?: string | null;
  precautions?: string | null;
  interactions?: string | null;
  storage_condition?: string | null;
  suggested_review_status?: string | null;
}

export interface DrugSeedImportResult {
  total: number;
  /** 新建条数 */
  imported: number;
  /** 更新既有条数（按去重键命中后刷新字段） */
  updated: number;
  /** 跳过条数（无通用名 / 文件内文号重复） */
  skippedExisting: number;
  importedApproved: number;
  importedPendingReview: number;
  missingRequiredFilled: number;
}

const DOSAGE_FORMS = new Set([
  'tablet',
  'capsule',
  'granule',
  'oral_liquid',
  'injection',
  'external',
  'other',
]);

/** 文本清洗：与 prisma/seeds/import-drug-seed.ts 定版一致（去零宽字符、统一换行并裁剪） */
function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/​/g, '').replace(/\r\n/g, '\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function truncate(v: string | null, max: number): string | null {
  if (v === null) return null;
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * 200 药种子导入（POST /admin/drugs/import-seed 专用）。
 * 2026-10-23 集成收口：与 prisma/seeds/import-drug-seed.ts 完全对齐（以脚本为
 * 定版口径），同一 seed 文件经任一入口导入结果一致：
 * - 字段映射同脚本（precautions 并入 usage_default.precautions；缺失的
 *   specification/unit 以「未录入」占位；文本按列宽截断）；
 * - 去重键：有批准文号按 approval_number，无文号按 (generic_name, brand_name)
 *   且 approval_number 为空的行；文件内文号重复的行跳过；
 * - 命中既有行走更新（旧口径为跳过，现统一为更新以便 seed 修订能同步）；
 * - review_status：approved→approved、pending_review→pending_review、
 *   其余→draft；且只升不降（库内已 approved 不被 seed 的 pending 回退）。
 */
@Injectable()
export class DrugSeedImportService {
  private readonly logger = new Logger(DrugSeedImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  private seedPath(): string {
    const candidates = [
      join(process.cwd(), 'prisma', 'seeds', 'drug_seed_200.json'),
      join(__dirname, '..', '..', '..', 'prisma', 'seeds', 'drug_seed_200.json'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    throw new BusinessException(
      BusinessCode.NotFound,
      'drug_seed_200.json not found under prisma/seeds',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async importSeed(): Promise<DrugSeedImportResult> {
    const raw = await readFile(this.seedPath(), 'utf8');
    const records = JSON.parse(raw) as DrugSeedRecord[];
    if (!Array.isArray(records)) {
      throw new BusinessException(BusinessCode.BadRequest, 'seed file is not a JSON array');
    }
    const result: DrugSeedImportResult = {
      total: records.length,
      imported: 0,
      updated: 0,
      skippedExisting: 0,
      importedApproved: 0,
      importedPendingReview: 0,
      missingRequiredFilled: 0,
    };
    const seenApprovals = new Set<string>();
    for (const record of records) {
      const genericName = cleanText(record.generic_name);
      if (!genericName) {
        result.skippedExisting += 1;
        continue;
      }
      const approvalNumber = cleanText(record.approval_number);
      if (approvalNumber) {
        if (seenApprovals.has(approvalNumber)) {
          result.skippedExisting += 1;
          continue;
        }
        seenApprovals.add(approvalNumber);
      }
      if (!record.specification || !record.unit || !record.dosage_form) {
        result.missingRequiredFilled += 1;
      }

      const dosageFormRaw = cleanText(record.dosage_form);
      const dosageForm =
        dosageFormRaw && DOSAGE_FORMS.has(dosageFormRaw) ? dosageFormRaw : 'other';
      const usageText = cleanText(record.usage_text);
      const precautions = cleanText(record.precautions);
      const usageDefault: Prisma.InputJsonValue | typeof Prisma.JsonNull =
        usageText || precautions
          ? {
              ...(usageText ? { text: usageText } : {}),
              ...(precautions ? { precautions } : {}),
            }
          : Prisma.JsonNull;
      const reviewStatus =
        record.suggested_review_status === 'approved'
          ? 'approved'
          : record.suggested_review_status === 'pending_review'
            ? 'pending_review'
            : 'draft';

      const data = {
        genericName,
        brandName: truncate(cleanText(record.product_name), 200),
        manufacturer: truncate(cleanText(record.manufacturer), 200),
        approvalNumber: truncate(approvalNumber, 64),
        dosageForm,
        specification: truncate(cleanText(record.specification), 100) ?? '未录入',
        unit: truncate(cleanText(record.unit), 32) ?? '未录入',
        efficacy: cleanText(record.efficacy),
        usageDefault,
        contraindications: cleanText(record.contraindications),
        adverseReactions: cleanText(record.adverse_reactions),
        interactions: cleanText(record.interactions),
        storageCondition: truncate(cleanText(record.storage_condition), 200),
        sourceType: 'platform',
      };

      const existing = approvalNumber
        ? await this.prisma.drug.findUnique({
            where: { approvalNumber },
            select: { id: true, reviewStatus: true },
          })
        : await this.prisma.drug.findFirst({
            where: {
              genericName,
              brandName: data.brandName,
              approvalNumber: null,
              deletedAt: null,
            },
            select: { id: true, reviewStatus: true },
          });

      // review_status 只升不降（保护后台双人核验成果）
      const nextReviewStatus =
        existing?.reviewStatus === 'approved' && reviewStatus !== 'approved'
          ? 'approved'
          : reviewStatus;

      if (existing) {
        await this.prisma.drug.update({
          where: { id: existing.id },
          data: { ...data, reviewStatus: nextReviewStatus },
        });
        result.updated += 1;
      } else {
        await this.prisma.drug.create({
          data: { id: uuidv7(), ...data, reviewStatus: nextReviewStatus },
        });
        result.imported += 1;
      }
      if (nextReviewStatus === 'approved') result.importedApproved += 1;
      else if (nextReviewStatus === 'pending_review') result.importedPendingReview += 1;
    }
    this.logger.log(
      `drug seed import: total=${result.total} created=${result.imported} updated=${result.updated} skipped=${result.skippedExisting}`,
    );
    return result;
  }
}
