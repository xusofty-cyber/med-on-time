import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type Drug,
  type MedicationPlan,
  type MedicationPlanItem,
  type MedicationPlanPhase,
  type Member,
} from '@prisma/client';
import {
  AuthorizationStatus,
  CaregiverLevel,
  OperatorType,
  PlanStatus,
  PlanType,
} from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { uuidv7 } from '../../common/utils/uuidv7';
import { DrugService } from '../drug/drug.service';
import { ReminderGenerationService } from '../reminder/reminder-generation.service';
import {
  NotificationPrefsService,
  type PlanCycleOverride,
} from '../notification/notification-prefs.service';
import type {
  CreatePlanDto,
  PlanItemInputDto,
  PlanPhaseInputDto,
} from './dto/create-plan.dto';
import type {

  PlanPhasePatchDto,
  UpdatePlanDto,
} from './dto/update-plan.dto';
import type {
  ListPlansQueryDto,
  PaginationQueryDto,
} from './dto/list-plans.query';

/** 计划模块业务码（42xxx 段）。 */
export const PlanCode = {
  PlanNotFound: 42001,
  InvalidTransition: 42002,
  CaregiverLevelTooLow: 42003,
  PlanValidationFailed: 42004,
} as const;

type Db = PrismaService | Prisma.TransactionClient;

interface OperatorContext {
  member: Member;
  operatorType: string;
  /** self / L1 / L2 / L3 */
  operatorLevel: string;
}

/* ------------------------------ 响应映射 ------------------------------ */

function toDateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toPlanItemResponse(item: MedicationPlanItem) {
  return {
    id: item.id,
    planId: item.planId,
    drugId: item.drugId,
    drugNameSnapshot: item.drugNameSnapshot,
    doseAmount: Number(item.doseAmount),
    doseUnit: item.doseUnit,
    frequencyType: item.frequencyType,
    frequencyRule: item.frequencyRule,
    mealRelation: item.mealRelation,
    courseType: item.courseType,
    courseDays: item.courseDays,
    status: item.status,
    sortOrder: item.sortOrder,
  };
}

export function toPlanPhaseResponse(phase: MedicationPlanPhase) {
  return {
    id: phase.id,
    planId: phase.planId,
    planItemId: phase.planItemId,
    stageNo: phase.stageNo,
    durationDays: phase.durationDays,
    dailyDoseAmount: Number(phase.dailyDoseAmount),
    dailyDoseUnit: phase.dailyDoseUnit,
    isFinalStop: phase.isFinalStop,
    note: phase.note,
  };
}

