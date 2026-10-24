-- MedOnTime V1.6 迁移：补齐四张按月分区父表丢失的枚举 CHECK 约束与部分唯一索引
-- 依据：R1 代码审查发现——20261023090100_constraints_partitions 第 D 节重建四张分区父表并 DROP legacy 表后，
--       原第 A 节挂载在该四张表上的 8 条枚举 CHECK 约束未在新分区母表重建；
--       另补齐 member_adherence_daily_stat (plan_id IS NULL) 与 ai_provider_config (is_active = true) 部分唯一索引。
-- 幂等性：所有 CHECK 约束通过 DO 块检测 pg_constraint 是否已存在，所有唯一索引使用 IF NOT EXISTS，支持重复执行不报错。

-- ===== 1. 四张分区父表补齐缺失的 8 条枚举 CHECK 约束 =====
DO $$
BEGIN
  -- 1.1 reminder_instance.status
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_reminder_instance_status'
      AND conrelid = '"reminder_instance"'::regclass
  ) THEN
    ALTER TABLE "reminder_instance"
      ADD CONSTRAINT "ck_reminder_instance_status"
      CHECK ("status" IN ('pending', 'reminded', 'taken', 'snoozed', 'skipped', 'missed', 'cancelled'));
  END IF;

  -- 1.2 reminder_instance.source
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_reminder_instance_source'
      AND conrelid = '"reminder_instance"'::regclass
  ) THEN
    ALTER TABLE "reminder_instance"
      ADD CONSTRAINT "ck_reminder_instance_source"
      CHECK ("source" IN ('schedule', 'manual', 'makeup'));
  END IF;

  -- 1.3 reminder_delivery_log.channel
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_reminder_delivery_log_channel'
      AND conrelid = '"reminder_delivery_log"'::regclass
  ) THEN
    ALTER TABLE "reminder_delivery_log"
      ADD CONSTRAINT "ck_reminder_delivery_log_channel"
      CHECK ("channel" IN ('app_push', 'wechat_subscribe', 'sms', 'voice_call', 'in_app', 'pc_popup', 'smartwatch', 'smart_speaker'));
  END IF;

  -- 1.4 reminder_delivery_log.result
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_reminder_delivery_log_result'
      AND conrelid = '"reminder_delivery_log"'::regclass
  ) THEN
    ALTER TABLE "reminder_delivery_log"
      ADD CONSTRAINT "ck_reminder_delivery_log_result"
      CHECK ("result" IN ('success', 'failed', 'suppressed_dnd', 'suppressed_dedup'));
  END IF;

  -- 1.5 ai_call_log.status
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ai_call_log_status'
      AND conrelid = '"ai_call_log"'::regclass
  ) THEN
    ALTER TABLE "ai_call_log"
      ADD CONSTRAINT "ck_ai_call_log_status"
      CHECK ("status" IN ('success', 'failed', 'timeout', 'blocked'));
  END IF;

  -- 1.6 ai_call_log.safety_action
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ai_call_log_safety_action'
      AND conrelid = '"ai_call_log"'::regclass
  ) THEN
    ALTER TABLE "ai_call_log"
      ADD CONSTRAINT "ck_ai_call_log_safety_action"
      CHECK ("safety_action" IN ('pass', 'blocked', 'rewritten'));
  END IF;

  -- 1.7 audit_log.actor_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_audit_log_actor_type'
      AND conrelid = '"audit_log"'::regclass
  ) THEN
    ALTER TABLE "audit_log"
      ADD CONSTRAINT "ck_audit_log_actor_type"
      CHECK ("actor_type" IN ('admin', 'account', 'system'));
  END IF;

  -- 1.8 audit_log.result
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_audit_log_result'
      AND conrelid = '"audit_log"'::regclass
  ) THEN
    ALTER TABLE "audit_log"
      ADD CONSTRAINT "ck_audit_log_result"
      CHECK ("result" IN ('success', 'denied', 'failed'));
  END IF;
END $$;

-- ===== 2. member_adherence_daily_stat 成员日汇总行（plan_id IS NULL）部分唯一索引 =====
-- 建索引前先清理可能因并发产生的重复 NULL 汇总行（保留最新 updated_at 的一条）
DELETE FROM "member_adherence_daily_stat" a
USING "member_adherence_daily_stat" b
WHERE a."plan_id" IS NULL
  AND b."plan_id" IS NULL
  AND a."member_id" = b."member_id"
  AND a."stat_date" = b."stat_date"
  AND (
    a."updated_at" < b."updated_at"
    OR (a."updated_at" = b."updated_at" AND a."id" < b."id")
  );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_adherence_daily_stat_whole_member"
  ON "member_adherence_daily_stat"("member_id", "stat_date")
  WHERE "plan_id" IS NULL;

-- ===== 3. ai_provider_config 同能力单一生效配置部分唯一索引 =====
-- 建索引前若有同 capability 下多条 is_active = true 且未软删的行，仅保留最新 updated_at 的一条激活
UPDATE "ai_provider_config" a
SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
FROM "ai_provider_config" b
WHERE a."deleted_at" IS NULL
  AND b."deleted_at" IS NULL
  AND a."is_active" = true
  AND b."is_active" = true
  AND a."capability" = b."capability"
  AND (
    a."updated_at" < b."updated_at"
    OR (a."updated_at" = b."updated_at" AND a."id" < b."id")
  );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_provider_config_active_capability"
  ON "ai_provider_config"("capability")
  WHERE "is_active" = true AND "deleted_at" IS NULL;
