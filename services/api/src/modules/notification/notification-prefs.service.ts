import { HttpStatus, Injectable} from '@nestjs/common';
import { Prisma} from '@prisma/client';
import { PrismaService} from '../../prisma/prisma.service';
import { uuidv7} from '../../common/utils/uuidv7';
import {
AuthBusinessCode,
BusinessException,
} from '../../common/exceptions/business.exception';

/**
* 通知偏好与成员关怀/提醒周期设置。
*
* DB V1.2 的 56 表中没有「通知偏好」「成员关怀设置」
* 的落点表（member / user_account 均无对应列，medication_plan 也无 cycle 覆盖列）。
* 在 DB V1.3 补表前，本服务以 system_config 的命名空间键作过渡存储：
* notification_prefs:<accountId> → NotificationPrefs
* member_care_settings:<memberId> → CareSettings
* plan_cycle_override:<planId> → PlanCycleOverride（计划级 cycle 覆盖，2026-10-23 定版）
* notification_read_ids:<accountId> → string[]（站内通知已读集合，上限 1000）
* 读取不到时一律回落定版默认口径（cycle 标准 90/15；锁屏详情默认 OFF；短信默认关）。
*/

/** 通知渠道偏好（账号级）：站内默认开；短信为用户自选开启；微信占位（未接订阅消息） */
export interface NotificationPrefs {
inApp: boolean;
sms: boolean;
wechat: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
inApp: true,
sms: false,
wechat: false,
};

/** 提醒周期预设（需求定版：标准 90/15、温和 120/30、严格 60/10；可按成员覆盖数值） */
export type CyclePreset = 'standard' | 'gentle' | 'strict';

export const CYCLE_PRESETS: Record<
CyclePreset,
{ windowMinutes: number; intervalMinutes: number}
> = {
standard: { windowMinutes: 90, intervalMinutes: 15},
gentle: { windowMinutes: 120, intervalMinutes: 30},
strict: { windowMinutes: 60, intervalMinutes: 10},
};

/**
 * 强提醒方式（2026-10-23 负责人裁定，原生/桌面端适用）：弹窗恒为基础层，
 * 强提醒三态单选——none 无 / alarm 闹钟（全屏+持续响铃）/ voice 语音播报；
 * 闹钟与语音互斥由单选枚举天然保证。小程序受平台限制不适用。
 */
export type StrongAlertMode = 'none' | 'alarm' | 'voice';

export const STRONG_ALERT_MODES: StrongAlertMode[] = ['none', 'alarm', 'voice'];

export interface CareSettings {
/** 关怀模式（大字/高对比，由各端按此渲染） */
careMode: boolean;
/** 锁屏显示药品详情：默认 OFF（需求定版） */
lockScreenShowDrugDetail: boolean;
/** 强提醒方式（成员级默认）：默认 none；计划级可覆盖 */
strongAlertMode: StrongAlertMode;
cyclePreset: CyclePreset;
/** 显式覆盖值（分钟）；为空走预设 */
cycleWindowMinutes: number | null;
cycleIntervalMinutes: number | null;
}

export const DEFAULT_CARE_SETTINGS: CareSettings = {
careMode: false,
lockScreenShowDrugDetail: false,
strongAlertMode: 'none',
cyclePreset: 'standard',
cycleWindowMinutes: null,
cycleIntervalMinutes: null,
};

export interface ResolvedCycle {
preset: CyclePreset;
windowMinutes: number;
intervalMinutes: number;
}

/** 计划级 cycle 覆盖（存储形状定版，字段名与 CareSettings 同口径） */
export interface PlanCycleOverride {
cyclePreset: CyclePreset | null;
cycleWindowMinutes: number | null;
cycleIntervalMinutes: number | null;
}

const READ_IDS_CAP = 1000;

