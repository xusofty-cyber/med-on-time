import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  type Member,
  type MemberMedication,
  type MedicationPlanItem,
  type MedicationPlanPhase,
} from '@prisma/client';
import {
  AuthorizationStatus,
  CaregiverLevel,
  OperatorType,
  PlanStatus,
  PlanType,
  StockChangeType,
} from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { uuidv7 } from '../../common/utils/uuidv7';
import { DrugService } from '../drug/drug.service';
import type { AdjustStockDto } from './dto/adjust-stock.dto';
import type { ListStockQueryDto } from './dto/list-stock.query';

/** 库存模块业务码（43xxx 段）。 */
export const StockCode = {
  StockNotFound: 43001,
  InsufficientStock: 43002,
  CaregiverLevelTooLow: 43003,
  StockValidationFailed: 43004,
} as const;

/** 到期预警窗口（天）：30 天内到期标 expiring_soon（任务口径）。 */
const EXPIRY_WARN_DAYS = 30;
/** 低库存阈值（天）：按日剂量推算可服天数不足 7 天预警（schema member_medication 口径）。 */
const LOW_STOCK_ALERT_DAYS = 7;

interface OperatorContext {
  member: Member;
  operatorType: string;
  operatorLevel: string;
}

function toDateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** 成员时区下的今日（YYYY-MM-DD，成员本地墙钟口径）。 */
function localToday(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** 两个 YYYY-MM-DD 的相差天数（b - a）。 */
function daysBetween(a: string, b: string): number {
  const ms =
    new Date(`${b}T00:00:00.000Z`).getTime() -
    new Date(`${a}T00:00:00.000Z`).getTime();
  return Math.round(ms / 86400000);
}

/**
 * 单条明细的日均服用量（不含阶段覆盖）：doseAmount × 每日次数。
 * frequencyRule 形状约定见 plan 模块 CreatePlanDto 类注释。
 */
function baseDailyUsage(item: MedicationPlanItem): number {
  const rule = (item.frequencyRule ?? {}) as Record<string, unknown>;
  const times = Array.isArray(rule.times) ? rule.times.length : undefined;
  const dose = Number(item.doseAmount);
  switch (item.frequencyType) {
    case 'daily':
      return dose * (times ?? 1);
    case 'times_per_day':
      return (
        dose *
        (times ??
          (typeof rule.timesPerDay === 'number' ? rule.timesPerDay : 1))
      );
    case 'weekly': {
      const weekdays = Array.isArray(rule.weekdays) ? rule.weekdays.length : 1;
      return (dose * (times ?? 1) * weekdays) / 7;
    }
    case 'interval_days': {
      const interval =
        typeof rule.intervalDays === 'number' && rule.intervalDays > 0
          ? rule.intervalDays
          : 1;
      return (dose * (times ?? 1)) / interval;
    }
    case 'course_cycle': {
      const t = times ?? 1;
      if (
        typeof rule.cycleDays === 'number' &&
        typeof rule.onDays === 'number' &&
        rule.cycleDays > 0
      ) {
        return (dose * t * rule.onDays) / rule.cycleDays;
      }
      return dose * t;
    }
    default:
      return 0; // on_demand 不计入日常消耗估算
  }
}

/**
 * 当前阶段的日剂量覆盖：阶段按 stageNo 累进 durationDays，从计划 startDate 起算。
 * 阶段耗尽且末阶段 isFinalStop → 0（疗程已收尾）；否则末阶段剂量延续。
 * 阶段 dailyDoseAmount 为「每日总剂量」，直接替代 baseDailyUsage。
 */
function phaseAdjustedDailyUsage(
  item: MedicationPlanItem,
  phases: MedicationPlanPhase[],
  planStartDate: Date,
  today: string,
): number {
  const own = phases
    .filter((p) => p.planItemId === item.id)
    .sort((a, b) => a.stageNo - b.stageNo);
  const planWide = phases
    .filter((p) => p.planItemId === null)
    .sort((a, b) => a.stageNo - b.stageNo);
  const stages = own.length > 0 ? own : planWide;
  if (stages.length === 0) return baseDailyUsage(item);
  const elapsed = daysBetween(toDateOnly(planStartDate) ?? today, today);
  let cursor = 0;
  for (const stage of stages) {
    if (elapsed < cursor + stage.durationDays) {
      return Number(stage.dailyDoseAmount);
    }
    cursor += stage.durationDays;
  }
  const last = stages[stages.length - 1];
  if (!last) return baseDailyUsage(item);
  return last.isFinalStop ? 0 : Number(last.dailyDoseAmount);
}

/**
 * 库存服务。红线落点：
 * - 库存唯一汇总在 member_medication（schema 口径）；member_drug_inventory
 *   为多批次预留表，MVP 不写入，避免双写余额；
 * - stock_quantity 只经流水同事务更新（乐观锁 version 防并发扣减），
 *   每次调整必写 medication_stock_ledger 并双记 operator（本人/照护人）；
 * - 照护人调整库存为「协助」类操作，要求 L2 以上（L1 仅查看）。
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drugService: DrugService,
  ) {}

  private validationError(message: string): BusinessException {
    return new BusinessException(
      StockCode.StockValidationFailed,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  private async resolveOperator(
    memberId: string,
    user: AuthenticatedUser,
    mode: 'read' | 'write',
  ): Promise<OperatorContext> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
    });
    if (!member) {
      throw new BusinessException(
        BusinessCode.NotFound,
        'member not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (member.accountId === user.accountId) {
      return {
        member,
        operatorType: OperatorType.MemberSelf,
        operatorLevel: 'self',
      };
    }
    const authorization = await this.prisma.caregiverAuthorization.findFirst({
      where: {
        caregiverAccountId: user.accountId,
        memberId,
        status: AuthorizationStatus.Active,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { level: true },
    });
    if (!authorization) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        'no access to this member',
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      mode === 'write' &&
      authorization.level !== CaregiverLevel.L2 &&
      authorization.level !== CaregiverLevel.L3
    ) {
      throw new BusinessException(
        StockCode.CaregiverLevelTooLow,
        'caregiver level L2+ required to adjust stock',
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      member,
      operatorType: OperatorType.Caregiver,
      operatorLevel: authorization.level,
    };
  }

  /** 成员全部有效 scheduled 计划的日剂量映射：drugId -> 日均用量（估算）。 */
  private async computeDailyUsageMap(
    memberId: string,
    today: string,
  ): Promise<Map<string, number>> {
    const plans = await this.prisma.medicationPlan.findMany({
      where: {
        memberId,
        deletedAt: null,
        status: PlanStatus.Active,
        planType: PlanType.Scheduled,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date(`${today}T00:00:00.000Z`) } },
        ],
      },
      include: {
        items: { where: { deletedAt: null, status: 'active' } },
        phases: { where: { deletedAt: null } },
      },
    });
    const usage = new Map<string, number>();
    for (const plan of plans) {
      for (const item of plan.items) {
        const daily = phaseAdjustedDailyUsage(
          item,
          plan.phases,
          plan.startDate,
          today,
        );
        if (daily > 0) {
          usage.set(item.drugId, (usage.get(item.drugId) ?? 0) + daily);
        }
      }
    }
    return usage;
  }

  private buildStockView(
    row: MemberMedication & {
      drug: {
        genericName: string;
        brandName: string | null;
        specification: string;
        dosageForm: string;
        unit: string;
      };
    },
    dailyUsage: number | undefined,
    today: string,
  ) {
    const quantity = Number(row.stockQuantity);
    const expiryStr = toDateOnly(row.currentBatchExpiryDate);
    const daysUntilExpiry =
      expiryStr !== null ? daysBetween(today, expiryStr) : null;
    const expiryStatus =
      daysUntilExpiry === null
        ? 'unknown'
        : daysUntilExpiry < 0
          ? 'expired'
          : daysUntilExpiry <= EXPIRY_WARN_DAYS
            ? 'expiring_soon'
            : 'ok';
    const estimatedDaysLeft =
      dailyUsage !== undefined && dailyUsage > 0
        ? Math.floor(quantity / dailyUsage)
        : null;
    const alerts: string[] = [];
    if (expiryStatus === 'expired') alerts.push('expired');
    else if (expiryStatus === 'expiring_soon') alerts.push('expiring_soon');
    if (quantity <= 0) alerts.push('depleted');
    else if (
      row.lowStockAlertEnabled &&
      estimatedDaysLeft !== null &&
      estimatedDaysLeft < LOW_STOCK_ALERT_DAYS
    ) {
      alerts.push('low_stock');
    }
    return {
      memberMedicationId: row.id,
      memberId: row.memberId,
      drugId: row.drugId,
      drug: {
        genericName: row.drug.genericName,
        brandName: row.drug.brandName,
        specification: row.drug.specification,
        dosageForm: row.drug.dosageForm,
        unit: row.drug.unit,
      },
      stockQuantity: quantity,
      stockUnit: row.stockUnit,
      currentBatchExpiryDate: expiryStr,
      daysUntilExpiry,
      expiryStatus,
      storageLocation: row.storageLocation,
      lowStockAlertEnabled: row.lowStockAlertEnabled,
      status: row.status,
      estimatedDailyUsage: dailyUsage ?? null,
      estimatedDaysLeft,
      alerts,
      updatedAt: row.updatedAt,
    };
  }

  /** GET /members/:memberId/stock：库存量 + 到期/低量预警标记。 */
  async listStock(
    memberId: string,
    query: ListStockQueryDto,
    user: AuthenticatedUser,
  ) {
    const ctx = await this.resolveOperator(memberId, user, 'read');
    const today = localToday(ctx.member.timezone);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.MemberMedicationWhereInput = {
      memberId,
      deletedAt: null,
    };
    const total = await this.prisma.memberMedication.count({ where });
    const rows = await this.prisma.memberMedication.findMany({
      where,
      include: {
        drug: {
          select: {
            genericName: true,
            brandName: true,
            specification: true,
            dosageForm: true,
            unit: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const usageMap = await this.computeDailyUsageMap(memberId, today);
    return {
      items: rows.map((r) =>
        this.buildStockView(r, usageMap.get(r.drugId), today),
      ),
      total,
      page,
      pageSize,
    };
  }

  /** POST /members/:memberId/stock/adjust：增减流水（同事务更新余额 + 写流水）。 */
  async adjustStock(
    memberId: string,
    dto: AdjustStockDto,
    user: AuthenticatedUser,
  ) {
    const ctx = await this.resolveOperator(memberId, user, 'write');

    // 变动口径校验（schema：手动调整与过期作废 note 必填）
    if (dto.changeAmount === 0) {
      throw this.validationError('changeAmount must not be 0');
    }
    if (dto.changeType === StockChangeType.Restock && dto.changeAmount < 0) {
      throw this.validationError('restock changeAmount must be positive');
    }
    if (
      dto.changeType === StockChangeType.ExpiryWriteoff &&
      dto.changeAmount > 0
    ) {
      throw this.validationError('expiry_writeoff changeAmount must be negative');
    }
    if (
      (dto.changeType === StockChangeType.ManualAdjust ||
        dto.changeType === StockChangeType.ExpiryWriteoff) &&
      !dto.note?.trim()
    ) {
      throw this.validationError(
        `note is required for ${dto.changeType}`,
      );
    }
    const drug = await this.drugService.getUsableDrugOrThrow(
      dto.drugId,
      user,
      ctx.member.accountId,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      let row = await tx.memberMedication.findFirst({
        where: { memberId, drugId: dto.drugId, deletedAt: null },
      });
      if (!row) {
        if (dto.changeAmount < 0) {
          throw new BusinessException(
            StockCode.InsufficientStock,
            'no stock record to deduct from',
            HttpStatus.BAD_REQUEST,
          );
        }
        row = await tx.memberMedication.create({
          data: {
            id: uuidv7(),
            memberId,
            drugId: dto.drugId,
            stockQuantity: 0,
            stockUnit: dto.stockUnit ?? drug.unit,
            status: 'in_use',
          },
        });
      }
      if (row.status === 'archived') {
        throw this.validationError('stock record is archived');
      }
      const balanceBefore = Number(row.stockQuantity);
      const balanceAfter = Math.round((balanceBefore + dto.changeAmount) * 100) / 100;
      if (balanceAfter < 0) {
        throw new BusinessException(
          StockCode.InsufficientStock,
          'stock quantity cannot go below 0',
          HttpStatus.BAD_REQUEST,
        );
      }
      const nextStatus = balanceAfter === 0 ? 'depleted' : 'in_use';
      // 乐观锁更新余额：version 不符说明并发扣减，整单回滚报 409
      const affected = await tx.memberMedication.updateMany({
        where: { id: row.id, version: row.version },
        data: {
          stockQuantity: balanceAfter,
          version: { increment: 1 },
          status: nextStatus,
          ...(dto.expiryDate
            ? {
                currentBatchExpiryDate: new Date(
                  `${dto.expiryDate.slice(0, 10)}T00:00:00.000Z`,
                ),
              }
            : {}),
          ...(dto.storageLocation !== undefined
            ? { storageLocation: dto.storageLocation }
            : {}),
        },
      });
      if (affected.count === 0) {
        throw new BusinessException(
          BusinessCode.Conflict,
          'stock version conflict, please retry',
          HttpStatus.CONFLICT,
        );
      }
      await tx.medicationStockLedger.create({
        data: {
          id: uuidv7(),
          memberMedicationId: row.id,
          memberId,
          drugId: dto.drugId,
          changeType: dto.changeType,
          changeAmount: dto.changeAmount,
          balanceAfter,
          operatorAccountId: user.accountId,
          operatorType: ctx.operatorType,
          note: dto.note ?? null,
        },
      });
      return tx.memberMedication.findFirstOrThrow({
        where: { id: row.id },
        include: {
          drug: {
            select: {
              genericName: true,
              brandName: true,
              specification: true,
              dosageForm: true,
              unit: true,
            },
          },
        },
      });
    });

    const today = localToday(ctx.member.timezone);
    const usageMap = await this.computeDailyUsageMap(memberId, today);
    return this.buildStockView(updated, usageMap.get(dto.drugId), today);
  }
}
