import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MedicationIntakeRecord, ReminderInstance } from '@prisma/client';
import {
  ConfirmationMethod,
  ConfirmationMethodReserved,
  OperatorType,
  PlanStatus,
  PlanType,
  ReminderInstanceStatus,
  StockChangeType,
} from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { uuidv7 } from '../../common/utils/uuidv7';
import { NotificationPrefsService } from '../notification/notification-prefs.service';
import { AdherenceService } from '../adherence/adherence.service';
import {
  assertAssistLevel,
  resolveMemberAccess,
} from '../reminder/access.util';
import { dbDateToStr, localDateOf, strToDbDate } from '../reminder/tz.util';
import type { CheckinDto, CheckinListQueryDto, PrnIntakeDto } from './checkin.dto';

export interface CheckinResult {
  id: string;
  instanceId: string;
  memberId: string;
  planItemId: string;
  action: string;
  takenAt: Date | null;
  recordedAt: Date;
  isMakeup: boolean;
  operatedByAccountId: string;
  operatorType: string;
  alreadyRecorded: boolean;
  stock: {
    deducted: boolean;
    balanceAfter: string | null;
    reason?: string;
  };
}

export interface PrnIntakeResult {
  id: string;
  planId: string;
  planItemId: string;
  memberId: string;
  drugId: string;
  drugNameSnapshot: string;
  doseAmount: number;
  doseUnit: string;
  takenAt: Date;
  recordedAt: Date;
  localDate: string;
  limitCheckResult: string;
  operatedByAccountId: string;
  alreadyRecorded: boolean;
  warnings: string[];
  stock: CheckinResult['stock'];
}

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
    private readonly adherence: AdherenceService,
  ) {}

  /**
   * 服药打卡（契约 checkin）：一实例仅一条有效 intake_record。
   * 幂等两段：同 clientRequestId 重提 → 返回既有；实例已有有效打卡 →
   * 返回既有并标注 alreadyRecorded。成功后同事务完成：实例置 taken、
   * 库存扣减（member_medication + medication_stock_ledger 同事务——stock
   * 模块尚为骨架、无可注入服务，故按任务口径在同事务内直操其表，待
   * StockService 落地后应改为注入调用），事务外刷新依从日统计。
   * 代打卡须照护授权 L2 以上，且 operatedBy 记实际操作人（代操作双记红线）。
   */
  async checkin(
    accountId: string,
    instanceId: string,
    dto: CheckinDto,
  ): Promise<CheckinResult> {
    const instance = await this.loadInstance(instanceId);
    const access = await resolveMemberAccess(
      this.prisma,
      accountId,
      instance.memberId,
    );
    assertAssistLevel(access);

    const confirmationMethod = dto.confirmationMethod ?? ConfirmationMethod.Tap;
    if (
      (Object.values(ConfirmationMethodReserved) as string[]).includes(
        confirmationMethod,
      )
    ) {
      throw new BusinessException(
        BusinessCode.ReservedEnumValue,
        `confirmation method ${confirmationMethod} is reserved and not enabled`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (confirmationMethod !== ConfirmationMethod.Tap) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        `unsupported confirmation method ${confirmationMethod}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 幂等第一段：同 clientRequestId 已落库
    const byRequestId = await this.prisma.medicationIntakeRecord.findFirst({
      where: { clientRequestId: dto.clientRequestId },
    });
    if (byRequestId) {
      if (byRequestId.reminderInstanceId !== instance.id) {
        throw new BusinessException(
          BusinessCode.Conflict,
          'clientRequestId already used by another checkin',
          HttpStatus.CONFLICT,
        );
      }
      if (byRequestId.action !== 'taken') {
        throw new BusinessException(
          BusinessCode.Conflict,
          `instance already recorded with action: ${byRequestId.action}`,
          HttpStatus.CONFLICT,
        );
      }
      return this.toResult(byRequestId, access.member.accountId, true, {
        deducted: false,
        balanceAfter: null,
        reason: 'previously_recorded',
      });
    }
    // 幂等第二段：实例已有有效打卡
    const existing = await this.prisma.medicationIntakeRecord.findFirst({
      where: { reminderInstanceId: instance.id, deletedAt: null },
    });
    if (existing) {
      if (existing.action !== 'taken') {
        throw new BusinessException(
          BusinessCode.Conflict,
          `instance already recorded with action: ${existing.action}`,
          HttpStatus.CONFLICT,
        );
      }
      return this.toResult(existing, access.member.accountId, true, {
        deducted: false,
        balanceAfter: null,
        reason: 'previously_recorded',
      });
    }

    if (
      instance.status === ReminderInstanceStatus.Cancelled ||
      instance.status === ReminderInstanceStatus.Skipped ||
      instance.status === ReminderInstanceStatus.Taken
    ) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `instance in status ${instance.status} cannot be checked in`,
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : now;
    if (takenAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        'takenAt cannot be in the future',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 补记判定：实例已置 missed，或确认时刻已越过提醒窗口
    const cycle = await this.prefs.getResolvedCycleForPlan(instance.memberId, instance.planId);
    const windowEnd =
      instance.scheduledAtUtc.getTime() + cycle.windowMinutes * 60_000;
    const isMakeup =
      instance.status === ReminderInstanceStatus.Missed ||
      now.getTime() > windowEnd;

    const operatorType =
      access.relation === 'self' ? OperatorType.MemberSelf : OperatorType.Caregiver;
    const intakeId = uuidv7();

    let stock: CheckinResult['stock'] = {
      deducted: false,
      balanceAfter: null,
      reason: 'no_stock_record',
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.medicationIntakeRecord.create({
          data: {
            id: intakeId,
            reminderInstanceId: instance.id,
            memberId: instance.memberId,
            planItemId: instance.planItemId,
            action: 'taken',
            takenAt,
            recordedAt: now,
            isMakeup,
            operatedByAccountId: accountId,
            skipReason: null,
            clientRequestId: dto.clientRequestId,
            confirmationMethod,
          },
        });
        await tx.reminderInstance.update({
          where: { id: instance.id },
          data: {
            status: ReminderInstanceStatus.Taken,
            version: { increment: 1 },
          },
        });
        stock = await this.deductStock(tx, instance, intakeId, accountId, operatorType);
      });
    } catch (err) {
      // 并发打卡撞唯一约束：回读既有记录按幂等返回
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.prisma.medicationIntakeRecord.findFirst({
          where: { reminderInstanceId: instance.id, deletedAt: null },
        });
        if (raced) {
          if (raced.action !== 'taken') {
            throw new BusinessException(
              BusinessCode.Conflict,
              `instance already recorded with action: ${raced.action}`,
              HttpStatus.CONFLICT,
            );
          }
          return this.toResult(raced, access.member.accountId, true, {
            deducted: false,
            balanceAfter: null,
            reason: 'previously_recorded',
          });
        }
      }
      throw err;
    }

    await this.adherence.recomputeDailyStats(instance.memberId, [
      dbDateToStr(instance.localDate),
    ]);

    const created = await this.prisma.medicationIntakeRecord.findFirstOrThrow({
      where: { id: intakeId },
    });
    return this.toResult(created, access.member.accountId, false, stock);
  }

  /**
   * PRN（按需）服药记录（2026-10-30 全项目审查 H-1 定版，补齐此前缺失的写入端点）：
   * PRN 计划不生成提醒实例，prn_intake_record 此前无任何写入方，本端点是唯一入口。
   * 安全语义以 takenAt 为准：单日上限按成员本地日计数（prnMaxPerDay）、最小间隔
   * （prnMinIntervalMinutes）与 takenAt 前后相邻记录双向比对；命中任一警告时
   * 首次提交 409 拒绝，带 confirmWarning=true 重提才落库且
   * limitCheckResult=warned_confirmed（警告与确认双留痕，不静默放行）。
   * 幂等：clientRequestId 唯一，同键重提返回既有记录且不重复扣库存。
   * 代记须照护 L2 以上，operatedByAccountId 记实际操作人（双记红线，同打卡）。
   */
  async recordPrnIntake(
    accountId: string,
    planId: string,
    dto: PrnIntakeDto,
  ): Promise<PrnIntakeResult> {
    const plan = await this.prisma.medicationPlan.findFirst({
      where: { id: planId, deletedAt: null },
    });
    if (!plan) {
      throw new BusinessException(BusinessCode.NotFound, 'plan not found', HttpStatus.NOT_FOUND);
    }
    if (plan.planType !== PlanType.Prn) {
      throw new BusinessException(BusinessCode.BadRequest, 'plan is not a PRN plan');
    }
    if (plan.status !== PlanStatus.Active) {
      throw new BusinessException(
        BusinessCode.Conflict,
        'PRN plan is not active',
        HttpStatus.CONFLICT,
      );
    }
    const access = await resolveMemberAccess(this.prisma, accountId, plan.memberId);
    assertAssistLevel(access);

    const existing = await this.prisma.prnIntakeRecord.findFirst({
      where: { clientRequestId: dto.clientRequestId },
    });
    if (existing) {
      if (existing.planId !== planId) {
        throw new BusinessException(
          BusinessCode.Conflict,
          'clientRequestId already used by another PRN record',
          HttpStatus.CONFLICT,
        );
      }
      return this.toPrnResult(existing, true, {
        deducted: false,
        balanceAfter: null,
        reason: 'previously_recorded',
      });
    }

    const item = await this.prisma.medicationPlanItem.findFirst({
      where: { id: dto.planItemId, planId, deletedAt: null },
    });
    if (!item) {
      throw new BusinessException(
        BusinessCode.NotFound,
        'plan item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const now = new Date();
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : now;
    if (takenAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        'takenAt cannot be in the future',
        HttpStatus.BAD_REQUEST,
      );
    }
    const tz = access.member.timezone;
    const localDateStr = localDateOf(takenAt, tz);

    const warnings: string[] = [];
    const maxPerDay = plan.prnMaxPerDay ?? 0;
    if (maxPerDay > 0) {
      const todayCount = await this.prisma.prnIntakeRecord.count({
        where: {
          memberId: plan.memberId,
          planId,
          localDate: strToDbDate(localDateStr),
          deletedAt: null,
        },
      });
      if (todayCount >= maxPerDay) {
        warnings.push(`已达单日上限（${maxPerDay} 次/日）`);
      }
    }
    const minInterval = plan.prnMinIntervalMinutes ?? 0;
    if (minInterval > 0) {
      const intervalMs = minInterval * 60_000;
      const [prev, next] = await Promise.all([
        this.prisma.prnIntakeRecord.findFirst({
          where: {
            memberId: plan.memberId,
            planId,
            deletedAt: null,
            takenAt: { lt: takenAt },
          },
          orderBy: { takenAt: 'desc' },
        }),
        this.prisma.prnIntakeRecord.findFirst({
          where: {
            memberId: plan.memberId,
            planId,
            deletedAt: null,
            takenAt: { gt: takenAt },
          },
          orderBy: { takenAt: 'asc' },
        }),
      ]);
      if (
        (prev && takenAt.getTime() - prev.takenAt.getTime() < intervalMs) ||
        (next && next.takenAt.getTime() - takenAt.getTime() < intervalMs)
      ) {
        warnings.push(`与相邻服药记录间隔不足（最小间隔 ${minInterval} 分钟）`);
      }
    }
    if (warnings.length > 0 && !dto.confirmWarning) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `PRN 安全校验警告：${warnings.join('；')}。如确需继续，请确认后带 confirmWarning 重提`,
        HttpStatus.CONFLICT,
      );
    }

    const limitCheckResult = warnings.length > 0 ? 'warned_confirmed' : 'passed';
    const operatorType =
      access.relation === 'self' ? OperatorType.MemberSelf : OperatorType.Caregiver;
    const recordId = uuidv7();
    let stock: CheckinResult['stock'] = {
      deducted: false,
      balanceAfter: null,
      reason: 'no_stock_record',
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.prnIntakeRecord.create({
          data: {
            id: recordId,
            memberId: plan.memberId,
            planId,
            planItemId: item.id,
            drugId: item.drugId,
            drugNameSnapshot: item.drugNameSnapshot,
            doseAmount: item.doseAmount,
            doseUnit: item.doseUnit,
            takenAt,
            recordedAt: now,
            localDate: strToDbDate(localDateStr),
            timezone: tz,
            reasonNote: dto.reasonNote ?? null,
            limitCheckResult,
            operatedByAccountId: accountId,
            clientRequestId: dto.clientRequestId,
          },
        });
        stock = await this.deductPrnStock(
          tx,
          plan.memberId,
          item,
          recordId,
          accountId,
          operatorType,
        );
      });
    } catch (err) {
      // 并发同键提交撞唯一约束：回读既有记录按幂等返回（同打卡口径）
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.prisma.prnIntakeRecord.findFirst({
          where: { clientRequestId: dto.clientRequestId },
        });
        if (raced && raced.planId === planId) {
          return this.toPrnResult(raced, true, {
            deducted: false,
            balanceAfter: null,
            reason: 'previously_recorded',
          });
        }
      }
      throw err;
    }

    const created = await this.prisma.prnIntakeRecord.findFirstOrThrow({
      where: { id: recordId },
    });
    return this.toPrnResult(created, false, stock, warnings);
  }

  /** PRN 库存扣减：与 deductStock 同口径（乐观锁+流水），流水挂 prnIntakeId */
  private async deductPrnStock(
    tx: Prisma.TransactionClient,
    memberId: string,
    item: { drugId: string; doseAmount: Prisma.Decimal; doseUnit: string },
    prnRecordId: string,
    operatorAccountId: string,
    operatorType: string,
  ): Promise<CheckinResult['stock']> {
    const med = await tx.memberMedication.findFirst({
      where: { memberId, drugId: item.drugId, deletedAt: null },
    });
    if (!med) return { deducted: false, balanceAfter: null, reason: 'no_stock_record' };
    if (med.stockUnit !== item.doseUnit) {
      return {
        deducted: false,
        balanceAfter: med.stockQuantity.toString(),
        reason: 'unit_mismatch',
      };
    }
    const qty = new Prisma.Decimal(med.stockQuantity);
    const dose = new Prisma.Decimal(item.doseAmount);
    const rawBalance = qty.minus(dose);
    const balance = rawBalance.lessThan(0) ? new Prisma.Decimal(0) : rawBalance;
    const deductedAmount = qty.minus(balance);
    if (!deductedAmount.greaterThan(0)) {
      return { deducted: false, balanceAfter: balance.toString(), reason: 'empty_stock' };
    }
    const updated = await tx.memberMedication.updateMany({
      where: { id: med.id, version: med.version },
      data: {
        stockQuantity: balance.toDecimalPlaces(2),
        status: balance.equals(0) ? 'depleted' : med.status,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new BusinessException(
        BusinessCode.Conflict,
        'stock version conflict, please retry',
        HttpStatus.CONFLICT,
      );
    }
    await tx.medicationStockLedger.create({
      data: {
        id: uuidv7(),
        memberMedicationId: med.id,
        memberId,
        drugId: item.drugId,
        changeType: StockChangeType.IntakeDeduct,
        changeAmount: deductedAmount.negated().toDecimalPlaces(2),
        balanceAfter: balance.toDecimalPlaces(2),
        intakeRecordId: null,
        prnIntakeId: prnRecordId,
        operatorAccountId,
        operatorType,
        note: rawBalance.lessThan(0) ? '库存不足，按现有余量扣减' : null,
      },
    });
    return { deducted: true, balanceAfter: balance.toString() };
  }

  private toPrnResult(
    record: {
      id: string;
      planId: string;
      planItemId: string;
      memberId: string;
      drugId: string;
      drugNameSnapshot: string;
      doseAmount: Prisma.Decimal;
      doseUnit: string;
      takenAt: Date;
      recordedAt: Date;
      localDate: Date;
      limitCheckResult: string;
      operatedByAccountId: string;
    },
    alreadyRecorded: boolean,
    stock: CheckinResult['stock'],
    warnings: string[] = [],
  ): PrnIntakeResult {
    return {
      id: record.id,
      planId: record.planId,
      planItemId: record.planItemId,
      memberId: record.memberId,
      drugId: record.drugId,
      drugNameSnapshot: record.drugNameSnapshot,
      doseAmount: Number(record.doseAmount),
      doseUnit: record.doseUnit,
      takenAt: record.takenAt,
      recordedAt: record.recordedAt,
      localDate: dbDateToStr(record.localDate),
      limitCheckResult: record.limitCheckResult,
      operatedByAccountId: record.operatedByAccountId,
      alreadyRecorded,
      warnings,
      stock,
    };
  }

  /** 同事务库存扣减：余量只经流水更新（DB 口径），乐观锁防并发扣减 */
  private async deductStock(
    tx: Prisma.TransactionClient,
    instance: ReminderInstance,
    intakeRecordId: string,
    operatorAccountId: string,
    operatorType: string,
  ): Promise<CheckinResult['stock']> {
    const med = await tx.memberMedication.findFirst({
      where: {
        memberId: instance.memberId,
        drugId: instance.drugId,
        deletedAt: null,
      },
    });
    if (!med) return { deducted: false, balanceAfter: null, reason: 'no_stock_record' };
    if (med.stockUnit !== instance.doseUnit) {
      return {
        deducted: false,
        balanceAfter: med.stockQuantity.toString(),
        reason: 'unit_mismatch',
      };
    }
    const qty = new Prisma.Decimal(med.stockQuantity);
    const dose = new Prisma.Decimal(instance.doseAmount);
    const rawBalance = qty.minus(dose);
    const balance = rawBalance.lessThan(0) ? new Prisma.Decimal(0) : rawBalance;
    const deductedAmount = qty.minus(balance);
    if (!deductedAmount.greaterThan(0)) {
      return { deducted: false, balanceAfter: balance.toString(), reason: 'empty_stock' };
    }
    const updated = await tx.memberMedication.updateMany({
      where: { id: med.id, version: med.version },
      data: {
        stockQuantity: balance.toDecimalPlaces(2),
        status: balance.equals(0) ? 'depleted' : med.status,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new BusinessException(
        BusinessCode.Conflict,
        'stock version conflict, please retry',
        HttpStatus.CONFLICT,
      );
    }
    await tx.medicationStockLedger.create({
      data: {
        id: uuidv7(),
        memberMedicationId: med.id,
        memberId: instance.memberId,
        drugId: instance.drugId,
        changeType: StockChangeType.IntakeDeduct,
        changeAmount: deductedAmount.negated().toDecimalPlaces(2),
        balanceAfter: balance.toDecimalPlaces(2),
        intakeRecordId,
        prnIntakeId: null,
        operatorAccountId,
        operatorType,
        note: rawBalance.lessThan(0) ? '库存不足，按现有余量扣减' : null,
      },
    });
    return { deducted: true, balanceAfter: balance.toString() };
  }

  /** 成员打卡记录查询（recordedAt 区间，倒序分页） */
  async listCheckins(
    accountId: string,
    memberId: string,
    query: CheckinListQueryDto,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    await resolveMemberAccess(this.prisma, accountId, memberId);
    const where: Prisma.MedicationIntakeRecordWhereInput = {
      memberId,
      deletedAt: null,
      ...(query.from || query.to
        ? {
            recordedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.medicationIntakeRecord.count({ where }),
      this.prisma.medicationIntakeRecord.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          reminderInstance: {
            select: { drugNameSnapshot: true, doseAmount: true, doseUnit: true },
          },
        },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        instanceId: r.reminderInstanceId,
        memberId: r.memberId,
        planItemId: r.planItemId,
        action: r.action,
        takenAt: r.takenAt,
        recordedAt: r.recordedAt,
        isMakeup: r.isMakeup,
        operatedByAccountId: r.operatedByAccountId,
        skipReason: r.skipReason,
        drugNameSnapshot: r.reminderInstance?.drugNameSnapshot ?? null,
        doseAmount: r.reminderInstance?.doseAmount.toString() ?? null,
        doseUnit: r.reminderInstance?.doseUnit ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async loadInstance(instanceId: string): Promise<ReminderInstance> {
    const instance = await this.prisma.reminderInstance.findFirst({
      where: { id: instanceId, deletedAt: null },
    });
    if (!instance) {
      throw new BusinessException(
        BusinessCode.NotFound,
        'reminder instance not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return instance;
  }

  private toResult(
    record: MedicationIntakeRecord,
    memberAccountId: string,
    alreadyRecorded: boolean,
    stock: CheckinResult['stock'],
  ): CheckinResult {
    return {
      id: record.id,
      instanceId: record.reminderInstanceId,
      memberId: record.memberId,
      planItemId: record.planItemId,
      action: record.action,
      takenAt: record.takenAt,
      recordedAt: record.recordedAt,
      isMakeup: record.isMakeup,
      operatedByAccountId: record.operatedByAccountId,
      operatorType:
        record.operatedByAccountId === memberAccountId
          ? OperatorType.MemberSelf
          : OperatorType.Caregiver,
      alreadyRecorded,
      stock,
    };
  }
}
