-- MedOnTime 补充迁移：约束、部分唯一索引、模糊检索索引与大表分区
-- 依据：《数据库表结构设计》V1.2 §2.2（枚举 VARCHAR + CHECK）、§2.5 与附录 A（大表按月分区）、
--       各表注记中的部分唯一要求（4.1 / 4.2 / 4.8 / 6.6 / 9.2 / 剂量阶段表）。
-- 前置条件：紧随基线迁移 20261023090000_init 在空库上执行；若库中已有数据，
--           分区转换前须先做数据搬迁（本脚本不搬数据）。
-- 分区取舍（PostgreSQL 限制）：分区表的主键/唯一键必须包含分区键，故
--   reminder_instance 主键改为 (id, scheduled_at_utc)、幂等唯一键改为
--   (idempotency_key, scheduled_at_utc)（与附录 A 分区形态一致）；
--   指向分区表的入向外键无法只引用 id，本迁移删除 4 条入向 FK
--   （reminder_delivery_log / medication_intake_record / intake_adverse_record
--    → reminder_instance，ai_message → ai_call_log），列与索引保留，
--   引用完整性由应用写入路径保证；其余外键（分区表指向普通表）不受影响。
-- 分区维护：已预建 2026-01 ~ 2027-12 月分区 + DEFAULT 兜底分区；
--   上线后须以定时任务提前创建后续月份分区（或引入 pg_partman）。

