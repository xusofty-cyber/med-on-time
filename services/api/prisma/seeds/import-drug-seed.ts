/**
 * 药品字典 seed 导入脚本 —— 将 drug_seed_200.json（POC-1 队列处置定版 200 条）
 * 幂等导入 drug 表（平台药品字典）。
 *
 * 用法（在 services/api 目录下）：
 *   pnpm exec ts-node prisma/seeds/import-drug-seed.ts [--dry-run]
 * 或先构建后：
 *   pnpm build && node dist/prisma/seeds/import-drug-seed.js [--dry-run]
 * 前置：DATABASE_URL 已指向目标库且迁移已执行（prisma migrate deploy）。
 *
 * 字段映射（seed -> drug 表）：
 *   generic_name      -> genericName        product_name -> brandName（字典展示名）
 *   manufacturer      -> manufacturer        approval_number -> approvalNumber（全库唯一）
 *   specification     -> specification       dosage_form -> dosageForm（非法/缺失归 other）
 *   unit              -> unit                efficacy -> efficacy
 *   usage_text        -> usageDefault.text   precautions -> usageDefault.precautions
 *     （schema drug 表无独立 precautions 列，用法与注意事项同存 usage_default JSON；
 *       该列如后续拆分需走 schema 变更评审，本脚本映射届时同步调整。）
 *   contraindications -> contraindications   adverse_reactions -> adverseReactions
 *   interactions      -> interactions        storage_condition -> storageCondition
 *   suggested_review_status -> reviewStatus：approved -> approved（已发布）；
 *     pending_review -> pending_review（未发布待核验，双人核验前不对外可见）。
 *   source_type 恒为 platform（本 seed 为平台字典；成员自建药走 API 另行入表）。
 *   seed 的 source / source_license / qc_level / note / cpm_generic / english_name
 *   在 drug 表无对应列，不落库（溯源信息保留在 docs/research/POC1_QUEUE_PROCESSING.md
 *   与 queue_dispositions.csv）。
 *
 * 幂等：有批准文号的按 approval_number upsert；无文号的按 (generic_name, brand_name)
 * 匹配既有行更新、否则新建。重复执行安全；文件内文号重复的行跳过并告警。
 * review_status 只升不降：库内已 approved 的行不会被 seed 的 pending_review 回退
 * （保护后台双人核验成果）。
 * 骨架稿（如甲基多巴：公开渠道未取得大陆说明书）以「未录入」占位规格/单位导入，
 * review_status=pending_review 保持未发布，待人工持原件补录后核验转正。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/utils/uuidv7';

interface SeedRecord {
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

const DOSAGE_FORMS = new Set([
  'tablet',
  'capsule',
  'granule',
  'oral_liquid',
  'injection',
  'external',
  'other',
]);

/** 清理 CPM 文本中的零宽字符与 Windows 换行（管线产物口径）。 */
function cleanText(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const cleaned = v.replace(/​/g, '').replace(/\r\n/g, '\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function truncate(v: string | null, max: number): string | null {
  if (v === null) return null;
  return v.length > max ? v.slice(0, max) : v;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const file = join(__dirname, 'drug_seed_200.json');
  const records = JSON.parse(readFileSync(file, 'utf-8')) as SeedRecord[];
  console.log(`seed records: ${records.length}${dryRun ? ' (dry-run)' : ''}`);

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const seenApprovals = new Set<string>();
  try {
    for (const rec of records) {
      const genericName = cleanText(rec.generic_name);
      if (!genericName) {
        skipped += 1;
        console.warn('skip: record without generic_name');
        continue;
      }
      const approvalNumber = cleanText(rec.approval_number);
      if (approvalNumber) {
        if (seenApprovals.has(approvalNumber)) {
          skipped += 1;
          console.warn(
            `skip duplicate approval_number in file: ${approvalNumber} (${genericName})`,
          );
          continue;
        }
        seenApprovals.add(approvalNumber);
      }

      const dosageFormRaw = cleanText(rec.dosage_form);
      const dosageForm =
        dosageFormRaw && DOSAGE_FORMS.has(dosageFormRaw)
          ? dosageFormRaw
          : 'other';
      const usageText = cleanText(rec.usage_text);
      const precautions = cleanText(rec.precautions);
      const usageDefault: Prisma.InputJsonValue | typeof Prisma.JsonNull =
        usageText || precautions
          ? {
              ...(usageText ? { text: usageText } : {}),
              ...(precautions ? { precautions } : {}),
            }
          : Prisma.JsonNull;
      const reviewStatus =
        rec.suggested_review_status === 'approved'
          ? 'approved'
          : rec.suggested_review_status === 'pending_review'
            ? 'pending_review'
            : 'draft';

      const data = {
        genericName,
        brandName: truncate(cleanText(rec.product_name), 200),
        manufacturer: truncate(cleanText(rec.manufacturer), 200),
        approvalNumber: truncate(approvalNumber, 64),
        dosageForm,
        specification: truncate(cleanText(rec.specification), 100) ?? '未录入',
        unit: truncate(cleanText(rec.unit), 32) ?? '未录入',
        efficacy: cleanText(rec.efficacy),
        usageDefault,
        contraindications: cleanText(rec.contraindications),
        adverseReactions: cleanText(rec.adverse_reactions),
        interactions: cleanText(rec.interactions),
        storageCondition: truncate(cleanText(rec.storage_condition), 200),
        sourceType: 'platform',
      };

      const existing = approvalNumber
        ? await prisma.drug.findUnique({
            where: { approvalNumber },
            select: { id: true, reviewStatus: true },
          })
        : await prisma.drug.findFirst({
            where: {
              genericName,
              brandName: data.brandName,
              approvalNumber: null,
              deletedAt: null,
            },
            select: { id: true, reviewStatus: true },
          });

      // review_status 只升不降（保护人工核验成果）
      const nextReviewStatus =
        existing?.reviewStatus === 'approved' && reviewStatus !== 'approved'
          ? 'approved'
          : reviewStatus;

      if (dryRun) {
        if (existing) updated += 1;
        else created += 1;
        continue;
      }
      if (existing) {
        await prisma.drug.update({
          where: { id: existing.id },
          data: { ...data, reviewStatus: nextReviewStatus },
        });
        updated += 1;
      } else {
        await prisma.drug.create({
          data: { id: uuidv7(), ...data, reviewStatus: nextReviewStatus },
        });
        created += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(
    `done: created=${created} updated=${updated} skipped=${skipped}`,
  );
}

main().catch((err: unknown) => {
  console.error('import-drug-seed failed:', err);
  process.exit(1);
});
