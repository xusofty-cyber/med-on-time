import { HttpStatus, Injectable, Logger} from '@nestjs/common';
import { Prisma, type Drug} from '@prisma/client';
import { AuthorizationStatus, CaregiverLevel} from '@med-on-time/shared';
import { PrismaService} from '../../prisma/prisma.service';
import {
BusinessCode,
BusinessException,
} from '../../common/exceptions/business.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { uuidv7 } from '../../common/utils/uuidv7';
import type { CreateCustomDrugDto} from './dto/create-custom-drug.dto';
import type { SearchDrugsQueryDto} from './dto/search-drugs.query';

/** 药品模块业务码（41xxx 段，与 common BusinessCode 通用段不复用）。 */
export const DrugCode = {
DrugNotFound: 41001,
ApprovalNumberConflict: 41002,
CaregiverLevelTooLow: 41003,
} as const;

/** 说明书层全字段响应（GET /drugs/:id 口径；列表搜索返回其子集见 toDrugSummary）。 */
export interface DrugResponse {
id: string;
genericName: string;
brandName: string | null;
manufacturer: string | null;
approvalNumber: string | null;
barcode: string | null;
categoryId: string | null;
dosageForm: string;
specification: string;
packageDesc: string | null;
unit: string;
efficacy: string | null;
/** usage_default JSON：{ text?: string; precautions?: string}（见 seed 导入映射说明） */
usageDefault: unknown;
contraindications: string | null;
adverseReactions: string | null;
interactions: string | null;
storageCondition: string | null;
isOtc: boolean;
sourceType: string;
reviewStatus: string;
createdByAccountId: string | null;
createdAt: Date;
updatedAt: Date;
}

export function toDrugResponse(drug: Drug): DrugResponse {
return {
id: drug.id,
genericName: drug.genericName,
brandName: drug.brandName,
manufacturer: drug.manufacturer,
approvalNumber: drug.approvalNumber,
barcode: drug.barcode,
categoryId: drug.categoryId,
dosageForm: drug.dosageForm,
specification: drug.specification,
packageDesc: drug.packageDesc,
unit: drug.unit,
efficacy: drug.efficacy,
usageDefault: drug.usageDefault?? null,
contraindications: drug.contraindications,
adverseReactions: drug.adverseReactions,
interactions: drug.interactions,
storageCondition: drug.storageCondition,
isOtc: drug.isOtc,
sourceType: drug.sourceType,
reviewStatus: drug.reviewStatus,
createdByAccountId: drug.createdByAccountId,
createdAt: drug.createdAt,
updatedAt: drug.updatedAt,
};
}

