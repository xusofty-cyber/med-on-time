import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanStatus, PlanType, ReminderInstanceStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import { NotificationPrefsService } from '../notification/notification-prefs.service';
import { AdherenceService } from '../adherence/adherence.service';
import { ReminderQueueService } from './reminder-queue.service';
import {
  addDays,
  dbDateToStr,
  daysBetween,
  isValidTimeStr,
  isoWeekday,
  localDateOf,
  normalizeTimeStr,
  strToDbDate,
  strToDbTime,
  zonedTimeToUtc,
} from './tz.util';

/**
 * frequency_rule（JsonB）定版口径（2026-10-23 集成收口，写入侧 plan 模块同口径，
 * 全文见 docs/dev/API_CONTRACT.md「frequency_rule 定版」）：
 *   { times: ["08:00","20:00"],            // 每日服用时刻（本地墙钟，全部排程类型必填）
 *     weekdays: [1,3,5],                   // weekly：ISO 星期 1=周一..7=周日（兼容 0=周日）
 *     intervalDays: 2, anchorDate: "YYYY-MM-DD",  // interval_days：锚点（缺省=计划 startDate）起每 N 天
 *     onDays: 21, offDays: 7,              // course_cycle：服 onDays 天停 offDays 天
 *     cycleDays: 28 }                      // course_cycle 旧口径兼容：offDays 缺省时由 cycleDays-onDays 推导
 * timesPerDay 仅为展示计数，不参与排程（写入侧同样要求显式 times）。
 */
interface FrequencyRule {
  times?: string[];
  timesPerDay?: number;
  weekdays?: number[];
  intervalDays?: number;
  anchorDate?: string;
  onDays?: number;
  offDays?: number;
  cycleDays?: number;
}

interface PhaseLike {
  planItemId: string | null;
  stageNo: number;
  durationDays: number;
  dailyDoseAmount: Prisma.Decimal;
  dailyDoseUnit: string;
  isFinalStop: boolean;
}

/**
 * 提醒生成器（契约「提醒引擎」一节）：
 * 每日按成员本地时区为活跃 scheduled 计划生成「次日」reminder_instance。
 * 幂等键 = plan_item_id + local_date + local_time + dose_index（契约口径），
 * 落库靠 (idempotency_key, scheduled_at_utc) 唯一约束兜底，节拍重跑/多实例并发
 * 都不会生成重复实例；生成后即为每条实例投递一个到点延迟任务。
 */
@Injectable()
export class ReminderGenerationService {
  private readonly logger = new Logger(ReminderGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
    private readonly adherence: AdherenceService,
    private readonly queue: ReminderQueueService,
  ) {}