-- ===== A. 枚举 CHECK 约束（值域与 DB 设计附录 B / packages/shared 枚举一致）=====
ALTER TABLE "user_account" ADD CONSTRAINT "ck_user_account_register_channel" CHECK ("register_channel" IN ('wechat_miniapp', 'android', 'ios', 'web', 'pc'));
ALTER TABLE "user_account" ADD CONSTRAINT "ck_user_account_status" CHECK ("status" IN ('active', 'frozen', 'cancelling', 'cancelled'));
ALTER TABLE "user_oauth_binding" ADD CONSTRAINT "ck_user_oauth_binding_provider" CHECK ("provider" IN ('wechat', 'apple', 'qq'));
ALTER TABLE "user_device" ADD CONSTRAINT "ck_user_device_platform" CHECK ("platform" IN ('wechat_miniapp', 'android', 'ios', 'windows', 'linux', 'macos', 'web'));
ALTER TABLE "member" ADD CONSTRAINT "ck_member_relationship" CHECK ("relationship" IN ('self', 'father', 'mother', 'spouse', 'child', 'grandparent', 'other_family', 'employer', 'other'));
ALTER TABLE "member" ADD CONSTRAINT "ck_member_gender" CHECK ("gender" IN ('male', 'female', 'unknown'));
ALTER TABLE "member" ADD CONSTRAINT "ck_member_status" CHECK ("status" IN ('active', 'archived', 'removed'));
ALTER TABLE "member_medical_record" ADD CONSTRAINT "ck_member_medical_record_blood_type" CHECK ("blood_type" IN ('A', 'B', 'AB', 'O', 'unknown'));
ALTER TABLE "member_allergy" ADD CONSTRAINT "ck_member_allergy_severity" CHECK ("severity" IN ('mild', 'moderate', 'severe'));
ALTER TABLE "member_allergy" ADD CONSTRAINT "ck_member_allergy_source" CHECK ("source" IN ('self_report', 'caregiver_report', 'admin_entry'));
ALTER TABLE "member_allergy" ADD CONSTRAINT "ck_member_allergy_allergen_type" CHECK ("allergen_type" IN ('drug_category', 'drug', 'other'));
ALTER TABLE "member_medical_history" ADD CONSTRAINT "ck_member_medical_history_status" CHECK ("status" IN ('ongoing', 'recovered', 'monitoring'));
ALTER TABLE "member_medical_history" ADD CONSTRAINT "ck_member_medical_history_source" CHECK ("source" IN ('self_report', 'caregiver_report', 'admin_entry'));
ALTER TABLE "caregiver_authorization" ADD CONSTRAINT "ck_caregiver_authorization_level" CHECK ("level" IN ('L1', 'L2', 'L3'));
ALTER TABLE "caregiver_authorization" ADD CONSTRAINT "ck_caregiver_authorization_status" CHECK ("status" IN ('pending_accept', 'active', 'suspended', 'revoked', 'expired', 'rejected'));
ALTER TABLE "caregiver_authorization_log" ADD CONSTRAINT "ck_caregiver_authorization_log_action" CHECK ("action" IN ('invited', 'accepted', 'rejected', 'level_changed', 'suspended', 'revoked', 'expired', 'reinstated'));
ALTER TABLE "caregiver_authorization_log" ADD CONSTRAINT "ck_caregiver_authorization_log_operator_type" CHECK ("operator_type" IN ('account', 'admin', 'system'));
ALTER TABLE "drug" ADD CONSTRAINT "ck_drug_dosage_form" CHECK ("dosage_form" IN ('tablet', 'capsule', 'granule', 'oral_liquid', 'injection', 'external', 'other'));
ALTER TABLE "drug" ADD CONSTRAINT "ck_drug_source_type" CHECK ("source_type" IN ('platform', 'user_custom'));
ALTER TABLE "drug" ADD CONSTRAINT "ck_drug_review_status" CHECK ("review_status" IN ('draft', 'pending_review', 'approved', 'rejected', 'off_shelf'));
ALTER TABLE "plan_template" ADD CONSTRAINT "ck_plan_template_owner_type" CHECK ("owner_type" IN ('platform', 'account'));
ALTER TABLE "plan_template" ADD CONSTRAINT "ck_plan_template_review_status" CHECK ("review_status" IN ('draft', 'pending_review', 'approved', 'rejected', 'off_shelf'));
ALTER TABLE "plan_template_item" ADD CONSTRAINT "ck_plan_template_item_frequency_type" CHECK ("frequency_type" IN ('daily', 'times_per_day', 'weekly', 'interval_days', 'on_demand', 'course_cycle'));
ALTER TABLE "plan_template_item" ADD CONSTRAINT "ck_plan_template_item_meal_relation" CHECK ("meal_relation" IN ('before_meal', 'with_meal', 'after_meal', 'before_sleep', 'none'));
ALTER TABLE "medication_plan" ADD CONSTRAINT "ck_medication_plan_status" CHECK ("status" IN ('active', 'paused', 'finished', 'stopped'));
ALTER TABLE "medication_plan" ADD CONSTRAINT "ck_medication_plan_plan_type" CHECK ("plan_type" IN ('scheduled', 'prn'));
ALTER TABLE "medication_plan_item" ADD CONSTRAINT "ck_medication_plan_item_frequency_type" CHECK ("frequency_type" IN ('daily', 'times_per_day', 'weekly', 'interval_days', 'on_demand', 'course_cycle'));
ALTER TABLE "medication_plan_item" ADD CONSTRAINT "ck_medication_plan_item_meal_relation" CHECK ("meal_relation" IN ('before_meal', 'with_meal', 'after_meal', 'before_sleep', 'none'));
ALTER TABLE "medication_plan_item" ADD CONSTRAINT "ck_medication_plan_item_course_type" CHECK ("course_type" IN ('long_term', 'fixed_days', 'until_finished'));
ALTER TABLE "medication_plan_item" ADD CONSTRAINT "ck_medication_plan_item_status" CHECK ("status" IN ('active', 'paused', 'stopped'));
ALTER TABLE "medication_plan_change_log" ADD CONSTRAINT "ck_medication_plan_change_log_change_type" CHECK ("change_type" IN ('created', 'item_added', 'item_updated', 'item_removed', 'paused', 'resumed', 'stopped', 'finished'));
ALTER TABLE "plan_change_history" ADD CONSTRAINT "ck_plan_change_history_operator_type" CHECK ("operator_type" IN ('member_self', 'caregiver', 'admin_cs', 'system'));
ALTER TABLE "plan_change_history" ADD CONSTRAINT "ck_plan_change_history_operator_level" CHECK ("operator_level" IN ('L1', 'L2', 'L3', 'self'));
ALTER TABLE "prn_intake_record" ADD CONSTRAINT "ck_prn_intake_record_limit_check_result" CHECK ("limit_check_result" IN ('passed', 'warned_confirmed'));
ALTER TABLE "reminder_instance" ADD CONSTRAINT "ck_reminder_instance_status" CHECK ("status" IN ('pending', 'reminded', 'taken', 'snoozed', 'skipped', 'missed', 'cancelled'));
ALTER TABLE "reminder_instance" ADD CONSTRAINT "ck_reminder_instance_source" CHECK ("source" IN ('schedule', 'manual', 'makeup'));
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "ck_reminder_delivery_log_channel" CHECK ("channel" IN ('app_push', 'wechat_subscribe', 'sms', 'voice_call', 'in_app', 'pc_popup', 'smartwatch', 'smart_speaker'));
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "ck_reminder_delivery_log_result" CHECK ("result" IN ('success', 'failed', 'suppressed_dnd', 'suppressed_dedup'));
ALTER TABLE "medication_intake_record" ADD CONSTRAINT "ck_medication_intake_record_action" CHECK ("action" IN ('taken', 'skipped'));
ALTER TABLE "medication_intake_record" ADD CONSTRAINT "ck_medication_intake_record_confirmation_method" CHECK ("confirmation_method" IN ('tap', 'photo', 'voice'));
ALTER TABLE "member_medication" ADD CONSTRAINT "ck_member_medication_status" CHECK ("status" IN ('in_use', 'depleted', 'expired', 'archived'));
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "ck_medication_stock_ledger_change_type" CHECK ("change_type" IN ('intake_deduct', 'manual_adjust', 'restock', 'expiry_writeoff'));
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "ck_medication_stock_ledger_operator_type" CHECK ("operator_type" IN ('member_self', 'caregiver', 'admin_cs', 'system'));
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "ck_intake_adverse_record_severity" CHECK ("severity" IN ('mild', 'moderate', 'severe'));
ALTER TABLE "notification_template" ADD CONSTRAINT "ck_notification_template_channel" CHECK ("channel" IN ('app_push', 'wechat_subscribe', 'sms', 'voice_call', 'in_app', 'pc_popup', 'smartwatch', 'smart_speaker'));
ALTER TABLE "notification_template" ADD CONSTRAINT "ck_notification_template_status" CHECK ("status" IN ('active', 'disabled'));
ALTER TABLE "consent_record" ADD CONSTRAINT "ck_consent_record_consent_type" CHECK ("consent_type" IN ('privacy_policy', 'sensitive_info', 'caregiver_auth', 'ai_service', 'marketing'));
ALTER TABLE "consent_record" ADD CONSTRAINT "ck_consent_record_action" CHECK ("action" IN ('granted', 'withdrawn'));
ALTER TABLE "consent_record" ADD CONSTRAINT "ck_consent_record_channel" CHECK ("channel" IN ('wechat_miniapp', 'android', 'ios', 'web', 'pc'));
ALTER TABLE "file_attachment" ADD CONSTRAINT "ck_file_attachment_biz_type" CHECK ("biz_type" IN ('medical_record', 'drug_image', 'avatar', 'article_image', 'feedback'));
ALTER TABLE "consent_document" ADD CONSTRAINT "ck_consent_document_doc_type" CHECK ("doc_type" IN ('user_agreement', 'privacy_policy', 'ai_data_use', 'health_data_processing'));
ALTER TABLE "consent_document" ADD CONSTRAINT "ck_consent_document_locale" CHECK ("locale" IN ('zh-CN', 'zh-TW', 'en'));
ALTER TABLE "consent_document" ADD CONSTRAINT "ck_consent_document_status" CHECK ("status" IN ('draft', 'effective', 'superseded'));
ALTER TABLE "user_consent_record" ADD CONSTRAINT "ck_user_consent_record_doc_type" CHECK ("doc_type" IN ('user_agreement', 'privacy_policy', 'ai_data_use', 'health_data_processing'));
ALTER TABLE "user_consent_record" ADD CONSTRAINT "ck_user_consent_record_locale" CHECK ("locale" IN ('zh-CN', 'zh-TW', 'en'));
ALTER TABLE "user_consent_record" ADD CONSTRAINT "ck_user_consent_record_action" CHECK ("action" IN ('confirmed', 'withdrawn'));
ALTER TABLE "user_consent_record" ADD CONSTRAINT "ck_user_consent_record_channel" CHECK ("channel" IN ('web', 'wechat_miniapp', 'android', 'ios', 'pc'));
ALTER TABLE "ai_consent" ADD CONSTRAINT "ck_ai_consent_action" CHECK ("action" IN ('granted', 'withdrawn'));
ALTER TABLE "ai_consent" ADD CONSTRAINT "ck_ai_consent_channel" CHECK ("channel" IN ('wechat_miniapp', 'android', 'ios', 'web', 'pc'));
ALTER TABLE "ai_model_config" ADD CONSTRAINT "ck_ai_model_config_capability" CHECK ("capability" IN ('medical_record_analysis', 'lab_report_interpretation', 'symptom_analysis', 'health_qa', 'timeline_summary', 'adherence_insight'));
ALTER TABLE "ai_model_config" ADD CONSTRAINT "ck_ai_model_config_deployment_mode" CHECK ("deployment_mode" IN ('third_party_api', 'private_deployment'));
ALTER TABLE "ai_model_config" ADD CONSTRAINT "ck_ai_model_config_status" CHECK ("status" IN ('enabled', 'disabled', 'emergency_stopped'));
ALTER TABLE "ai_prompt_template" ADD CONSTRAINT "ck_ai_prompt_template_locale" CHECK ("locale" IN ('zh-CN', 'zh-TW', 'en'));
ALTER TABLE "ai_prompt_template" ADD CONSTRAINT "ck_ai_prompt_template_status" CHECK ("status" IN ('draft', 'pending_review', 'published', 'retired'));
ALTER TABLE "ai_knowledge_entry" ADD CONSTRAINT "ck_ai_knowledge_entry_source_type" CHECK ("source_type" IN ('drug_label', 'popular_science', 'disease_dict', 'department_dict', 'indicator_dict'));
ALTER TABLE "ai_knowledge_entry" ADD CONSTRAINT "ck_ai_knowledge_entry_locale" CHECK ("locale" IN ('zh-CN', 'zh-TW', 'en'));
ALTER TABLE "ai_knowledge_entry" ADD CONSTRAINT "ck_ai_knowledge_entry_review_status" CHECK ("review_status" IN ('draft', 'pending_review', 'approved', 'rejected', 'off_shelf'));
ALTER TABLE "ai_safety_rule" ADD CONSTRAINT "ck_ai_safety_rule_rule_type" CHECK ("rule_type" IN ('emergency_term', 'forbidden_output', 'sensitive_pattern'));
ALTER TABLE "ai_safety_rule" ADD CONSTRAINT "ck_ai_safety_rule_match_mode" CHECK ("match_mode" IN ('keyword', 'regex', 'classifier'));
ALTER TABLE "ai_safety_rule" ADD CONSTRAINT "ck_ai_safety_rule_action" CHECK ("action" IN ('interrupt_emergency', 'block', 'rewrite', 'flag_review'));
ALTER TABLE "ai_safety_rule" ADD CONSTRAINT "ck_ai_safety_rule_status" CHECK ("status" IN ('draft', 'published', 'retired'));
ALTER TABLE "ai_session" ADD CONSTRAINT "ck_ai_session_channel" CHECK ("channel" IN ('web', 'wechat_miniapp', 'android', 'ios', 'pc'));
ALTER TABLE "ai_session" ADD CONSTRAINT "ck_ai_session_status" CHECK ("status" IN ('active', 'completed', 'closed', 'blocked_emergency', 'frozen', 'deleted'));
ALTER TABLE "ai_message" ADD CONSTRAINT "ck_ai_message_role" CHECK ("role" IN ('user', 'assistant', 'system'));
ALTER TABLE "ai_message" ADD CONSTRAINT "ck_ai_message_content_type" CHECK ("content_type" IN ('text', 'voice_transcript', 'image_ref', 'disclaimer', 'emergency_notice'));
ALTER TABLE "ai_message" ADD CONSTRAINT "ck_ai_message_safety_action" CHECK ("safety_action" IN ('pass', 'blocked', 'rewritten'));
ALTER TABLE "ai_consultation" ADD CONSTRAINT "ck_ai_consultation_triage_level" CHECK ("triage_level" IN ('emergency_now', 'urgent_24_48', 'observe'));
ALTER TABLE "ai_consultation" ADD CONSTRAINT "ck_ai_consultation_completeness" CHECK ("completeness" IN ('sufficient', 'insufficient'));
ALTER TABLE "ai_analysis_task" ADD CONSTRAINT "ck_ai_analysis_task_task_type" CHECK ("task_type" IN ('medical_record_analysis', 'lab_report_interpretation', 'timeline_summary', 'plan_info_assist', 'adherence_insight'));
ALTER TABLE "ai_analysis_task" ADD CONSTRAINT "ck_ai_analysis_task_status" CHECK ("status" IN ('queued', 'ocr_processing', 'extracting', 'generating', 'completed', 'failed', 'cancelled'));
ALTER TABLE "ai_report" ADD CONSTRAINT "ck_ai_report_report_type" CHECK ("report_type" IN ('medical_record', 'lab_report', 'timeline_summary', 'plan_info_draft', 'adherence_insight'));
ALTER TABLE "ai_report" ADD CONSTRAINT "ck_ai_report_confirmation_status" CHECK ("confirmation_status" IN ('pending', 'confirmed', 'partially_confirmed', 'rejected'));
ALTER TABLE "ai_report" ADD CONSTRAINT "ck_ai_report_safety_status" CHECK ("safety_status" IN ('passed', 'pending', 'blocked', 'rewritten'));
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ck_ai_call_log_status" CHECK ("status" IN ('success', 'failed', 'timeout', 'blocked'));
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ck_ai_call_log_safety_action" CHECK ("safety_action" IN ('pass', 'blocked', 'rewritten'));
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ck_ai_feedback_target_type" CHECK ("target_type" IN ('message', 'report', 'consultation'));
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ck_ai_feedback_rating" CHECK ("rating" IN ('helpful', 'inaccurate', 'risky'));
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ck_ai_feedback_status" CHECK ("status" IN ('pending', 'triaged', 'resolved'));
ALTER TABLE "ai_output_review" ADD CONSTRAINT "ck_ai_output_review_target_type" CHECK ("target_type" IN ('message', 'report', 'consultation'));
ALTER TABLE "ai_output_review" ADD CONSTRAINT "ck_ai_output_review_review_type" CHECK ("review_type" IN ('safety_auto', 'sampling', 'feedback_triggered'));
ALTER TABLE "ai_output_review" ADD CONSTRAINT "ck_ai_output_review_verdict" CHECK ("verdict" IN ('pass', 'error', 'risky'));
ALTER TABLE "ai_output_review" ADD CONSTRAINT "ck_ai_output_review_status" CHECK ("status" IN ('pending', 'in_review', 'completed'));
ALTER TABLE "admin_user" ADD CONSTRAINT "ck_admin_user_status" CHECK ("status" IN ('active', 'disabled', 'locked'));
ALTER TABLE "audit_log" ADD CONSTRAINT "ck_audit_log_actor_type" CHECK ("actor_type" IN ('admin', 'account', 'system'));
ALTER TABLE "audit_log" ADD CONSTRAINT "ck_audit_log_result" CHECK ("result" IN ('success', 'denied', 'failed'));
ALTER TABLE "feedback_ticket" ADD CONSTRAINT "ck_feedback_ticket_category" CHECK ("category" IN ('usage', 'bug', 'drug_data', 'other'));
ALTER TABLE "feedback_ticket" ADD CONSTRAINT "ck_feedback_ticket_status" CHECK ("status" IN ('open', 'processing', 'resolved', 'closed'));
ALTER TABLE "content_article" ADD CONSTRAINT "ck_content_article_locale" CHECK ("locale" IN ('zh-CN', 'zh-TW', 'en'));
ALTER TABLE "content_article" ADD CONSTRAINT "ck_content_article_status" CHECK ("status" IN ('draft', 'published', 'offline'));
ALTER TABLE "app_version" ADD CONSTRAINT "ck_app_version_platform" CHECK ("platform" IN ('wechat_miniapp', 'android', 'ios', 'windows', 'linux', 'macos', 'web'));
ALTER TABLE "app_version" ADD CONSTRAINT "ck_app_version_status" CHECK ("status" IN ('active', 'deprecated'));