/**
* 药品可见性（全模块统一口径）：
* - 平台药：review_status=approved 才对外可见（pending_review 未发布，契约：待核验不上线）；
* - 自建药：仅创建账号本人可见（drug 表无 member_id 列，自建药按 created_by_account_id 归属，
* 这是当前 schema 下的最细粒度；缺口已在交付报告中登记）。
*/
@Injectable()
export class DrugService {
private readonly logger = new Logger(DrugService.name);

constructor(private readonly prisma: PrismaService) {}

private visibilityWhere(user?: AuthenticatedUser): Prisma.DrugWhereInput {
const platform: Prisma.DrugWhereInput = {
sourceType: 'platform',
reviewStatus: 'approved',
};
if (!user) return platform;
return {
OR: [platform, { sourceType: 'user_custom', createdByAccountId: user.accountId}],
};
}

/**
* GET /drugs/search：通用名 / 商品名模糊搜索。
*
* 实现说明（trgm）：迁移已为 generic_name / brand_name 建 pg_trgm GIN 索引并启用
* pg_trgm 扩展，主路径用原生查询走 `%` 相似匹配 + similarity() 排序（拼写近似可召回）；
* 若运行环境缺 pg_trgm（如未跑全迁移的本地库），自动回退 Prisma contains 查询保证可用。
*/
async search(query: SearchDrugsQueryDto, user?: AuthenticatedUser) {
const page = query.page?? 1;
const pageSize = query.pageSize?? 20;
const q = query.q?.trim()?? '';
try {
return await this.searchByTrgm(q, page, pageSize, user);
} catch (err) {
this.logger.warn(
`trgm search fallback to contains: ${err instanceof Error? err.message: String(err)}`,
);
return this.searchByContains(q, page, pageSize, user);
}
}

private async searchByTrgm(
q: string,
page: number,
pageSize: number,
user?: AuthenticatedUser,
) {
const offset = (page - 1) * pageSize;
const visibility = user
? Prisma.sql`((source_type = 'platform' AND review_status = 'approved') OR (source_type = 'user_custom' AND created_by_account_id = ${user.accountId}::uuid))`
: Prisma.sql`(source_type = 'platform' AND review_status = 'approved')`;
const like = `%${q}%`;
const match = q
? Prisma.sql`AND (generic_name % ${q} OR brand_name % ${q} OR generic_name ILIKE ${like} OR brand_name ILIKE ${like})`
: Prisma.empty;
const order = q
? Prisma.sql`GREATEST(similarity(generic_name, ${q}), COALESCE(similarity(brand_name, ${q}), 0)) DESC, generic_name ASC`
: Prisma.sql`generic_name ASC`;

const countRows = await this.prisma.$queryRaw<{ total: bigint}[]>`
SELECT COUNT(*)::bigint AS total FROM drug
WHERE deleted_at IS NULL AND ${visibility} ${match}`;
const total = Number(countRows[0]?.total?? 0);
const idRows = await this.prisma.$queryRaw<{ id: string}[]>`
SELECT id FROM drug
WHERE deleted_at IS NULL AND ${visibility} ${match}
ORDER BY ${order}
LIMIT ${pageSize} OFFSET ${offset}`;
const ids = idRows.map((r) => r.id);
const drugs = ids.length
? await this.prisma.drug.findMany({ where: { id: { in: ids}}})
: [];
const byId = new Map(drugs.map((d) => [d.id, d]));
const items = ids
.map((id) => byId.get(id))
.filter((d): d is Drug => d!== undefined)
.map(toDrugResponse);
return { items, total, page, pageSize};
}

private async searchByContains(
q: string,
page: number,
pageSize: number,
user?: AuthenticatedUser,
) {
const where: Prisma.DrugWhereInput = {
deletedAt: null,
AND: [
this.visibilityWhere(user),
...(q
? [
{
OR: [
{ genericName: { contains: q, mode: 'insensitive' as const}},
{ brandName: { contains: q, mode: 'insensitive' as const}},
],
},
]
: []),
],
};
const [total, drugs] = await this.prisma.$transaction([
this.prisma.drug.count({ where}),
this.prisma.drug.findMany({
where,
orderBy: { genericName: 'asc'},
skip: (page - 1) * pageSize,
take: pageSize,
}),
]);
return { items: drugs.map(toDrugResponse), total, page, pageSize};
}

/** GET /drugs/:id：说明书层全字段；不可见即 404（不泄漏存在性）。 */
async getById(id: string, user?: AuthenticatedUser): Promise<DrugResponse> {
const drug = await this.prisma.drug.findFirst({
where: { id, deletedAt: null, AND: [this.visibilityWhere(user)]},
});
if (!drug) {
throw new BusinessException(
DrugCode.DrugNotFound,
'drug not found',
HttpStatus.NOT_FOUND,
);
}
return toDrugResponse(drug);
}

/**
* GET /drugs/:id/interactions：说明书结构化返回 +
* ONC 高优先硬检标记占位。
*
* 口径（POC-1 结论）：相互作用层不引入 DDInter（非商用授权）；替代打法 =
* 说明书结构化提取 + ONC 高优先清单硬检 + 药师复核队列，在 POC-3 落地。
* 在 POC-3 接入前 oncHighPriorityCheck 恒为 placeholder 结构：调用方不得
* 据此判定「无相互作用」，仅说明书原文可作参考。
*/
async getInteractions(id: string, user?: AuthenticatedUser) {
const drug = await this.prisma.drug.findFirst({
where: { id, deletedAt: null, AND: [this.visibilityWhere(user)]},
});
if (!drug) {
throw new BusinessException(
DrugCode.DrugNotFound,
'drug not found',
HttpStatus.NOT_FOUND,
);
}
const text = drug.interactions?.trim()? drug.interactions: null;
return {
drugId: drug.id,
genericName: drug.genericName,
brandName: drug.brandName,
/** 说明书原文（结构化提取的源文本） */
labelInteractionsText: text,
/** 按编号条目切分的条目数组（无编号时单条为全文；便于前端逐条展示） */
labelInteractionEntries: text? splitInteractionEntries(text): [],
/** 说明书原文（与相互作用强相关，一并返回供前端同屏提示） */
labelContraindications: drug.contraindications,
oncHighPriorityCheck: {
status: 'placeholder' as const,
hits: [] as unknown[],
note: 'ONC 高优先相互作用硬检尚未接入（POC-3 落地：说明书结构化提取 + ONC 高优先清单硬检 + 药师复核队列）。当前仅返回说明书原文，未做跨药硬检，不得据此判定无相互作用。',
},
};
}

/**
* POST /members/:memberId/drugs/custom：成员自建药品（须先过 MemberAccessGuard）。
* 照护人代建需 L2 以上授权（L1 仅查看）；自建药 source_type=user_custom、
* review_status=draft（未经平台核验，仅创建账号可见可用）。
*/
async createCustomDrug(
memberId: string,
dto: CreateCustomDrugDto,
user: AuthenticatedUser,
): Promise<DrugResponse> {
const member = await this.prisma.member.findFirst({
where: { id: memberId, deletedAt: null},
select: { id: true, accountId: true},
});
if (!member) {
throw new BusinessException(
BusinessCode.NotFound,
'member not found',
HttpStatus.NOT_FOUND,
);
}
if (member.accountId!== user.accountId) {
const authorization = await this.prisma.caregiverAuthorization.findFirst({
where: {
caregiverAccountId: user.accountId,
memberId,
status: AuthorizationStatus.Active,
deletedAt: null,
OR: [{ expiresAt: null}, { expiresAt: { gt: new Date()}}],
},
select: { level: true},
});
if (
!authorization ||
(authorization.level!== CaregiverLevel.L2 &&
authorization.level!== CaregiverLevel.L3)
) {
throw new BusinessException(
DrugCode.CaregiverLevelTooLow,
'caregiver level L2+ required to create custom drug',
HttpStatus.FORBIDDEN,
);
}
}

if (dto.approvalNumber) {
const existing = await this.prisma.drug.findFirst({
where: { approvalNumber: dto.approvalNumber},
select: { id: true},
});
if (existing) {
throw new BusinessException(
DrugCode.ApprovalNumberConflict,
'approval number already exists',
HttpStatus.CONFLICT,
);
}
}
if (dto.barcode) {
const existing = await this.prisma.drug.findFirst({
where: { barcode: dto.barcode},
select: { id: true},
});
if (existing) {
throw new BusinessException(
DrugCode.ApprovalNumberConflict,
'barcode already exists',
HttpStatus.CONFLICT,
);
}
}

const drug = await this.prisma.drug.create({
data: {
id: uuidv7(),
genericName: dto.genericName,
brandName: dto.brandName?? null,
manufacturer: dto.manufacturer?? null,
approvalNumber: dto.approvalNumber?? null,
barcode: dto.barcode?? null,
categoryId: dto.categoryId?? null,
dosageForm: dto.dosageForm,
specification: dto.specification,
packageDesc: dto.packageDesc?? null,
unit: dto.unit,
efficacy: dto.efficacy?? null,
usageDefault: dto.usageText? { text: dto.usageText}: undefined,
contraindications: dto.contraindications?? null,
adverseReactions: dto.adverseReactions?? null,
interactions: dto.interactions?? null,
storageCondition: dto.storageCondition?? null,
isOtc: dto.isOtc?? false,
sourceType: 'user_custom',
reviewStatus: 'draft',
createdByAccountId: user.accountId,
},
});
return toDrugResponse(drug);
}

/**
* 计划/库存等模块的药品可用性校验：平台已发布药，或操作账号自建药，
* 或成员归属账号自建药（照护人代配时成员本人的药库同样可用）。
*/
async getUsableDrugOrThrow(
drugId: string,
user: AuthenticatedUser,
memberAccountId: string,
): Promise<Drug> {
const drug = await this.prisma.drug.findFirst({
where: {
id: drugId,
deletedAt: null,
OR: [
{ sourceType: 'platform', reviewStatus: 'approved'},
{ sourceType: 'user_custom', createdByAccountId: user.accountId},
{ sourceType: 'user_custom', createdByAccountId: memberAccountId},
],
},
});
if (!drug) {
throw new BusinessException(
DrugCode.DrugNotFound,
'drug not found or not usable',
HttpStatus.NOT_FOUND,
);
}
return drug;
}
}

/** 说明书相互作用文本按「1、/1./1．」编号切条；切不出时整段一条。 */
export function splitInteractionEntries(text: string): string[] {
const parts = text
.split(/(?=\d{1,2}[、.．)])\s*/)
.map((s) => s.trim())
.filter((s) => s.length > 0);
return parts.length > 0? parts: [text.trim()];
}
