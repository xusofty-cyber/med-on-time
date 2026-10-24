import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReminderInstanceStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import { NotificationPrefsService } from '../notification/notification-prefs.service';
import { resolveMemberAccess } from '../reminder/access.util';
import {
  addDays,
  dbDateToStr,
  isoWeekday,
  localDateOf,
  strToDbDate,
} from '../reminder/tz.util';

/**
 * 依从统计（DB 口径冻结）：
 * - 分母（scheduled）只数已到期实例（scheduled_at_utc <= now），cancelled 不计；
 * - 补记（is_makeup）计入 taken、不计 on_time；on_time = 窗口内确认且非补记；
 * - missed 与 skipped 分开统计。
 * member_adherence_daily_stat 为预聚合表：写入路径（打卡/跳过/missed 收尾）
 * 与读取路径（summary/calendar 先对区间做一次重算自愈）都经 recomputeDailyStats 收口。
 */
@Injectable()
export class AdherenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
  ) {}

  /** 按成员本地日重算日统计（汇总行 plan_id=NULL + 每计划行），可重入 */
  async recomputeDailyStats(memberId: string, dateStrs: string[]): Promise<void> {
    const dates = [...new Set(dateStrs)];
    if (dates.length === 0) return;
    const now = new Date();

    const instances = await this.prisma.reminderInstance.findMany({
      where: {
        memberId,
        localDate: { in: dates.map(strToDbDate) },
        deletedAt: null,
        status: { not: ReminderInstanceStatus.Cancelled },
      },
      select: {
        planId: true,
        localDate: true,
        scheduledAtUtc: true,
        status: true,
        intakeRecord: {
          select: { action: true, takenAt: true, isMakeup: true },
        },
      },
    });

    // 按时口径按实例所属计划解析 cycle（计划覆盖优先，逐计划缓存）
    const cycleWindowByPlan = new Map<string, number>();
    for (const planId of [...new Set(instances.map((i) => i.planId))]) {
      const resolved = await this.prefs.getResolvedCycleForPlan(memberId, planId);
      cycleWindowByPlan.set(planId, resolved.windowMinutes);
    }

    interface Counts {
      scheduled: number;
      taken: number;
      onTime: number;
      missed: number;
      skipped: number;
    }
    const empty = (): Counts => ({ scheduled: 0, taken: 0, onTime: 0, missed: 0, skipped: 0 });
    const summaryByDate = new Map<string, Counts>();
    const planByDatePlan = new Map<string, Counts>();
    for (const d of dates) summaryByDate.set(d, empty());

    for (const inst of instances) {
      const dateStr = dbDateToStr(inst.localDate);
      const targets = [
        summaryByDate.get(dateStr) ?? empty(),
        planByDatePlan.get(`${dateStr}|${inst.planId}`) ?? empty(),
      ];
      summaryByDate.set(dateStr, targets[0] as Counts);
      planByDatePlan.set(`${dateStr}|${inst.planId}`, targets[1] as Counts);
      const due = inst.scheduledAtUtc.getTime() <= now.getTime();
      if (!due) continue;
      for (const c of targets) {
        c.scheduled += 1;
        if (inst.intakeRecord?.action === 'taken') {
          c.taken += 1;
          const takenAt = inst.intakeRecord.takenAt;
          const windowEnd =
            inst.scheduledAtUtc.getTime() +
            (cycleWindowByPlan.get(inst.planId) ?? 90) * 60_000;
          if (
            !inst.intakeRecord.isMakeup &&
            takenAt &&
            takenAt.getTime() <= windowEnd
          ) {
            c.onTime += 1;
          }
        }
        if (inst.status === ReminderInstanceStatus.Missed) c.missed += 1;
        if (inst.status === ReminderInstanceStatus.Skipped) c.skipped += 1;
      }
    }

    for (const [dateStr, counts] of summaryByDate) {
      await this.upsertStat(memberId, dateStr, null, counts);
    }
    for (const [key, counts] of planByDatePlan) {
      const [dateStr, planId] = key.split('|') as [string, string];
      await this.upsertStat(memberId, dateStr, planId, counts);
    }
  }

  private async upsertStat(
    memberId: string,
    dateStr: string,
    planId: string | null,
    counts: {
      scheduled: number;
      taken: number;
      onTime: number;
      missed: number;
      skipped: number;
    },
  ): Promise<void> {
    const statDate = strToDbDate(dateStr);
    const data = {
      scheduledCount: counts.scheduled,
      takenCount: counts.taken,
      onTimeCount: counts.onTime,
      missedCount: counts.missed,
      skippedCount: counts.skipped,
      adherenceRate:
        counts.scheduled > 0
          ? new Prisma.Decimal((counts.taken / counts.scheduled).toFixed(4))
          : null,
    };
    const existing = await this.prisma.memberAdherenceDailyStat.findFirst({
      where: { memberId, statDate, planId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.memberAdherenceDailyStat.update({
        where: { id: existing.id },
        data,
      });
    } else {
      try {
        await this.prisma.memberAdherenceDailyStat.create({
          data: { id: uuidv7(), memberId, statDate, planId, ...data },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const retry = await this.prisma.memberAdherenceDailyStat.findFirst({
            where: { memberId, statDate, planId },
            select: { id: true },
          });
          if (retry) {
            await this.prisma.memberAdherenceDailyStat.update({
              where: { id: retry.id },
              data,
            });
            return;
          }
        }
        throw err;
      }
    }
  }

  /** 汇总（range=week 本周 / month 本月，按成员时区）：应服/实服/按时率 */
  async summary(
    accountId: string,
    memberId: string,
    range: 'week' | 'month',
  ): Promise<{
    range: string;
    from: string;
    to: string;
    scheduled: number;
    taken: number;
    onTime: number;
    missed: number;
    skipped: number;
    adherenceRate: number | null;
    onTimeRate: number | null;
  }> {
    const access = await resolveMemberAccess(this.prisma, accountId, memberId);
    const tz = access.member.timezone;
    const today = localDateOf(new Date(), tz);
    let from: string;
    let to: string;
    if (range === 'week') {
      from = addDays(today, -(isoWeekday(today) - 1));
      to = addDays(from, 6);
    } else {
      from = `${today.slice(0, 7)}-01`;
      const [y, m] = today.split('-').map((v) => parseInt(v, 10));
      const nextMonth = m === 12 ? `${(y ?? 1970) + 1}-01-01` : `${y}-${String((m ?? 1) + 1).padStart(2, '0')}-01`;
      to = addDays(nextMonth, -1);
    }
    const horizon = addDays(today, 1);
    const dates: string[] = [];
    for (let d = from; d <= to && d <= horizon; d = addDays(d, 1)) dates.push(d);
    await this.recomputeDailyStats(memberId, dates);

    const rows = await this.prisma.memberAdherenceDailyStat.findMany({
      where: {
        memberId,
        planId: null,
        statDate: { gte: strToDbDate(from), lte: strToDbDate(to) },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const seenDates = new Set<string>();
    const deduplicatedRows = rows.filter((r) => {
      const d = r.statDate.toISOString().slice(0, 10);
      if (seenDates.has(d)) return false;
      seenDates.add(d);
      return true;
    });
    const agg = deduplicatedRows.reduce(
      (acc, r) => ({
        scheduled: acc.scheduled + r.scheduledCount,
        taken: acc.taken + r.takenCount,
        onTime: acc.onTime + r.onTimeCount,
        missed: acc.missed + r.missedCount,
        skipped: acc.skipped + r.skippedCount,
      }),
      { scheduled: 0, taken: 0, onTime: 0, missed: 0, skipped: 0 },
    );
    return {
      range,
      from,
      to,
      ...agg,
      adherenceRate:
        agg.scheduled > 0 ? Number((agg.taken / agg.scheduled).toFixed(4)) : null,
      onTimeRate:
        agg.scheduled > 0 ? Number((agg.onTime / agg.scheduled).toFixed(4)) : null,
    };
  }

  /** 月历：逐日状态（none / complete / partial / missed）与计数 */
  async calendar(
    accountId: string,
    memberId: string,
    month: string,
  ): Promise<{
    month: string;
    timezone: string;
    days: Array<{
      date: string;
      scheduled: number;
      taken: number;
      onTime: number;
      missed: number;
      skipped: number;
      adherenceRate: number | null;
      status: 'none' | 'complete' | 'partial' | 'missed';
    }>;
  }> {
    const access = await resolveMemberAccess(this.prisma, accountId, memberId);
    const tz = access.member.timezone;
    const today = localDateOf(new Date(), tz);
    const from = `${month}-01`;
    const [y, m] = month.split('-').map((v) => parseInt(v, 10));
    const nextMonth =
      m === 12
        ? `${(y ?? 1970) + 1}-01-01`
        : `${y}-${String((m ?? 1) + 1).padStart(2, '0')}-01`;
    const to = addDays(nextMonth, -1);

    const horizon = addDays(today, 1);
    const recomputeDates: string[] = [];
    for (let d = from; d <= to && d <= horizon; d = addDays(d, 1)) {
      recomputeDates.push(d);
    }
    await this.recomputeDailyStats(memberId, recomputeDates);

    const rows = await this.prisma.memberAdherenceDailyStat.findMany({
      where: {
        memberId,
        planId: null,
        statDate: { gte: strToDbDate(from), lte: strToDbDate(to) },
      },
    });
    const byDate = new Map(rows.map((r) => [dbDateToStr(r.statDate), r]));
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const row = byDate.get(d);
      const scheduled = row?.scheduledCount ?? 0;
      const taken = row?.takenCount ?? 0;
      const missed = row?.missedCount ?? 0;
      const status: 'none' | 'complete' | 'partial' | 'missed' =
        scheduled === 0
          ? 'none'
          : taken >= scheduled
            ? 'complete'
            : taken === 0 && missed > 0
              ? 'missed'
              : 'partial';
      days.push({
        date: d,
        scheduled,
        taken,
        onTime: row?.onTimeCount ?? 0,
        missed,
        skipped: row?.skippedCount ?? 0,
        adherenceRate: row?.adherenceRate ? Number(row.adherenceRate) : null,
        status,
      });
    }
    return { month, timezone: tz, days };
  }
}