-- ===== B. 部分唯一索引 =====
-- 4.2 第三方绑定：(provider, openid) 仅在未解绑行内唯一
DROP INDEX "user_oauth_binding_provider_openid_key";
CREATE UNIQUE INDEX "user_oauth_binding_provider_openid_key" ON "user_oauth_binding"("provider", "openid") WHERE "unbound_at" IS NULL;
-- 4.1 账号手机号/哈希：软删除（注销脱敏）后释放唯一占用
DROP INDEX "user_account_phone_key";
CREATE UNIQUE INDEX "user_account_phone_key" ON "user_account"("phone") WHERE "deleted_at" IS NULL;
DROP INDEX "user_account_phone_hash_key";
CREATE UNIQUE INDEX "user_account_phone_hash_key" ON "user_account"("phone_hash") WHERE "deleted_at" IS NULL;
-- 4.8 委托授权：同一 (成员, 照护账号) 至多一份未终结授权
CREATE UNIQUE INDEX "uq_auth_active_pair" ON "caregiver_authorization"("member_id", "caregiver_account_id") WHERE "status" IN ('pending_accept', 'active', 'suspended') AND "deleted_at" IS NULL;
-- 6.6 打卡记录：一个提醒实例至多一条有效打卡
DROP INDEX "medication_intake_record_reminder_instance_id_key";
CREATE UNIQUE INDEX "medication_intake_record_reminder_instance_id_key" ON "medication_intake_record"("reminder_instance_id") WHERE "deleted_at" IS NULL;
-- 剂量阶段：全计划阶段（plan_item_id 为空）按 (plan_id, stage_no) 去重
CREATE UNIQUE INDEX "uq_plan_phase_whole_plan" ON "medication_plan_phase"("plan_id", "stage_no") WHERE "plan_item_id" IS NULL;
-- 9.2 模型配置：同一能力有且仅一个主模型
CREATE UNIQUE INDEX "uq_ai_model_primary" ON "ai_model_config"("capability") WHERE "is_primary";