@Injectable()
export class NotificationPrefsService {
constructor(private readonly prisma: PrismaService) {}

private prefsKey(accountId: string): string {
return `notification_prefs:${accountId}`;
}

private careKey(memberId: string): string {
return `member_care_settings:${memberId}`;
}

private readIdsKey(accountId: string): string {
return `notification_read_ids:${accountId}`;
}

private async readJson<T>(key: string): Promise<T | null> {
const row = await this.prisma.systemConfig.findFirst({
where: { configKey: key, deletedAt: null},
});
if (!row?.configValue) return null;
return row.configValue as unknown as T;
}

private async writeJson(
key: string,
value: unknown,
description: string,
): Promise<void> {
await this.prisma.systemConfig.upsert({
where: { configKey: key},
create: {
id: uuidv7(),
configKey: key,
configValue: value as Prisma.InputJsonValue,
description,
},
update: {
configValue: value as Prisma.InputJsonValue,
deletedAt: null,
},
});
}

async getNotificationPrefs(accountId: string): Promise<NotificationPrefs> {
const stored =
await this.readJson<Partial<NotificationPrefs>>(this.prefsKey(accountId));
return {...DEFAULT_NOTIFICATION_PREFS,...(stored?? {})};
}

async updateNotificationPrefs(
accountId: string,
patch: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
// V1.3 三受限之一：手机号未验证的账号禁止开启短信提醒通道（号码未核验，
// 短信可能发往他人或无效号码；验证路径见 docs/dev/AUTH_CHANNELS.md）。
if (patch.sms === true) {
const account = await this.prisma.userAccount.findFirst({
where: { id: accountId, deletedAt: null },
select: { phoneVerifiedAt: true },
});
if (!account?.phoneVerifiedAt) {
throw new BusinessException(
AuthBusinessCode.PhoneNotVerified,
'手机号未验证，暂不能开启短信提醒',
HttpStatus.FORBIDDEN,
);
}
}
const next = {...(await this.getNotificationPrefs(accountId)),...patch};
await this.writeJson(
this.prefsKey(accountId),
next,
'账号通知渠道偏好（过渡存储，待 DB V1.3 专表）',
);
return next;
}

async getCareSettings(memberId: string): Promise<CareSettings> {
const stored =
await this.readJson<Partial<CareSettings>>(this.careKey(memberId));
return {...DEFAULT_CARE_SETTINGS,...(stored?? {})};
}

async updateCareSettings(
memberId: string,
patch: Partial<CareSettings>,
): Promise<CareSettings> {
const next = {...(await this.getCareSettings(memberId)),...patch};
await this.writeJson(
this.careKey(memberId),
next,
'成员关怀模式与提醒周期设置（过渡存储，待 DB V1.3 专表）',
);
return next;
}

/** 解析成员生效的提醒周期：显式覆盖 > 预设 > 标准默认 */
async getResolvedCycle(memberId: string): Promise<ResolvedCycle> {
const settings = await this.getCareSettings(memberId);
const preset = CYCLE_PRESETS[settings.cyclePreset]?? CYCLE_PRESETS.standard;
return {
preset: settings.cyclePreset,
windowMinutes: settings.cycleWindowMinutes?? preset.windowMinutes,
intervalMinutes: settings.cycleIntervalMinutes?? preset.intervalMinutes,
};
}

async getReadIds(accountId: string): Promise<string[]> {
return (
(await this.readJson<string[]>(this.readIdsKey(accountId)))?? []
);
}

/** 删除成员关怀设置（成员软删除时清理，避免孤儿键残留） */
async deleteCareSettings(memberId: string): Promise<void> {
await this.prisma.systemConfig.updateMany({
where: { configKey: this.careKey(memberId), deletedAt: null },
data: { deletedAt: new Date() },
});
}

// ------------------------------------------------------------------
// 计划级 cycle 覆盖（定版，2026-10-23 集成收口）
// 存储键 plan_cycle_override:<planId> → PlanCycleOverride（system_config 过渡存储，
// 待 DB V1.3 给 medication_plan 补 cycle 列后迁移）。字段名与成员关怀设置同口径：
// cyclePreset 为预设名（null=不覆盖预设），cycleWindowMinutes/cycleIntervalMinutes
// 为显式数值覆盖（null=不覆盖该分量）。
// ------------------------------------------------------------------

private planCycleKey(planId: string): string {
return `plan_cycle_override:${planId}`;
}

async getPlanCycleOverride(planId: string): Promise<PlanCycleOverride | null> {
const stored =
await this.readJson<Partial<PlanCycleOverride>>(this.planCycleKey(planId));
if (!stored) return null;
return {
cyclePreset: stored.cyclePreset?? null,
cycleWindowMinutes: stored.cycleWindowMinutes?? null,
cycleIntervalMinutes: stored.cycleIntervalMinutes?? null,
};
}

async setPlanCycleOverride(
planId: string,
override: PlanCycleOverride,
): Promise<void> {
await this.writeJson(
this.planCycleKey(planId),
override,
'计划级提醒周期覆盖（过渡存储，待 DB V1.3 计划表补列）',
);
}

async deletePlanCycleOverride(planId: string): Promise<void> {
await this.prisma.systemConfig.updateMany({
where: { configKey: this.planCycleKey(planId), deletedAt: null },
data: { deletedAt: new Date() },
});
}

/**
 * 计划生效的提醒周期：成员设置打底 → 计划覆盖的预设整组替换 →
 * 计划覆盖的显式数值逐项替换（引擎生成 missed 判定/投递/snooze 统一走此口径）。
 */
async getResolvedCycleForPlan(
memberId: string,
planId: string,
): Promise<ResolvedCycle> {
const base = await this.getResolvedCycle(memberId);
const override = await this.getPlanCycleOverride(planId);
if (!override) return base;
let resolved: ResolvedCycle = {...base};
if (override.cyclePreset) {
const preset = CYCLE_PRESETS[override.cyclePreset]?? CYCLE_PRESETS.standard;
resolved = {
preset: override.cyclePreset,
windowMinutes: preset.windowMinutes,
intervalMinutes: preset.intervalMinutes,
};
}
if (override.cycleWindowMinutes !== null) {
resolved.windowMinutes = override.cycleWindowMinutes;
}
if (override.cycleIntervalMinutes !== null) {
resolved.intervalMinutes = override.cycleIntervalMinutes;
}
return resolved;
}

// ------------------------------------------------------------------
// 计划级强提醒覆盖（2026-10-24，与 cycle 覆盖同存储口径）
// 存储键 plan_strong_alert_override:<planId> → { strongAlertMode }
// strongAlertMode 为 null = 不覆盖（跟随成员关怀设置）。
// 本字段只决定原生/桌面端的呈现方式，服务端投递渠道不消费。
// ------------------------------------------------------------------

private planStrongAlertKey(planId: string): string {
return `plan_strong_alert_override:${planId}`;
}

async getPlanStrongAlertOverride(
planId: string,
): Promise<StrongAlertMode | null> {
const stored = await this.readJson<{ strongAlertMode?: unknown }>(
this.planStrongAlertKey(planId),
);
const value = stored?.strongAlertMode;
return value === 'alarm' || value === 'voice' || value === 'none'
? value
: null;
}

async setPlanStrongAlertOverride(
planId: string,
mode: StrongAlertMode | null,
): Promise<void> {
await this.writeJson(
this.planStrongAlertKey(planId),
{ strongAlertMode: mode },
'计划级强提醒方式覆盖（过渡存储，与 plan_cycle_override 同口径）',
);
}

async deletePlanStrongAlertOverride(planId: string): Promise<void> {
await this.prisma.systemConfig.updateMany({
where: { configKey: this.planStrongAlertKey(planId), deletedAt: null },
data: { deletedAt: new Date() },
});
}

/** 计划生效的强提醒方式：计划覆盖优先，否则成员关怀设置 */
async getResolvedStrongAlertMode(
memberId: string,
planId: string,
): Promise<StrongAlertMode> {
const override = await this.getPlanStrongAlertOverride(planId);
if (override !== null) return override;
const settings = await this.getCareSettings(memberId);
return settings.strongAlertMode ?? 'none';
}

  async markRead(accountId: string, notificationId: string): Promise<void> {
    const key = this.readIdsKey(accountId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; config_value: unknown }[]>`
        SELECT id, config_value FROM system_config
        WHERE config_key = ${key} AND deleted_at IS NULL
        FOR UPDATE
      `;
      let ids: string[] = [];
      const row = rows[0];
      if (row && Array.isArray(row.config_value)) {
        ids = row.config_value.filter((x): x is string => typeof x === 'string');
      }
      if (ids.includes(notificationId)) return;
      ids.push(notificationId);
      const capped = ids.slice(-READ_IDS_CAP);
      if (row) {
        await tx.systemConfig.update({
          where: { id: row.id },
          data: { configValue: capped as Prisma.InputJsonValue },
        });
      } else {
        await tx.systemConfig.create({
          data: {
            id: uuidv7(),
            configKey: key,
            configValue: capped as Prisma.InputJsonValue,
            description: '站内通知已读集合（过渡存储，待通知表补 read_at 列）',
          },
        });
      }
    });
  }
}