  /** 生成器节拍：逐成员生成其次日本地日的实例，随后做 missed 兜底扫描 */
  async runTick(now: Date = new Date()): Promise<void> {
    const members = await this.prisma.member.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        plans: {
          some: {
            status: PlanStatus.Active,
            planType: PlanType.Scheduled,
            deletedAt: null,
          },
        },
      },
      select: { id: true, timezone: true },
    });
    let generated = 0;
    for (const member of members) {
      try {
        const targetLocalDate = addDays(localDateOf(now, member.timezone), 1);
        generated += await this.generateForMember(member.id, targetLocalDate);
      } catch (err) {
        this.logger.error(
          `generation failed member=${member.id}: ${String(err)}`,
        );
      }
    }
    if (generated > 0) this.logger.log(`generation tick created ${generated} instances`);
    await this.sweepMissed(now);
  }

  /**
   * 当日即时生效（2026-10-23 负责人裁定）：为成员补生成「今天」尚未到点的剂量实例。
   * 已过时刻不生成（也就不会被 missed 扫描误判未服）；剂量按全天时刻数解析后再过滤，
   * 当日总剂量口径不变。由计划创建/恢复/更新成功后触发，失败只记日志不阻断计划操作。
   */
  async generateTodayUpcoming(memberId: string, now: Date = new Date()): Promise<number> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true, timezone: true },
    });
    if (!member) return 0;
    const todayLocal = localDateOf(now, member.timezone);
    return this.generateForMember(memberId, todayLocal, { notBefore: now });
  }

  /**
   * 为单个成员生成指定本地日的全部实例；返回新生成条数。
   * 幂等：重复调用同一日期只补缺不重复（唯一约束 + skipDuplicates）。
   * opts.notBefore：只生成 scheduledAtUtc 晚于该时刻的实例（当日补生成用，
   * 避免为已过时刻造实例再被判 missed）。
   */
  async generateForMember(
    memberId: string,
    targetLocalDate: string,
    opts?: { notBefore?: Date },
  ): Promise<number> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true, timezone: true },
    });
    if (!member) return 0;
    const targetDbDate = strToDbDate(targetLocalDate);

    const plans = await this.prisma.medicationPlan.findMany({
      where: {
        memberId,
        status: PlanStatus.Active,
        planType: PlanType.Scheduled, // PRN 不生成实例（DB 口径）
        deletedAt: null,
        startDate: { lte: targetDbDate },
        OR: [{ endDate: null }, { endDate: { gte: targetDbDate } }],
      },
      include: {
        items: { where: { status: 'active', deletedAt: null } },
        phases: { where: { deletedAt: null }, orderBy: { stageNo: 'asc' } },
      },
    });

    const rows: Prisma.ReminderInstanceCreateManyInput[] = [];
    for (const plan of plans) {
      const planStartStr = dbDateToStr(plan.startDate);
      for (const item of plan.items) {
        // fixed_days 疗程：以计划 start_date 为起点，满 courseDays 后停生成
        if (item.courseType === 'fixed_days' && item.courseDays) {
          if (targetLocalDate >= addDays(planStartStr, item.courseDays)) continue;
        }
        const times = this.matchTimes(item.frequencyType, item.frequencyRule, planStartStr, targetLocalDate);
        if (!times || times.length === 0) continue;
        const dose = this.resolveDose(plan.phases, item.id, planStartStr, targetLocalDate, times.length, item.doseAmount, item.doseUnit);
        if (!dose) continue; // 阶段已终末停药（is_final_stop 之后）
        times.forEach((timeStr, doseIndex) => {
          rows.push({
            id: uuidv7(),
            memberId,
            planId: plan.id,
            planItemId: item.id,
            drugId: item.drugId,
            drugNameSnapshot: item.drugNameSnapshot,
            doseAmount: dose.amount,
            doseUnit: dose.unit,
            scheduledAtUtc: zonedTimeToUtc(targetLocalDate, timeStr, member.timezone),
            localDate: targetDbDate,
            localTime: strToDbTime(timeStr),
            timezone: member.timezone,
            status: ReminderInstanceStatus.Pending,
            // 幂等键（红线 7 / 契约口径）：plan_item_id + local_date + local_time + dose_index
            idempotencyKey: `${item.id}:${targetLocalDate}:${timeStr}:${doseIndex}`,
            source: 'schedule',
          });
        });
      }
    }
    const effectiveRows = opts?.notBefore
      ? rows.filter((r) => new Date(r.scheduledAtUtc).getTime() > opts.notBefore!.getTime())
      : rows;
    if (effectiveRows.length === 0) return 0;

    const result = await this.prisma.reminderInstance.createMany({
      data: effectiveRows,
      skipDuplicates: true,
    });
    // 次日空洞修复（2026-10-30 全项目审查 C-1）：计划暂停/删除/改排程会把未来实例
    // 置 Cancelled，被取消的行仍占幂等键，skipDuplicates 使其永不重建——计划恢复后
    // 次日全天无提醒且无任何错误信号。本轮 rows 命中的 key 均属当前 active 计划/明细、
    // 日期仍在排程内，其 Cancelled 只是计划过渡期产物：未来时刻者复活为 Pending，
    // 下方补登记投递任务的逻辑会一并覆盖；已过时刻者不复活（归历史与统计口径）。
    // 小时节拍使恢复后 ≤1 小时内即完成修复，远在次日开始之前。
    await this.prisma.reminderInstance.updateMany({
      where: {
        idempotencyKey: { in: effectiveRows.map((r) => r.idempotencyKey) },
        status: ReminderInstanceStatus.Cancelled,
        scheduledAtUtc: { gt: new Date() },
        deletedAt: null,
      },
      data: {
        status: ReminderInstanceStatus.Pending,
        snoozeUntil: null,
        updatedAt: new Date(),
      },
    });
    // 为待投递实例登记到点投递任务：新生成者必登记；重跑时若发现既有 pending
    // 实例缺任务（如首次登记时 Redis 不可用）一并补登记——jobId 去重保证不重复。
    const existing = await this.prisma.reminderInstance.findMany({
      where: { idempotencyKey: { in: effectiveRows.map((r) => r.idempotencyKey) } },
      select: { id: true, scheduledAtUtc: true, status: true },
    });
    const nowMs = Date.now();
    for (const inst of existing) {
      if (inst.status !== ReminderInstanceStatus.Pending) continue;
      if (inst.scheduledAtUtc.getTime() < nowMs - 60_000) continue;
      await this.queue.enqueueDelivery(
        { instanceId: inst.id, kind: 'deliver', plannedFor: inst.scheduledAtUtc.toISOString() },
        inst.scheduledAtUtc,
      );
    }
    return result.count;
  }

  /** 按 frequency_type 判断目标日是否服药并返回时刻列表（归一化升序）；不服药返回 null */
  private matchTimes(
    frequencyType: string,
    ruleRaw: Prisma.JsonValue,
    planStartStr: string,
    targetLocalDate: string,
  ): string[] | null {
    const rule = (ruleRaw ?? {}) as FrequencyRule;
    const times = (rule.times ?? [])
      .filter((t): t is string => typeof t === 'string' && isValidTimeStr(t))
      .map(normalizeTimeStr)
      .sort();
    if (times.length === 0) return null;

    switch (frequencyType) {
      case 'daily':
      case 'times_per_day':
        return times;
      case 'weekly': {
        const weekdays = (rule.weekdays ?? []).map((v) => (v === 0 ? 7 : v));
        return weekdays.includes(isoWeekday(targetLocalDate)) ? times : null;
      }
      case 'interval_days': {
        const interval = rule.intervalDays && rule.intervalDays > 0 ? rule.intervalDays : 2;
        const anchor = rule.anchorDate ?? planStartStr;
        const diff = daysBetween(anchor, targetLocalDate);
        return diff >= 0 && diff % interval === 0 ? times : null;
      }
      case 'course_cycle': {
        const on = rule.onDays && rule.onDays > 0 ? rule.onDays : 1;
        let off = rule.offDays && rule.offDays > 0 ? rule.offDays : 0;
        // 旧口径兼容：仅有 cycleDays+onDays 时由差值推导停药天数
        if (off === 0 && rule.cycleDays && rule.onDays && rule.cycleDays > rule.onDays) {
          off = rule.cycleDays - rule.onDays;
        }
        const anchor = rule.anchorDate ?? planStartStr;
        const diff = daysBetween(anchor, targetLocalDate);
        if (diff < 0) return null;
        return diff % (on + off) < on ? times : null;
      }
      default:
        // on_demand 等不排程类型不生成实例
        return null;
    }
  }

  /**
   * 剂量解析（含 course+dose phases）：阶段只改剂量不改时刻；阶段日剂量按当日
   * 服药次数均分到每次。阶段序列走完后：末阶段 is_final_stop 则停生成，
   * 否则按末阶段剂量延续（减量维持口径）。明细专属阶段优先于全计划阶段。
   */
  private resolveDose(
    phases: PhaseLike[],
    itemId: string,
    planStartStr: string,
    targetLocalDate: string,
    timesCount: number,
    itemDoseAmount: Prisma.Decimal,
    itemDoseUnit: string,
  ): { amount: Prisma.Decimal; unit: string } | null {
    const itemPhases = phases.filter((p) => p.planItemId === itemId);
    const applicable = (itemPhases.length > 0
      ? itemPhases
      : phases.filter((p) => p.planItemId === null)
    ).slice().sort((a, b) => a.stageNo - b.stageNo);
    if (applicable.length === 0) {
      return { amount: itemDoseAmount, unit: itemDoseUnit };
    }
    const dayOffset = daysBetween(planStartStr, targetLocalDate);
    let cursor = 0;
    for (const phase of applicable) {
      if (dayOffset < cursor + phase.durationDays) {
        return {
          amount: new Prisma.Decimal(phase.dailyDoseAmount)
            .div(timesCount)
            .toDecimalPlaces(3),
          unit: phase.dailyDoseUnit,
        };
      }
      cursor += phase.durationDays;
    }
    const last = applicable[applicable.length - 1];
    if (!last || last.isFinalStop) return null;
    return {
      amount: new Prisma.Decimal(last.dailyDoseAmount)
        .div(timesCount)
        .toDecimalPlaces(3),
      unit: last.dailyDoseUnit,
    };
  }

  /**
   * missed 兜底扫描：投递链的 finalize 任务是置 missed 的主路径；本扫描兜底
   * Redis 任务丢失等异常情形（按各成员 cycle 窗口逐个判定，不误伤未到窗末者）。
   */
  async sweepMissed(now: Date = new Date()): Promise<void> {
    const candidates = await this.prisma.reminderInstance.findMany({
      where: {
        status: {
          in: [
            ReminderInstanceStatus.Pending,
            ReminderInstanceStatus.Reminded,
            ReminderInstanceStatus.Snoozed,
          ],
        },
        deletedAt: null,
        // 最短预设窗口为严格 60 分钟：早于该界限的才可能是漏服
        scheduledAtUtc: { lt: new Date(now.getTime() - 60 * 60_000) },
      },
      select: {
        id: true,
        memberId: true,
        planId: true,
        scheduledAtUtc: true,
        localDate: true,
      },
      take: 500,
    });
    const touched = new Map<string, Set<string>>();
    for (const inst of candidates) {
      const cycle = await this.prefs.getResolvedCycleForPlan(inst.memberId, inst.planId);
      const windowEnd = inst.scheduledAtUtc.getTime() + cycle.windowMinutes * 60_000;
      if (now.getTime() < windowEnd) continue;
      const updated = await this.prisma.reminderInstance.updateMany({
        where: {
          id: inst.id,
          status: {
            in: [
              ReminderInstanceStatus.Pending,
              ReminderInstanceStatus.Reminded,
              ReminderInstanceStatus.Snoozed,
            ],
          },
        },
        data: { status: ReminderInstanceStatus.Missed, version: { increment: 1 } },
      });
      if (updated.count > 0) {
        const key = inst.memberId;
        const dates = touched.get(key) ?? new Set<string>();
        dates.add(dbDateToStr(inst.localDate));
        touched.set(key, dates);
      }
    }
    for (const [memberId, dates] of touched) {
      await this.adherence.recomputeDailyStats(memberId, [...dates]);
    }
  }
}