-- ===== C. 药品名称模糊检索（pg_trgm）=====
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "drug_generic_name_trgm_idx" ON "drug" USING gin ("generic_name" gin_trgm_ops);
CREATE INDEX "drug_brand_name_trgm_idx" ON "drug" USING gin ("brand_name" gin_trgm_ops);

-- ===== D. 大表按月分区转换 =====
-- reminder_instance：按 "scheduled_at_utc" 月分区
ALTER TABLE "reminder_delivery_log" DROP CONSTRAINT "reminder_delivery_log_reminder_instance_id_fkey";
ALTER TABLE "medication_intake_record" DROP CONSTRAINT "medication_intake_record_reminder_instance_id_fkey";
ALTER TABLE "intake_adverse_record" DROP CONSTRAINT "intake_adverse_record_reminder_instance_id_fkey";
ALTER TABLE "reminder_instance" RENAME TO "reminder_instance_legacy_20261023";
CREATE TABLE "reminder_instance" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_item_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "drug_name_snapshot" VARCHAR(200) NOT NULL,
    "dose_amount" DECIMAL(10,3) NOT NULL,
    "dose_unit" VARCHAR(32) NOT NULL,
    "scheduled_at_utc" TIMESTAMPTZ(6) NOT NULL,
    "local_date" DATE NOT NULL,
    "local_time" TIME(6) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "snooze_until" TIMESTAMPTZ(6),
    "snooze_count" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "source" VARCHAR(32) NOT NULL DEFAULT 'schedule',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "reminder_instance_pkey" PRIMARY KEY ("id", "scheduled_at_utc")
)
PARTITION BY RANGE ("scheduled_at_utc");
CREATE TABLE "reminder_instance_p202601" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202602" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202603" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202604" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202605" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202606" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202607" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202608" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202609" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202610" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202611" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202612" PARTITION OF "reminder_instance" FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202701" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202702" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202703" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202704" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202705" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202706" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202707" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202708" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-08-01 00:00:00+00') TO ('2027-09-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202709" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-09-01 00:00:00+00') TO ('2027-10-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202710" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-10-01 00:00:00+00') TO ('2027-11-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202711" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-11-01 00:00:00+00') TO ('2027-12-01 00:00:00+00');
CREATE TABLE "reminder_instance_p202712" PARTITION OF "reminder_instance" FOR VALUES FROM ('2027-12-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');
CREATE TABLE "reminder_instance_pdefault" PARTITION OF "reminder_instance" DEFAULT;
DROP TABLE "reminder_instance_legacy_20261023";
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "reminder_instance_idempotency_key_key" ON "reminder_instance"("idempotency_key", "scheduled_at_utc");
CREATE INDEX "reminder_instance_member_id_local_date_local_time_idx" ON "reminder_instance"("member_id", "local_date", "local_time");
CREATE INDEX "reminder_instance_status_scheduled_at_utc_idx" ON "reminder_instance"("status", "scheduled_at_utc");
CREATE INDEX "reminder_instance_plan_id_plan_item_id_idx" ON "reminder_instance"("plan_id", "plan_item_id");