export function toPlanResponse(
  plan: MedicationPlan,
  items: MedicationPlanItem[],
  phases: MedicationPlanPhase[],
) {
  return {
    id: plan.id,
    memberId: plan.memberId,
    name: plan.name,
    createdByAccountId: plan.createdByAccountId,
    sourceTemplateId: plan.sourceTemplateId,
    planType: plan.planType,
    status: plan.status,
    startDate: toDateOnly(plan.startDate),
    endDate: toDateOnly(plan.endDate),
    note: plan.note,
    storageLocation: plan.storageLocation,
    additionalNote: plan.additionalNote,
    prescriptionSourceText: plan.prescriptionSourceText,
    prescriptionAttachmentId: plan.prescriptionAttachmentId,
    prnMinIntervalMinutes: plan.prnMinIntervalMinutes,
    prnMaxPerDay: plan.prnMaxPerDay,
    version: plan.version,
    items: items.map(toPlanItemResponse),
    phases: phases.map(toPlanPhaseResponse),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/* ------------------------------ 通用小工具 ------------------------------ */

function parseDateOnly(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

/** 变更史 old/new 值序列化（plan_change_history.old_value/new_value 为文本列）。 */
function serializeValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return stableStringify(v);
}

/** 键序无关的 JSON 序列化（频次规则等 JSON 字段比对用）。 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? '';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

function asIntArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'number' && Number.isInteger(x))
    ? (v as number[])
    : null;
}

function asPositiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

/* ------------------------------ 服务 ------------------------------ */

/**
 * 用药计划服务。红线落点：
 * - 成员隔离：memberId 路由由 MemberAccessGuard 前置；planId 路由在本服务
 *   resolveOperator 内二次校验归属/授权，任何查询都以 plan.memberId 收口；
 * - 计划写操作（建/改/暂停/恢复/删除）为「配置」类：照护人须 L3（L1 仅查看、
 *   L2 可协助），与 authorization 模块的级别语义一致；
 * - 变更双写（schema 口径）：事件级 medication_plan_change_log（前后快照）+
 *   字段级 plan_change_history（old/new 值 + operator_type/operator_level 双记），
 *   同事务完成；
 * - PRN（plan_type=prn）不生成提醒实例、不挂剂量阶段，参数缺失即拒绝。
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drugService: DrugService,
    private readonly prefs: NotificationPrefsService,
    private readonly generation: ReminderGenerationService,
  ) {}

  /**
   * 当日即时生效（2026-10-23 负责人裁定）：计划创建/恢复/更新成功后，为该成员
   * 补生成今天尚未到点的提醒实例。生成失败只记日志，不回滚计划操作
   * （每小时节拍与次日生成仍在，缺失实例不会扩大）。
   */
  private async triggerSameDayGeneration(memberId: string): Promise<void> {
    try {
      const created = await this.generation.generateTodayUpcoming(memberId);
      if (created > 0) {
        this.logger.log(`same-day catch-up created ${created} instances member=${memberId}`);
      }
    } catch (err) {
      this.logger.error(`same-day catch-up failed member=${memberId}: ${String(err)}`);
    }
  }

  /* ---------------------------- 权限与加载 ---------------------------- */

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
    if (mode === 'write' && authorization.level !== CaregiverLevel.L3) {
      throw new BusinessException(
        PlanCode.CaregiverLevelTooLow,
        'caregiver level L3 required to modify plans',
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      member,
      operatorType: OperatorType.Caregiver,
      operatorLevel: authorization.level,
    };
  }

  private async findPlanOrThrow(
    db: Db,
    planId: string,
  ): Promise<MedicationPlan> {
    const plan = await db.medicationPlan.findFirst({
      where: { id: planId, deletedAt: null },
    });
    if (!plan) {
      throw new BusinessException(
        PlanCode.PlanNotFound,
        'plan not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return plan;
  }

  private async loadPlan(db: Db, planId: string) {
    const plan = await this.findPlanOrThrow(db, planId);
    const [items, phases] = await Promise.all([
      db.medicationPlanItem.findMany({
        where: { planId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      db.medicationPlanPhase.findMany({
        where: { planId, deletedAt: null },
        orderBy: [{ stageNo: 'asc' }],
      }),
    ]);
    return toPlanResponse(plan, items, phases);
  }

  /* ---------------------------- 校验 ---------------------------- */

  private validationError(message: string): BusinessException {
    return new BusinessException(
      PlanCode.PlanValidationFailed,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  /** frequencyRule 按 frequencyType 的形状校验（DTO 类注释为约定形状）。 */
  private validateFrequencyRule(
    frequencyType: string,
    rule: Record<string, unknown>,
  ): void {
    const requireTimes = (): string[] => {
      const times = asStringArray(rule.times);
      if (!times || times.length === 0) {
        throw this.validationError(
          `frequencyRule.times is required for frequencyType=${frequencyType}`,
        );
      }
      for (const t of times) {
        if (!TIME_RE.test(t)) {
          throw this.validationError(`invalid time format in frequencyRule.times: ${t}`);
        }
      }
      return times;
    };
    switch (frequencyType) {
      case 'daily':
        requireTimes();
        break;
      case 'times_per_day':
        // 定版（2026-10-23）：times 为唯一排程依据；timesPerDay 仅作展示计数，
        // 单独出现无法推导时刻，一律要求显式 times（生成器同口径）。
        requireTimes();
        if (
          rule.timesPerDay !== undefined &&
          !asPositiveInt(rule.timesPerDay)
        ) {
          throw this.validationError(
            'frequencyRule.timesPerDay must be a positive integer when present',
          );
        }
        break;
      case 'weekly': {
        const weekdays = asIntArray(rule.weekdays);
        if (
          !weekdays ||
          weekdays.length === 0 ||
          weekdays.some((d) => d < 1 || d > 7)
        ) {
          throw this.validationError(
            'frequencyRule.weekdays (1-7) is required for weekly',
          );
        }
        requireTimes();
        break;
      }
      case 'interval_days':
        if (!asPositiveInt(rule.intervalDays)) {
          throw this.validationError(
            'frequencyRule.intervalDays (>0) is required for interval_days',
          );
        }
        this.validateAnchorDate(rule);
        requireTimes();
        break;
      case 'course_cycle': {
        // 定版（2026-10-23）：以 onDays/offDays 为规范形状（生成器同口径）；
        // cycleDays 为旧口径兼容字段：与 onDays 并存时 offDays 可由其推导，
        // 单独出现含义不明确，一律拒绝。
        const onDays = asPositiveInt(rule.onDays);
        if (!onDays) {
          throw this.validationError(
            'frequencyRule.onDays (>0) is required for course_cycle',
          );
        }
        if (
          rule.offDays !== undefined &&
          !(typeof rule.offDays === 'number' && Number.isInteger(rule.offDays) && rule.offDays >= 0)
        ) {
          throw this.validationError(
            'frequencyRule.offDays must be a non-negative integer',
          );
        }
        if (rule.cycleDays !== undefined) {
          const cycleDays = asPositiveInt(rule.cycleDays);
          if (!cycleDays) {
            throw this.validationError(
              'frequencyRule.cycleDays must be a positive integer',
            );
          }
          const offDays = typeof rule.offDays === 'number' ? rule.offDays : cycleDays - onDays;
          if (offDays < 0 || onDays + offDays !== cycleDays) {
            throw this.validationError(
              'frequencyRule.cycleDays must equal onDays + offDays',
            );
          }
        }
        this.validateAnchorDate(rule);
        requireTimes();
        break;
      }
      case 'on_demand':
        break;
      default:
        throw this.validationError(`unsupported frequencyType: ${frequencyType}`);
    }
  }


  /* --------------------- 计划级 cycle 覆盖（定版） --------------------- */

  /**
   * cycle 覆盖输入归一化：cycleOverride（预设名字符串或对象）优先且权威；
   * 扁平字段（cyclePreset/cycleWindowMinutes/cycleIntervalMinutes）次之。
   * present=false 表示本次请求未提及覆盖（不改现状）；override=null 表示
   * 显式清除（或三项皆空等价于无覆盖）。存储形状见 NotificationPrefsService。
   */
  private normalizeCycleInput(source: {
    cycleOverride?: unknown;
    cyclePreset?: string | null;
    cycleWindowMinutes?: number | null;
    cycleIntervalMinutes?: number | null;
  }): { present: boolean; override: PlanCycleOverride | null } {
    if (source.cycleOverride !== undefined) {
      if (source.cycleOverride === null) return { present: true, override: null };
      return { present: true, override: this.parseCycleOverride(source.cycleOverride) };
    }
    const hasFlat =
      source.cyclePreset !== undefined ||
      source.cycleWindowMinutes !== undefined ||
      source.cycleIntervalMinutes !== undefined;
    if (!hasFlat) return { present: false, override: null };
    const override: PlanCycleOverride = {
      cyclePreset: (source.cyclePreset ?? null) as PlanCycleOverride['cyclePreset'],
      cycleWindowMinutes: source.cycleWindowMinutes ?? null,
      cycleIntervalMinutes: source.cycleIntervalMinutes ?? null,
    };
    const empty =
      override.cyclePreset === null &&
      override.cycleWindowMinutes === null &&
      override.cycleIntervalMinutes === null;
    return { present: true, override: empty ? null : override };
  }

  private parseCycleOverride(raw: unknown): PlanCycleOverride | null {
    const presets = ['standard', 'gentle', 'strict'];
    if (typeof raw === 'string') {
      if (!presets.includes(raw)) {
        throw this.validationError(`invalid cycleOverride preset: ${raw}`);
      }
      return {
        cyclePreset: raw as PlanCycleOverride['cyclePreset'],
        cycleWindowMinutes: null,
        cycleIntervalMinutes: null,
      };
    }
    if (raw !== null && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      const presetRaw = (o.preset ?? o.cyclePreset ?? null) as string | null;
      if (presetRaw !== null && !presets.includes(presetRaw)) {
        throw this.validationError(`invalid cycleOverride preset: ${presetRaw}`);
      }
      const num = (v: unknown, field: string): number | null => {
        if (v === undefined || v === null) return null;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1440) {
          throw this.validationError(
            `cycleOverride.${field} must be an integer between 1 and 1440`,
          );
        }
        return v;
      };
      const override: PlanCycleOverride = {
        cyclePreset: presetRaw as PlanCycleOverride['cyclePreset'],
        cycleWindowMinutes: num(o.windowMinutes ?? o.cycleWindowMinutes, 'windowMinutes'),
        cycleIntervalMinutes: num(
          o.intervalMinutes ?? o.cycleIntervalMinutes,
          'intervalMinutes',
        ),
      };
      const empty =
        override.cyclePreset === null &&
        override.cycleWindowMinutes === null &&
        override.cycleIntervalMinutes === null;
      return empty ? null : override;
    }
    throw this.validationError('cycleOverride must be a preset name or an object');
  }

  /** 响应覆加计划级 cycle 覆盖原值（三项皆 null = 跟随成员设置）。 */
  private async withCycleFields<T extends object>(
    response: T,
    planId: string,
  ): Promise<T> {
    const override = await this.prefs.getPlanCycleOverride(planId);
    return {
      ...response,
      cyclePreset: override?.cyclePreset ?? null,
      cycleWindowMinutes: override?.cycleWindowMinutes ?? null,
      cycleIntervalMinutes: override?.cycleIntervalMinutes ?? null,
    } as T;
  }

  /** anchorDate 可选：YYYY-MM-DD；缺省时生成器以计划 startDate 为锚点。 */
  private validateAnchorDate(rule: Record<string, unknown>): void {
    if (rule.anchorDate === undefined) return;
    if (
      typeof rule.anchorDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rule.anchorDate)
    ) {
      throw this.validationError(
        'frequencyRule.anchorDate must be a YYYY-MM-DD date string',
      );
    }
  }

  private validateItemShape(item: {
    frequencyType: string;
    frequencyRule: Record<string, unknown>;
    courseType?: string;
    courseDays?: number | null;
  }): void {
    this.validateFrequencyRule(item.frequencyType, item.frequencyRule);
    const courseType = item.courseType ?? 'long_term';
    if (courseType === 'fixed_days') {
      if (!item.courseDays || item.courseDays <= 0) {
        throw this.validationError('courseDays is required when courseType=fixed_days');
      }
    } else if (item.courseDays !== undefined && item.courseDays !== null) {
      throw this.validationError(
        'courseDays is only allowed when courseType=fixed_days',
      );
    }
  }

  /** 阶段数组一致性：同目标 stageNo 唯一；isFinalStop 至多一个且为最大 stageNo。 */
  private validatePhaseGroups(
    groups: Map<string, { stageNo: number; isFinalStop?: boolean }[]>,
  ): void {
    for (const [target, phases] of groups) {
      const seen = new Set<number>();
      let maxStage = 0;
      let finalCount = 0;
      for (const p of phases) {
        if (seen.has(p.stageNo)) {
          throw this.validationError(
            `duplicate stageNo ${p.stageNo} for phase target ${target}`,
          );
        }
        seen.add(p.stageNo);
        if (p.stageNo > maxStage) maxStage = p.stageNo;
        if (p.isFinalStop) finalCount += 1;
      }
      if (finalCount > 1) {
        throw this.validationError(`multiple isFinalStop phases for target ${target}`);
      }
      const finalPhase = phases.find((p) => p.isFinalStop);
      if (finalPhase && finalPhase.stageNo !== maxStage) {
        throw this.validationError(
          'isFinalStop phase must have the largest stageNo in its target',
        );
      }
    }
  }

  /* ---------------------------- 变更双写 ---------------------------- */

  private async writeChangeLog(
    tx: Prisma.TransactionClient,
    data: {
      planId: string;
      planItemId?: string | null;
      memberId: string;
      operatorAccountId: string;
      changeType: string;
      beforeSnapshot?: unknown;
      afterSnapshot?: unknown;
    },
  ): Promise<string> {
    const id = uuidv7();
    await tx.medicationPlanChangeLog.create({
      data: {
        id,
        planId: data.planId,
        planItemId: data.planItemId ?? null,
        memberId: data.memberId,
        operatorAccountId: data.operatorAccountId,
        changeType: data.changeType,
        beforeSnapshot:
          data.beforeSnapshot === undefined
            ? undefined
            : (data.beforeSnapshot as Prisma.InputJsonValue),
        afterSnapshot:
          data.afterSnapshot === undefined
            ? undefined
            : (data.afterSnapshot as Prisma.InputJsonValue),
        effectiveFrom: new Date(),
      },
    });
    return id;
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    ctx: OperatorContext,
    rows: {
      planId: string;
      planItemId?: string | null;
      changedField: string;
      oldValue: unknown;
      newValue: unknown;
      changeLogId?: string | null;
    }[],
    operatorAccountId: string,
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx.planChangeHistory.createMany({
      data: rows.map((r) => ({
        id: uuidv7(),
        planId: r.planId,
        planItemId: r.planItemId ?? null,
        memberId: ctx.member.id,
        changedField: r.changedField,
        oldValue: serializeValue(r.oldValue),
        newValue: serializeValue(r.newValue),
        operatorAccountId,
        operatorType: ctx.operatorType,
        operatorLevel: ctx.operatorLevel,
        changeLogId: r.changeLogId ?? null,
      })),
    });
  }

  /* ---------------------------- 创建 ---------------------------- */

  async createPlan(memberId: string, dto: CreatePlanDto, user: AuthenticatedUser) {
    const ctx = await this.resolveOperator(memberId, user, 'write');
    const planType = dto.planType ?? PlanType.Scheduled;

    // 计划级一致性校验（PRN 参数 / 阶段禁挂 / 疗程日期）
    if (planType === PlanType.Prn) {
      if (!dto.prnMinIntervalMinutes || !dto.prnMaxPerDay) {
        throw this.validationError(
          'prnMinIntervalMinutes and prnMaxPerDay are required for prn plans',
        );
      }
      if (dto.phases && dto.phases.length > 0) {
        throw this.validationError('prn plans cannot have dose phases');
      }
    } else {
      if (
        dto.prnMinIntervalMinutes !== undefined ||
        dto.prnMaxPerDay !== undefined
      ) {
        throw this.validationError(
          'prn parameters are only allowed for prn plans',
        );
      }
    }
    const startDate = parseDateOnly(dto.startDate);
    const endDate = dto.endDate ? parseDateOnly(dto.endDate) : null;
    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw this.validationError('endDate must not be earlier than startDate');
    }
    if (!dto.items || dto.items.length === 0) {
      throw this.validationError('plan requires at least one item');
    }
    for (const item of dto.items) {
      if (planType === PlanType.Prn && item.frequencyType !== 'on_demand') {
        throw this.validationError('prn plan items must use frequencyType=on_demand');
      }
      if (planType !== PlanType.Prn && item.frequencyType === 'on_demand') {
        throw this.validationError(
          'scheduled plan items cannot use frequencyType=on_demand; use planType=prn',
        );
      }
      this.validateItemShape(item);
    }
    // 阶段按目标（明细下标 / 全计划）分组校验
    const phaseGroups = new Map<string, PlanPhaseInputDto[]>();
    for (const phase of dto.phases ?? []) {
      if (
        phase.planItemIndex !== undefined &&
        (phase.planItemIndex < 0 || phase.planItemIndex >= dto.items.length)
      ) {
        throw this.validationError(
          `phase planItemIndex out of range: ${phase.planItemIndex}`,
        );
      }
      const key =
        phase.planItemIndex === undefined
          ? 'ALL'
          : `ITEM:${phase.planItemIndex}`;
      const arr = phaseGroups.get(key) ?? [];
      arr.push(phase);
      phaseGroups.set(key, arr);
    }
    this.validatePhaseGroups(phaseGroups);

    // 药品可用性（平台已发布 / 本人或成员归属账号自建）
    const drugs = new Map<string, Drug>();
    for (const item of dto.items) {
      if (!drugs.has(item.drugId)) {
        drugs.set(
          item.drugId,
          await this.drugService.getUsableDrugOrThrow(
            item.drugId,
            user,
            ctx.member.accountId,
          ),
        );
      }
    }

    const cycleInput = this.normalizeCycleInput(dto);
    const planId = uuidv7();
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.medicationPlan.create({
        data: {
          id: planId,
          memberId,
          name: dto.name,
          createdByAccountId: user.accountId,
          sourceTemplateId: dto.sourceTemplateId ?? null,
          startDate,
          endDate,
          status: PlanStatus.Active,
          note: dto.note ?? null,
          planType,
          prnMinIntervalMinutes:
            planType === PlanType.Prn ? dto.prnMinIntervalMinutes : null,
          prnMaxPerDay: planType === PlanType.Prn ? dto.prnMaxPerDay : null,
          storageLocation: dto.storageLocation ?? null,
          additionalNote: dto.additionalNote ?? null,
          prescriptionSourceText: dto.prescriptionSourceText ?? null,
        },
      });
      const itemIds: string[] = [];
      for (const [idx, item] of dto.items.entries()) {
        const drug = drugs.get(item.drugId);
        const created = await tx.medicationPlanItem.create({
          data: {
            id: uuidv7(),
            planId,
            drugId: item.drugId,
            drugNameSnapshot: drug ? drug.genericName : item.drugId,
            doseAmount: item.doseAmount,
            doseUnit: item.doseUnit,
            frequencyType: item.frequencyType,
            frequencyRule: item.frequencyRule as Prisma.InputJsonValue,
            mealRelation: item.mealRelation ?? 'none',
            courseType: item.courseType ?? 'long_term',
            courseDays:
              (item.courseType ?? 'long_term') === 'fixed_days'
                ? item.courseDays
                : null,
            status: 'active',
            sortOrder: item.sortOrder ?? idx,
          },
        });
        itemIds.push(created.id);
      }
      for (const phase of dto.phases ?? []) {
        await tx.medicationPlanPhase.create({
          data: {
            id: uuidv7(),
            planId,
            planItemId:
              phase.planItemIndex === undefined
                ? null
                : (itemIds[phase.planItemIndex] ?? null),
            stageNo: phase.stageNo,
            durationDays: phase.durationDays,
            dailyDoseAmount: phase.dailyDoseAmount,
            dailyDoseUnit: phase.dailyDoseUnit,
            isFinalStop: phase.isFinalStop ?? false,
            note: phase.note ?? null,
          },
        });
      }
      const full = await this.loadPlan(tx, planId);
      await this.writeChangeLog(tx, {
        planId,
        memberId,
        operatorAccountId: user.accountId,
        changeType: 'created',
        afterSnapshot: full,
      });
      return full;
    });
    if (cycleInput.present && cycleInput.override) {
      await this.prefs.setPlanCycleOverride(planId, cycleInput.override);
    }
    // 当日即时生效：新建计划立即补生成今天未到点剂量（生成器内过滤非 Active/PRN）
    await this.triggerSameDayGeneration(memberId);
    return this.withCycleFields(created, planId);
  }

  /* ---------------------------- 查询 ---------------------------- */

  async listPlans(memberId: string, query: ListPlansQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.MedicationPlanWhereInput = {
      memberId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const total = await this.prisma.medicationPlan.count({ where });
    const plans = await this.prisma.medicationPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const items: ReturnType<typeof toPlanResponse>[] = [];
    for (const plan of plans) {
      items.push(await this.withCycleFields(await this.loadPlan(this.prisma, plan.id), plan.id));
    }
    return { items, total, page, pageSize };
  }

  async getPlan(planId: string, user: AuthenticatedUser) {
    const plan = await this.findPlanOrThrow(this.prisma, planId);
    await this.resolveOperator(plan.memberId, user, 'read');
    return this.withCycleFields(await this.loadPlan(this.prisma, planId), planId);
  }

  async getHistory(
    planId: string,
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ) {
    const plan = await this.findPlanOrThrow(this.prisma, planId);
    await this.resolveOperator(plan.memberId, user, 'read');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PlanChangeHistoryWhereInput = { planId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.planChangeHistory.count({ where }),
      this.prisma.planChangeHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        planId: r.planId,
        planItemId: r.planItemId,
        memberId: r.memberId,
        changedField: r.changedField,
        oldValue: r.oldValue,
        newValue: r.newValue,
        operatorAccountId: r.operatorAccountId,
        operatorType: r.operatorType,
        operatorLevel: r.operatorLevel,
        changeLogId: r.changeLogId,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /* ---------------------------- 更新 ---------------------------- */

  async updatePlan(planId: string, dto: UpdatePlanDto, user: AuthenticatedUser) {
    const existing = await this.findPlanOrThrow(this.prisma, planId);
    const ctx = await this.resolveOperator(existing.memberId, user, 'write');
    if (
      dto.version !== undefined &&
      dto.version !== existing.version
    ) {
      throw new BusinessException(
        BusinessCode.Conflict,
        'plan version conflict',
        HttpStatus.CONFLICT,
      );
    }
    if (
      existing.status === PlanStatus.Finished ||
      existing.status === PlanStatus.Stopped
    ) {
      throw new BusinessException(
        PlanCode.InvalidTransition,
        `plan in status ${existing.status} cannot be modified`,
        HttpStatus.CONFLICT,
      );
    }

    // 预校验新增/更换药品（事务外只读）
    const memberAccountId = ctx.member.accountId;
    const precheckedDrugs = new Map<string, Drug>();
    const precheckDrug = async (drugId: string): Promise<Drug> => {
      const cached = precheckedDrugs.get(drugId);
      if (cached) return cached;
      const drug = await this.drugService.getUsableDrugOrThrow(
        drugId,
        user,
        memberAccountId,
      );
      precheckedDrugs.set(drugId, drug);
      return drug;
    };
    if (dto.items) {
      for (const item of dto.items) {
        if (item.drugId) await precheckDrug(item.drugId);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await this.findPlanOrThrow(tx, planId);
      const historyRows: Parameters<PlanService['writeHistory']>[2] = [];

      /* ---- 标量字段 ---- */
      const effectivePlanType = dto.planType ?? plan.planType;
      const scalarData: Prisma.MedicationPlanUpdateInput = {};
      const scalarChanges: {
        field: string;
        column: string;
        oldValue: unknown;
        newValue: unknown;
        apply: (v: unknown) => void;
      }[] = [];
      const track = (
        field: string,
        column: string,
        oldValue: unknown,
        newValue: unknown,
      ) => {
        if (serializeValue(oldValue) !== serializeValue(newValue)) {
          scalarChanges.push({
            field,
            column,
            oldValue,
            newValue,
            apply: () => undefined,
          });
        }
      };
      if (dto.name !== undefined) {
        track('name', 'name', plan.name, dto.name);
        scalarData.name = dto.name;
      }
      if (dto.startDate !== undefined) {
        track('start_date', 'startDate', toDateOnly(plan.startDate), dto.startDate.slice(0, 10));
        scalarData.startDate = parseDateOnly(dto.startDate);
      }
      if (dto.endDate !== undefined) {
        track('end_date', 'endDate', toDateOnly(plan.endDate), dto.endDate?.slice(0, 10) ?? null);
        scalarData.endDate = dto.endDate ? parseDateOnly(dto.endDate) : null;
      }
      if (dto.note !== undefined) {
        track('note', 'note', plan.note, dto.note);
        scalarData.note = dto.note;
      }
      if (dto.storageLocation !== undefined) {
        track('storage_location', 'storageLocation', plan.storageLocation, dto.storageLocation);
        scalarData.storageLocation = dto.storageLocation;
      }
      if (dto.additionalNote !== undefined) {
        track('additional_note', 'additionalNote', plan.additionalNote, dto.additionalNote);
        scalarData.additionalNote = dto.additionalNote;
      }
      if (dto.prescriptionSourceText !== undefined) {
        track('prescription_source_text', 'prescriptionSourceText', plan.prescriptionSourceText, dto.prescriptionSourceText);
        scalarData.prescriptionSourceText = dto.prescriptionSourceText;
      }
      if (dto.planType !== undefined && dto.planType !== plan.planType) {
        track('plan_type', 'planType', plan.planType, dto.planType);
        scalarData.planType = dto.planType;
      }
      // PRN 参数按合并后类型收口：转 scheduled 自动清空；prn 必须两参数齐备
      const effMin =
        dto.prnMinIntervalMinutes !== undefined
          ? dto.prnMinIntervalMinutes
          : plan.prnMinIntervalMinutes;
      const effMax =
        dto.prnMaxPerDay !== undefined ? dto.prnMaxPerDay : plan.prnMaxPerDay;
      if (effectivePlanType === PlanType.Prn) {
        if (!effMin || !effMax) {
          throw this.validationError(
            'prnMinIntervalMinutes and prnMaxPerDay are required for prn plans',
          );
        }
        if (dto.prnMinIntervalMinutes !== undefined) {
          track('prn_min_interval_minutes', 'prnMinIntervalMinutes', plan.prnMinIntervalMinutes, effMin);
          scalarData.prnMinIntervalMinutes = effMin;
        }
        if (dto.prnMaxPerDay !== undefined) {
          track('prn_max_per_day', 'prnMaxPerDay', plan.prnMaxPerDay, effMax);
          scalarData.prnMaxPerDay = effMax;
        }
      } else {
        if (plan.prnMinIntervalMinutes !== null) {
          track('prn_min_interval_minutes', 'prnMinIntervalMinutes', plan.prnMinIntervalMinutes, null);
          scalarData.prnMinIntervalMinutes = null;
        }
        if (plan.prnMaxPerDay !== null) {
          track('prn_max_per_day', 'prnMaxPerDay', plan.prnMaxPerDay, null);
          scalarData.prnMaxPerDay = null;
        }
      }
      // 日期合并校验
      const effStart = scalarData.startDate instanceof Date ? scalarData.startDate : plan.startDate;
      const effEnd =
        scalarData.endDate !== undefined
          ? (scalarData.endDate as Date | null)
          : plan.endDate;
      if (effEnd && effEnd.getTime() < effStart.getTime()) {
        throw this.validationError('endDate must not be earlier than startDate');
      }
      for (const c of scalarChanges) {
        historyRows.push({
          planId,
          changedField: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
        });
      }

      /* ---- 明细全量对齐 ---- */
      const removedItemIds: string[] = [];
      if (dto.items !== undefined) {
        const currentItems = await tx.medicationPlanItem.findMany({
          where: { planId, deletedAt: null },
        });
        const byId = new Map(currentItems.map((i) => [i.id, i]));
        const keptIds = new Set<string>();
        for (const [idx, patch] of dto.items.entries()) {
          if (patch.id) {
            const current = byId.get(patch.id);
            if (!current) {
              throw this.validationError(`plan item not found in plan: ${patch.id}`);
            }
            keptIds.add(patch.id);
            const merged = {
              frequencyType: patch.frequencyType ?? current.frequencyType,
              frequencyRule:
                patch.frequencyRule ??
                (current.frequencyRule as Record<string, unknown>),
              courseType: patch.courseType ?? current.courseType,
              courseDays:
                patch.courseDays !== undefined
                  ? patch.courseDays
                  : current.courseDays,
            };
            this.validateItemShape(merged);
            if (
              effectivePlanType === PlanType.Prn &&
              merged.frequencyType !== 'on_demand'
            ) {
              throw this.validationError('prn plan items must use frequencyType=on_demand');
            }
            if (
              effectivePlanType !== PlanType.Prn &&
              merged.frequencyType === 'on_demand'
            ) {
              throw this.validationError(
                'scheduled plan items cannot use frequencyType=on_demand',
              );
            }
            const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
            const data: Prisma.MedicationPlanItemUpdateInput = {};
            const cmp = (
              field: string,
              oldValue: unknown,
              newValue: unknown,
              assign: () => void,
            ) => {
              if (serializeValue(oldValue) !== serializeValue(newValue)) {
                changes.push({ field, oldValue, newValue });
                assign();
              }
            };
            if (patch.drugId !== undefined && patch.drugId !== current.drugId) {
              const drug = precheckedDrugs.get(patch.drugId);
              changes.push({ field: 'drug_id', oldValue: current.drugId, newValue: patch.drugId });
              data.drug = { connect: { id: patch.drugId } };
              data.drugNameSnapshot = drug ? drug.genericName : current.drugNameSnapshot;
            }
            if (patch.doseAmount !== undefined)
              cmp('dose_amount', Number(current.doseAmount), patch.doseAmount, () => (data.doseAmount = patch.doseAmount));
            if (patch.doseUnit !== undefined)
              cmp('dose_unit', current.doseUnit, patch.doseUnit, () => (data.doseUnit = patch.doseUnit));
            if (patch.frequencyType !== undefined)
              cmp('frequency_type', current.frequencyType, patch.frequencyType, () => (data.frequencyType = patch.frequencyType));
            if (patch.frequencyRule !== undefined)
              cmp('frequency_rule', current.frequencyRule, patch.frequencyRule, () => (data.frequencyRule = patch.frequencyRule as Prisma.InputJsonValue));
            if (patch.mealRelation !== undefined)
              cmp('meal_relation', current.mealRelation, patch.mealRelation, () => (data.mealRelation = patch.mealRelation));
            if (patch.courseType !== undefined)
              cmp('course_type', current.courseType, patch.courseType, () => (data.courseType = patch.courseType));
            if (patch.courseDays !== undefined)
              cmp('course_days', current.courseDays, patch.courseDays, () => (data.courseDays = patch.courseDays));
            if (patch.sortOrder !== undefined)
              cmp('sort_order', current.sortOrder, patch.sortOrder, () => (data.sortOrder = patch.sortOrder));
            if (changes.length > 0) {
              data.version = { increment: 1 };
              await tx.medicationPlanItem.update({ where: { id: current.id }, data });
              const logId = await this.writeChangeLog(tx, {
                planId,
                planItemId: current.id,
                memberId: plan.memberId,
                operatorAccountId: user.accountId,
                changeType: 'item_updated',
                beforeSnapshot: toPlanItemResponse(current),
                afterSnapshot: { ...toPlanItemResponse(current), ...Object.fromEntries(changes.map((c) => [c.field, c.newValue])) },
              });
              for (const c of changes) {
                historyRows.push({
                  planId,
                  planItemId: current.id,
                  changedField: c.field,
                  oldValue: c.oldValue,
                  newValue: c.newValue,
                  changeLogId: logId,
                });
              }
            }
          } else {
            // 新增明细：字段必须完整
            if (
              !patch.drugId ||
              patch.doseAmount === undefined ||
              !patch.doseUnit ||
              !patch.frequencyType ||
              !patch.frequencyRule
            ) {
              throw this.validationError(
                'new plan item requires drugId, doseAmount, doseUnit, frequencyType, frequencyRule',
              );
            }
            const newItem: PlanItemInputDto = {
              drugId: patch.drugId,
              doseAmount: patch.doseAmount,
              doseUnit: patch.doseUnit,
              frequencyType: patch.frequencyType,
              frequencyRule: patch.frequencyRule,
              mealRelation: patch.mealRelation,
              courseType: patch.courseType,
              courseDays: patch.courseDays ?? undefined,
              sortOrder: patch.sortOrder,
            };
            this.validateItemShape(newItem);
            const drug = precheckedDrugs.get(patch.drugId);
            const created = await tx.medicationPlanItem.create({
              data: {
                id: uuidv7(),
                planId,
                drugId: patch.drugId,
                drugNameSnapshot: drug ? drug.genericName : patch.drugId,
                doseAmount: patch.doseAmount,
                doseUnit: patch.doseUnit,
                frequencyType: patch.frequencyType,
                frequencyRule: patch.frequencyRule as Prisma.InputJsonValue,
                mealRelation: patch.mealRelation ?? 'none',
                courseType: patch.courseType ?? 'long_term',
                courseDays:
                  (patch.courseType ?? 'long_term') === 'fixed_days'
                    ? patch.courseDays
                    : null,
                status: 'active',
                sortOrder: patch.sortOrder ?? idx,
              },
            });
            keptIds.add(created.id);
            await this.writeChangeLog(tx, {
              planId,
              planItemId: created.id,
              memberId: plan.memberId,
              operatorAccountId: user.accountId,
              changeType: 'item_added',
              afterSnapshot: toPlanItemResponse(created),
            });
          }
        }
        // 未保留的既有明细 = 移除（软删除）
        for (const current of currentItems) {
          if (!keptIds.has(current.id)) {
            removedItemIds.push(current.id);
            await tx.medicationPlanItem.update({
              where: { id: current.id },
              data: { deletedAt: new Date(), status: 'stopped' },
            });
            await this.writeChangeLog(tx, {
              planId,
              planItemId: current.id,
              memberId: plan.memberId,
              operatorAccountId: user.accountId,
              changeType: 'item_removed',
              beforeSnapshot: toPlanItemResponse(current),
            });
          }
        }
        // 指向已移除明细的阶段一并软删除（防悬挂阶段）
        if (removedItemIds.length > 0) {
          const orphanPhases = await tx.medicationPlanPhase.findMany({
            where: { planId, planItemId: { in: removedItemIds }, deletedAt: null },
          });
          for (const p of orphanPhases) {
            await tx.medicationPlanPhase.update({
              where: { id: p.id },
              data: { deletedAt: new Date() },
            });
            historyRows.push({
              planId,
              planItemId: p.planItemId,
              changedField: 'phase',
              oldValue: toPlanPhaseResponse(p),
              newValue: null,
            });
          }
        }
      }

      /* ---- 阶段全量对齐 ---- */
      if (dto.phases !== undefined) {
        if (effectivePlanType === PlanType.Prn && dto.phases.length > 0) {
          throw this.validationError('prn plans cannot have dose phases');
        }
        const currentPhases = await tx.medicationPlanPhase.findMany({
          where: { planId, deletedAt: null },
        });
        const validItemIds = new Set(
          (
            await tx.medicationPlanItem.findMany({
              where: { planId, deletedAt: null },
              select: { id: true },
            })
          ).map((i) => i.id),
        );
        const keyOf = (itemId: string | null, stageNo: number) =>
          `${itemId ?? 'ALL'}#${stageNo}`;
        const currentByKey = new Map(
          currentPhases.map((p) => [keyOf(p.planItemId, p.stageNo), p]),
        );
        const groups = new Map<string, PlanPhasePatchDto[]>();
        const seenKeys = new Set<string>();
        for (const patch of dto.phases) {
          const itemId = patch.planItemId ?? null;
          if (itemId !== null && !validItemIds.has(itemId)) {
            throw this.validationError(`phase references unknown plan item: ${itemId}`);
          }
          const key = keyOf(itemId, patch.stageNo);
          if (seenKeys.has(key)) {
            throw this.validationError(`duplicate phase key: ${key}`);
          }
          seenKeys.add(key);
          const gk = itemId ?? 'ALL';
          const arr = groups.get(gk) ?? [];
          arr.push(patch);
          groups.set(gk, arr);
        }
        this.validatePhaseGroups(groups);
        for (const patch of dto.phases) {
          const key = keyOf(patch.planItemId ?? null, patch.stageNo);
          const current = currentByKey.get(key);
          if (current) {
            const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
            const data: Prisma.MedicationPlanPhaseUpdateInput = {};
            if (patch.durationDays !== undefined && patch.durationDays !== current.durationDays) {
              changes.push({ field: 'phase.duration_days', oldValue: current.durationDays, newValue: patch.durationDays });
              data.durationDays = patch.durationDays;
            }
            if (patch.dailyDoseAmount !== undefined && patch.dailyDoseAmount !== Number(current.dailyDoseAmount)) {
              changes.push({ field: 'phase.daily_dose_amount', oldValue: Number(current.dailyDoseAmount), newValue: patch.dailyDoseAmount });
              data.dailyDoseAmount = patch.dailyDoseAmount;
            }
            if (patch.dailyDoseUnit !== undefined && patch.dailyDoseUnit !== current.dailyDoseUnit) {
              changes.push({ field: 'phase.daily_dose_unit', oldValue: current.dailyDoseUnit, newValue: patch.dailyDoseUnit });
              data.dailyDoseUnit = patch.dailyDoseUnit;
            }
            if (patch.isFinalStop !== undefined && patch.isFinalStop !== current.isFinalStop) {
              changes.push({ field: 'phase.is_final_stop', oldValue: current.isFinalStop, newValue: patch.isFinalStop });
              data.isFinalStop = patch.isFinalStop;
            }
            if (patch.note !== undefined && patch.note !== current.note) {
              changes.push({ field: 'phase.note', oldValue: current.note, newValue: patch.note });
              data.note = patch.note;
            }
            if (changes.length > 0) {
              data.version = { increment: 1 };
              await tx.medicationPlanPhase.update({ where: { id: current.id }, data });
              for (const c of changes) {
                historyRows.push({
                  planId,
                  planItemId: current.planItemId,
                  changedField: c.field,
                  oldValue: c.oldValue,
                  newValue: c.newValue,
                });
              }
            }
          } else {
            if (
              patch.durationDays === undefined ||
              patch.dailyDoseAmount === undefined ||
              !patch.dailyDoseUnit
            ) {
              throw this.validationError(
                'new phase requires durationDays, dailyDoseAmount, dailyDoseUnit',
              );
            }
            const created = await tx.medicationPlanPhase.create({
              data: {
                id: uuidv7(),
                planId,
                planItemId: patch.planItemId ?? null,
                stageNo: patch.stageNo,
                durationDays: patch.durationDays,
                dailyDoseAmount: patch.dailyDoseAmount,
                dailyDoseUnit: patch.dailyDoseUnit,
                isFinalStop: patch.isFinalStop ?? false,
                note: patch.note ?? null,
              },
            });
            historyRows.push({
              planId,
              planItemId: created.planItemId,
              changedField: 'phase',
              oldValue: null,
              newValue: toPlanPhaseResponse(created),
            });
          }
        }
        for (const current of currentPhases) {
          if (!seenKeys.has(keyOf(current.planItemId, current.stageNo))) {
            await tx.medicationPlanPhase.update({
              where: { id: current.id },
              data: { deletedAt: new Date() },
            });
            historyRows.push({
              planId,
              planItemId: current.planItemId,
              changedField: 'phase',
              oldValue: toPlanPhaseResponse(current),
              newValue: null,
            });
          }
        }
      } else if (
        effectivePlanType === PlanType.Prn &&
        plan.planType !== PlanType.Prn
      ) {
        // 转 PRN 时既有阶段必须同请求显式清空，避免静默残留
        const phaseCount = await tx.medicationPlanPhase.count({
          where: { planId, deletedAt: null },
        });
        if (phaseCount > 0) {
          throw this.validationError(
            'clear phases (phases: []) in the same request when switching to prn',
          );
        }
      }

      /* ---- 落库计划本体 + 历史 ---- */
      scalarData.version = { increment: 1 };
      await tx.medicationPlan.update({ where: { id: planId }, data: scalarData });
      await this.writeHistory(tx, ctx, historyRows, user.accountId);
      return this.loadPlan(tx, planId);
    });
    // cycle 覆盖后处理：cycleOverride 权威；仅扁平字段时与既有覆盖合并
    if (
      dto.cycleOverride !== undefined ||
      dto.cyclePreset !== undefined ||
      dto.cycleWindowMinutes !== undefined ||
      dto.cycleIntervalMinutes !== undefined
    ) {
      let source: {
        cycleOverride?: unknown;
        cyclePreset?: string | null;
        cycleWindowMinutes?: number | null;
        cycleIntervalMinutes?: number | null;
      } = dto;
      if (dto.cycleOverride === undefined) {
        const existingOverride = await this.prefs.getPlanCycleOverride(planId);
        if (existingOverride) {
          source = {
            cyclePreset:
              dto.cyclePreset !== undefined
                ? dto.cyclePreset
                : existingOverride.cyclePreset,
            cycleWindowMinutes:
              dto.cycleWindowMinutes !== undefined
                ? dto.cycleWindowMinutes
                : existingOverride.cycleWindowMinutes,
            cycleIntervalMinutes:
              dto.cycleIntervalMinutes !== undefined
                ? dto.cycleIntervalMinutes
                : existingOverride.cycleIntervalMinutes,
          };
        }
      }
      const input = this.normalizeCycleInput(source);
      if (input.override) {
        await this.prefs.setPlanCycleOverride(planId, input.override);
      } else {
        await this.prefs.deletePlanCycleOverride(planId);
      }
    }
    // 当日即时生效：排程变更后补生成今天未到点剂量（幂等，只补缺）
    await this.triggerSameDayGeneration(existing.memberId);
    return this.withCycleFields(updated, planId);
  }

  /* ---------------------------- 暂停 / 恢复 / 删除 ---------------------------- */

  private async transitionStatus(
    planId: string,
    user: AuthenticatedUser,
    action: 'pause' | 'resume' | 'delete',
  ) {
    const existing = await this.findPlanOrThrow(this.prisma, planId);
    const ctx = await this.resolveOperator(existing.memberId, user, 'write');
    const result = await this.prisma.$transaction(async (tx) => {
      const plan = await this.findPlanOrThrow(tx, planId);
      const now = new Date();
      if (action === 'pause') {
        if (plan.status !== PlanStatus.Active) {
          throw new BusinessException(
            PlanCode.InvalidTransition,
            `only active plan can be paused (current: ${plan.status})`,
            HttpStatus.CONFLICT,
          );
        }
        await tx.medicationPlan.update({
          where: { id: planId },
          data: { status: PlanStatus.Paused, version: { increment: 1 } },
        });
        await tx.medicationPlanItem.updateMany({
          where: { planId, deletedAt: null, status: 'active' },
          data: { status: 'paused' },
        });
        const logId = await this.writeChangeLog(tx, {
          planId,
          memberId: plan.memberId,
          operatorAccountId: user.accountId,
          changeType: 'paused',
          beforeSnapshot: { status: plan.status },
          afterSnapshot: { status: PlanStatus.Paused },
        });
        await this.writeHistory(
          tx,
          ctx,
          [
            {
              planId,
              changedField: 'status',
              oldValue: plan.status,
              newValue: PlanStatus.Paused,
              changeLogId: logId,
            },
          ],
          user.accountId,
        );
      } else if (action === 'resume') {
        if (plan.status !== PlanStatus.Paused) {
          throw new BusinessException(
            PlanCode.InvalidTransition,
            `only paused plan can be resumed (current: ${plan.status})`,
            HttpStatus.CONFLICT,
          );
        }
        await tx.medicationPlan.update({
          where: { id: planId },
          data: { status: PlanStatus.Active, version: { increment: 1 } },
        });
        await tx.medicationPlanItem.updateMany({
          where: { planId, deletedAt: null, status: 'paused' },
          data: { status: 'active' },
        });
        const logId = await this.writeChangeLog(tx, {
          planId,
          memberId: plan.memberId,
          operatorAccountId: user.accountId,
          changeType: 'resumed',
          beforeSnapshot: { status: plan.status },
          afterSnapshot: { status: PlanStatus.Active },
        });
        await this.writeHistory(
          tx,
          ctx,
          [
            {
              planId,
              changedField: 'status',
              oldValue: plan.status,
              newValue: PlanStatus.Active,
              changeLogId: logId,
            },
          ],
          user.accountId,
        );
      } else {
        // delete：软删除计划与明细/阶段，状态收口为 stopped 并留痕
        const before = await this.loadPlan(tx, planId);
        await tx.medicationPlan.update({
          where: { id: planId },
          data: {
            status: PlanStatus.Stopped,
            deletedAt: now,
            version: { increment: 1 },
          },
        });
        await tx.medicationPlanItem.updateMany({
          where: { planId, deletedAt: null },
          data: { status: 'stopped', deletedAt: now },
        });
        await tx.medicationPlanPhase.updateMany({
          where: { planId, deletedAt: null },
          data: { deletedAt: now },
        });
        const logId = await this.writeChangeLog(tx, {
          planId,
          memberId: plan.memberId,
          operatorAccountId: user.accountId,
          changeType: 'stopped',
          beforeSnapshot: before,
        });
        await this.writeHistory(
          tx,
          ctx,
          [
            {
              planId,
              changedField: 'status',
              oldValue: plan.status,
              newValue: PlanStatus.Stopped,
              changeLogId: logId,
            },
          ],
          user.accountId,
        );
        return { id: planId, status: PlanStatus.Stopped, deleted: true };
      }
      return this.loadPlan(tx, planId);
    });
    if (action === 'delete') {
      await this.prefs.deletePlanCycleOverride(planId);
      return result;
    }
    if (action === 'resume') {
      // 当日即时生效：恢复计划立即补生成今天未到点剂量
      await this.triggerSameDayGeneration(existing.memberId);
    }
    return this.withCycleFields(result as Record<string, unknown>, planId);
  }

  pausePlan(planId: string, user: AuthenticatedUser) {
    return this.transitionStatus(planId, user, 'pause');
  }

  resumePlan(planId: string, user: AuthenticatedUser) {
    return this.transitionStatus(planId, user, 'resume');
  }

  deletePlan(planId: string, user: AuthenticatedUser) {
    return this.transitionStatus(planId, user, 'delete');
  }
}