-- reminder_delivery_log：按 "created_at" 月分区
ALTER TABLE "reminder_delivery_log" RENAME TO "reminder_delivery_log_legacy_20261023";
CREATE TABLE "reminder_delivery_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminder_instance_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "device_id" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "result" VARCHAR(32) NOT NULL,
    "provider_msg_id" VARCHAR(128),
    "error_code" VARCHAR(128),
    CONSTRAINT "reminder_delivery_log_pkey" PRIMARY KEY ("id", "created_at")
)
PARTITION BY RANGE ("created_at");
CREATE TABLE "reminder_delivery_log_p202601" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202602" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202603" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202604" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202605" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202606" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202607" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202608" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202609" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202610" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202611" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202612" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202701" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202702" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202703" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202704" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202705" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202706" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202707" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202708" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-08-01 00:00:00+00') TO ('2027-09-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202709" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-09-01 00:00:00+00') TO ('2027-10-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202710" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-10-01 00:00:00+00') TO ('2027-11-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202711" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-11-01 00:00:00+00') TO ('2027-12-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_p202712" PARTITION OF "reminder_delivery_log" FOR VALUES FROM ('2027-12-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');
CREATE TABLE "reminder_delivery_log_pdefault" PARTITION OF "reminder_delivery_log" DEFAULT;
DROP TABLE "reminder_delivery_log_legacy_20261023";
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "user_device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "reminder_delivery_log_reminder_instance_id_idx" ON "reminder_delivery_log"("reminder_instance_id");
CREATE INDEX "reminder_delivery_log_member_id_recipient_account_id_idx" ON "reminder_delivery_log"("member_id", "recipient_account_id");
CREATE INDEX "reminder_delivery_log_result_idx" ON "reminder_delivery_log"("result");

-- ai_call_log：按 "created_at" 月分区
ALTER TABLE "ai_message" DROP CONSTRAINT "ai_message_call_log_id_fkey";
ALTER TABLE "ai_call_log" RENAME TO "ai_call_log_legacy_20261023";
CREATE TABLE "ai_call_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(128) NOT NULL,
    "session_id" UUID,
    "task_id" UUID,
    "member_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "capability" VARCHAR(48) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "model_version" VARCHAR(100) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost" DECIMAL(12,4),
    "currency" VARCHAR(8),
    "latency_ms" INTEGER,
    "status" VARCHAR(32) NOT NULL,
    "safety_action" VARCHAR(32) NOT NULL,
    "emergency_hit" BOOLEAN NOT NULL,
    "deidentified" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ai_call_log_pkey" PRIMARY KEY ("id", "created_at")
)
PARTITION BY RANGE ("created_at");
CREATE TABLE "ai_call_log_p202601" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202602" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202603" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202604" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202605" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202606" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202607" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202608" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202609" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202610" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202611" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202612" PARTITION OF "ai_call_log" FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202701" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202702" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202703" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202704" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202705" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202706" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202707" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202708" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-08-01 00:00:00+00') TO ('2027-09-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202709" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-09-01 00:00:00+00') TO ('2027-10-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202710" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-10-01 00:00:00+00') TO ('2027-11-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202711" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-11-01 00:00:00+00') TO ('2027-12-01 00:00:00+00');
CREATE TABLE "ai_call_log_p202712" PARTITION OF "ai_call_log" FOR VALUES FROM ('2027-12-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');
CREATE TABLE "ai_call_log_pdefault" PARTITION OF "ai_call_log" DEFAULT;
DROP TABLE "ai_call_log_legacy_20261023";
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_analysis_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ai_call_log_request_id_key" ON "ai_call_log"("request_id");
CREATE INDEX "ai_call_log_session_id_idx" ON "ai_call_log"("session_id");
CREATE INDEX "ai_call_log_task_id_idx" ON "ai_call_log"("task_id");
CREATE INDEX "ai_call_log_member_id_account_id_idx" ON "ai_call_log"("member_id", "account_id");
CREATE INDEX "ai_call_log_capability_provider_model_version_prompt_versio_idx" ON "ai_call_log"("capability", "provider", "model_version", "prompt_version");
CREATE INDEX "ai_call_log_created_at_capability_model_version_idx" ON "ai_call_log"("created_at", "capability", "model_version");
CREATE INDEX "ai_call_log_status_idx" ON "ai_call_log"("status");
CREATE INDEX "ai_call_log_safety_action_idx" ON "ai_call_log"("safety_action");
CREATE INDEX "ai_call_log_emergency_hit_idx" ON "ai_call_log"("emergency_hit");

-- audit_log：按 "created_at" 月分区
ALTER TABLE "audit_log" RENAME TO "audit_log_legacy_20261023";
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" VARCHAR(32) NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" UUID,
    "member_id" UUID,
    "detail" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "result" VARCHAR(32) NOT NULL,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id", "created_at")
)
PARTITION BY RANGE ("created_at");
CREATE TABLE "audit_log_p202601" PARTITION OF "audit_log" FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');
CREATE TABLE "audit_log_p202602" PARTITION OF "audit_log" FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');
CREATE TABLE "audit_log_p202603" PARTITION OF "audit_log" FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE "audit_log_p202604" PARTITION OF "audit_log" FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE "audit_log_p202605" PARTITION OF "audit_log" FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE "audit_log_p202606" PARTITION OF "audit_log" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE "audit_log_p202607" PARTITION OF "audit_log" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE "audit_log_p202608" PARTITION OF "audit_log" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE "audit_log_p202609" PARTITION OF "audit_log" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE "audit_log_p202610" PARTITION OF "audit_log" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE "audit_log_p202611" PARTITION OF "audit_log" FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE "audit_log_p202612" PARTITION OF "audit_log" FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE "audit_log_p202701" PARTITION OF "audit_log" FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE "audit_log_p202702" PARTITION OF "audit_log" FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');
CREATE TABLE "audit_log_p202703" PARTITION OF "audit_log" FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');
CREATE TABLE "audit_log_p202704" PARTITION OF "audit_log" FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');
CREATE TABLE "audit_log_p202705" PARTITION OF "audit_log" FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');
CREATE TABLE "audit_log_p202706" PARTITION OF "audit_log" FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');
CREATE TABLE "audit_log_p202707" PARTITION OF "audit_log" FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');
CREATE TABLE "audit_log_p202708" PARTITION OF "audit_log" FOR VALUES FROM ('2027-08-01 00:00:00+00') TO ('2027-09-01 00:00:00+00');
CREATE TABLE "audit_log_p202709" PARTITION OF "audit_log" FOR VALUES FROM ('2027-09-01 00:00:00+00') TO ('2027-10-01 00:00:00+00');
CREATE TABLE "audit_log_p202710" PARTITION OF "audit_log" FOR VALUES FROM ('2027-10-01 00:00:00+00') TO ('2027-11-01 00:00:00+00');
CREATE TABLE "audit_log_p202711" PARTITION OF "audit_log" FOR VALUES FROM ('2027-11-01 00:00:00+00') TO ('2027-12-01 00:00:00+00');
CREATE TABLE "audit_log_p202712" PARTITION OF "audit_log" FOR VALUES FROM ('2027-12-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');
CREATE TABLE "audit_log_pdefault" PARTITION OF "audit_log" DEFAULT;
DROP TABLE "audit_log_legacy_20261023";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "audit_log_actor_type_actor_id_idx" ON "audit_log"("actor_type", "actor_id");
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");
CREATE INDEX "audit_log_member_id_idx" ON "audit_log"("member_id");
CREATE INDEX "audit_log_result_idx" ON "audit_log"("result");

