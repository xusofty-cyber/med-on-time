-- CreateTable
CREATE TABLE "user_account" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(512),
    "phone_hash" CHAR(64),
    "password_hash" VARCHAR(255),
    "nickname" VARCHAR(100) NOT NULL,
    "avatar_file_id" UUID,
    "register_channel" VARCHAR(32) NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_apply_at" TIMESTAMPTZ(6),
    "cancel_reason" VARCHAR(255),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_oauth_binding" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "openid" VARCHAR(128) NOT NULL,
    "unionid" VARCHAR(128),
    "bound_at" TIMESTAMPTZ(6) NOT NULL,
    "unbound_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_oauth_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_device" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "device_name" VARCHAR(100),
    "push_token" VARCHAR(512),
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "app_version" VARCHAR(32),
    "last_active_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "real_name_enc" VARCHAR(512),
    "relationship" VARCHAR(32) NOT NULL,
    "gender" VARCHAR(16),
    "birth_date" DATE,
    "avatar_file_id" UUID,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_medical_record" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "blood_type" VARCHAR(16),
    "height_cm" DECIMAL(5,1),
    "weight_kg" DECIMAL(5,1),
    "primary_hospital" VARCHAR(200),
    "summary_enc" TEXT,
    "emergency_contact_name" VARCHAR(100),
    "emergency_contact_phone_enc" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_medical_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_allergy" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "allergen" VARCHAR(200) NOT NULL,
    "severity" VARCHAR(32),
    "reaction" TEXT,
    "note" TEXT,
    "source" VARCHAR(32) NOT NULL DEFAULT 'self_report',
    "allergen_type" VARCHAR(32) NOT NULL DEFAULT 'other',
    "drug_category_id" UUID,
    "drug_id" UUID,
    "allergen_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_medical_history" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "condition_name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(32),
    "diagnosed_date" DATE,
    "note" TEXT,
    "source" VARCHAR(32) NOT NULL DEFAULT 'self_report',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_medical_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_authorization" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "caregiver_account_id" UUID NOT NULL,
    "granted_by_account_id" UUID NOT NULL,
    "level" VARCHAR(16) NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(32) NOT NULL,
    "invited_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "effective_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "caregiver_authorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_authorization_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorization_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "operator_type" VARCHAR(32) NOT NULL,
    "operator_id" UUID NOT NULL,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "reason" VARCHAR(255),

    CONSTRAINT "caregiver_authorization_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contact" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "contact_name" VARCHAR(100) NOT NULL,
    "phone_enc" VARCHAR(512) NOT NULL,
    "phone_hash" CHAR(64) NOT NULL,
    "relationship" VARCHAR(64) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_category" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "drug_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug" (
    "id" UUID NOT NULL,
    "generic_name" VARCHAR(200) NOT NULL,
    "brand_name" VARCHAR(200),
    "manufacturer" VARCHAR(200),
    "approval_number" VARCHAR(64),
    "barcode" VARCHAR(32),
    "category_id" UUID,
    "dosage_form" VARCHAR(32) NOT NULL,
    "specification" VARCHAR(100) NOT NULL,
    "package_desc" VARCHAR(100),
    "unit" VARCHAR(32) NOT NULL,
    "efficacy" TEXT,
    "usage_default" JSONB,
    "contraindications" TEXT,
    "adverse_reactions" TEXT,
    "interactions" TEXT,
    "storage_condition" VARCHAR(200),
    "image_file_id" UUID,
    "is_otc" BOOLEAN NOT NULL DEFAULT false,
    "source_type" VARCHAR(32) NOT NULL DEFAULT 'platform',
    "created_by_account_id" UUID,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_template" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "scene" VARCHAR(100),
    "description" TEXT,
    "owner_type" VARCHAR(32) NOT NULL,
    "owner_account_id" UUID,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "plan_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_template_item" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "dose_amount" DECIMAL(10,3) NOT NULL,
    "dose_unit" VARCHAR(32) NOT NULL,
    "frequency_type" VARCHAR(32) NOT NULL,
    "frequency_rule" JSONB NOT NULL,
    "meal_relation" VARCHAR(32) NOT NULL DEFAULT 'none',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "plan_template_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_plan" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "source_template_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "note" TEXT,
    "plan_type" VARCHAR(32) NOT NULL DEFAULT 'scheduled',
    "prn_min_interval_minutes" INTEGER,
    "prn_max_per_day" INTEGER,
    "storage_location" VARCHAR(200),
    "additional_note" TEXT,
    "prescription_source_text" VARCHAR(255),
    "prescription_attachment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "medication_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_plan_item" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "drug_name_snapshot" VARCHAR(200) NOT NULL,
    "dose_amount" DECIMAL(10,3) NOT NULL,
    "dose_unit" VARCHAR(32) NOT NULL,
    "frequency_type" VARCHAR(32) NOT NULL,
    "frequency_rule" JSONB NOT NULL,
    "meal_relation" VARCHAR(32) NOT NULL DEFAULT 'none',
    "course_type" VARCHAR(32) NOT NULL DEFAULT 'long_term',
    "course_days" INTEGER,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "medication_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_plan_change_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan_id" UUID NOT NULL,
    "plan_item_id" UUID,
    "member_id" UUID NOT NULL,
    "operator_account_id" UUID NOT NULL,
    "change_type" VARCHAR(32) NOT NULL,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medication_plan_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_plan_phase" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_item_id" UUID,
    "stage_no" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "daily_dose_amount" DECIMAL(10,3) NOT NULL,
    "daily_dose_unit" VARCHAR(32) NOT NULL,
    "is_final_stop" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "medication_plan_phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_change_history" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan_id" UUID NOT NULL,
    "plan_item_id" UUID,
    "member_id" UUID NOT NULL,
    "changed_field" VARCHAR(64) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "operator_account_id" UUID,
    "operator_type" VARCHAR(32) NOT NULL,
    "operator_level" VARCHAR(16),
    "change_log_id" UUID,

    CONSTRAINT "plan_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prn_intake_record" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_item_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "drug_name_snapshot" VARCHAR(200) NOT NULL,
    "dose_amount" DECIMAL(10,3) NOT NULL,
    "dose_unit" VARCHAR(32) NOT NULL,
    "taken_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "local_date" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "reason_note" TEXT,
    "limit_check_result" VARCHAR(32) NOT NULL DEFAULT 'passed',
    "operated_by_account_id" UUID NOT NULL,
    "client_request_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "prn_intake_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "reminder_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "reminder_delivery_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_intake_record" (
    "id" UUID NOT NULL,
    "reminder_instance_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_item_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "taken_at" TIMESTAMPTZ(6),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "is_makeup" BOOLEAN NOT NULL DEFAULT false,
    "operated_by_account_id" UUID NOT NULL,
    "skip_reason" VARCHAR(255),
    "client_request_id" VARCHAR(128) NOT NULL,
    "confirmation_method" VARCHAR(32) NOT NULL DEFAULT 'tap',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "medication_intake_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_drug_inventory" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "batch_no" VARCHAR(64),
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expiry_date" DATE,
    "alert_threshold" DECIMAL(10,2),
    "last_restocked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_drug_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_adherence_daily_stat" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "member_id" UUID NOT NULL,
    "stat_date" DATE NOT NULL,
    "plan_id" UUID,
    "scheduled_count" INTEGER NOT NULL DEFAULT 0,
    "taken_count" INTEGER NOT NULL DEFAULT 0,
    "on_time_count" INTEGER NOT NULL DEFAULT 0,
    "missed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "adherence_rate" DECIMAL(5,4),

    CONSTRAINT "member_adherence_daily_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_medication" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "stock_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_unit" VARCHAR(32) NOT NULL,
    "current_batch_expiry_date" DATE,
    "storage_location" VARCHAR(200),
    "low_stock_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'in_use',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_stock_ledger" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "member_medication_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "drug_id" UUID NOT NULL,
    "change_type" VARCHAR(32) NOT NULL,
    "change_amount" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "intake_record_id" UUID,
    "prn_intake_id" UUID,
    "operator_account_id" UUID,
    "operator_type" VARCHAR(32) NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "medication_stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_adverse_record" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "intake_record_id" UUID,
    "reminder_instance_id" UUID,
    "prn_intake_id" UUID,
    "plan_item_id" UUID,
    "symptom_tags" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "severity" VARCHAR(32) NOT NULL DEFAULT 'mild',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "intake_adverse_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "content_group_id" UUID NOT NULL,
    "title_template" VARCHAR(200) NOT NULL,
    "body_template" TEXT NOT NULL,
    "provider_template_id" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" UUID NOT NULL,
    "member_id" UUID,
    "consent_type" VARCHAR(64) NOT NULL,
    "document_version" VARCHAR(32) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "channel" VARCHAR(32),
    "ip_address" VARCHAR(64),

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachment" (
    "id" UUID NOT NULL,
    "owner_account_id" UUID NOT NULL,
    "member_id" UUID,
    "biz_type" VARCHAR(32) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "file_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_document" (
    "id" UUID NOT NULL,
    "doc_type" VARCHAR(64) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content_ref" VARCHAR(512) NOT NULL,
    "content_sha256" CHAR(64),
    "effective_date" DATE NOT NULL,
    "is_material_change" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "published_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "consent_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consent_record" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" UUID NOT NULL,
    "member_id" UUID,
    "document_id" UUID NOT NULL,
    "doc_type" VARCHAR(64) NOT NULL,
    "document_version" VARCHAR(32) NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "ip_address" VARCHAR(64),

    CONSTRAINT "user_consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_consent" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "consent_version" VARCHAR(32) NOT NULL,
    "scopes" JSONB NOT NULL,
    "guardian_account_id" UUID,
    "channel" VARCHAR(32),
    "ip_address" VARCHAR(64),

    CONSTRAINT "ai_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_config" (
    "id" UUID NOT NULL,
    "capability" VARCHAR(48) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "model_version" VARCHAR(100) NOT NULL,
    "endpoint_ref" VARCHAR(255) NOT NULL,
    "secret_ref" VARCHAR(255) NOT NULL,
    "deployment_mode" VARCHAR(32) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "fallback_config_id" UUID,
    "timeout_ms" INTEGER NOT NULL,
    "max_retries" INTEGER NOT NULL,
    "gray_scope" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'disabled',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_model_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_template" (
    "id" UUID NOT NULL,
    "capability" VARCHAR(48) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "redline_version" VARCHAR(32) NOT NULL,
    "locale" VARCHAR(12) NOT NULL DEFAULT 'zh-CN',
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "effective_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_prompt_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_entry" (
    "id" UUID NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "source_ref_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "content_group_id" UUID NOT NULL,
    "review_status" VARCHAR(32) NOT NULL,
    "reviewed_by" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_knowledge_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_safety_rule" (
    "id" UUID NOT NULL,
    "rule_type" VARCHAR(32) NOT NULL,
    "pattern" TEXT NOT NULL,
    "match_mode" VARCHAR(32) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "capability_scope" JSONB,
    "version" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_safety_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_session" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "initiator_account_id" UUID NOT NULL,
    "authorization_id" UUID,
    "consent_id" UUID NOT NULL,
    "capability" VARCHAR(48) NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "model_config_id" UUID NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "safety_rule_version" VARCHAR(32) NOT NULL,
    "emergency_hit" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "title" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "content_enc" TEXT,
    "content_type" VARCHAR(32) NOT NULL DEFAULT 'text',
    "attachment_file_id" UUID,
    "safety_action" VARCHAR(32) NOT NULL DEFAULT 'pass',
    "call_log_id" UUID,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_consultation" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "symptom_summary_enc" TEXT NOT NULL,
    "collected_facts" JSONB NOT NULL,
    "possibilities" JSONB,
    "triage_level" VARCHAR(32),
    "recommended_actions" JSONB,
    "warning_signs" JSONB,
    "department_suggestion" VARCHAR(100),
    "completeness" VARCHAR(32) NOT NULL,
    "disclaimer_version" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analysis_task" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "initiator_account_id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "task_type" VARCHAR(48) NOT NULL,
    "source_file_ids" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "model_config_id" UUID NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "error_code" VARCHAR(64),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_analysis_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_report" (
    "id" UUID NOT NULL,
    "task_id" UUID,
    "session_id" UUID,
    "member_id" UUID NOT NULL,
    "report_type" VARCHAR(48) NOT NULL,
    "structured_extract" JSONB,
    "indicators" JSONB,
    "interpretation_enc" TEXT,
    "plan_relation_tips" JSONB,
    "confirmation_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "report_version" INTEGER NOT NULL,
    "supersedes_report_id" UUID,
    "model_config_id" UUID,
    "prompt_version" VARCHAR(32),
    "safety_status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "ai_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" UUID NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "rating" VARCHAR(32) NOT NULL,
    "comment" TEXT,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_output_review" (
    "id" UUID NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" UUID NOT NULL,
    "review_type" VARCHAR(32) NOT NULL,
    "reviewer_admin_id" UUID,
    "verdict" VARCHAR(32) NOT NULL,
    "labels" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_output_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "real_name" VARCHAR(100) NOT NULL,
    "phone_enc" VARCHAR(512),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "admin_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permission" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "module" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "admin_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_role" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "admin_user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permission" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "admin_role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" UUID NOT NULL,
    "config_key" VARCHAR(128) NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_ticket" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "member_id" UUID,
    "category" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'open',
    "assigned_admin_id" UUID,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "feedback_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_article" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "body" TEXT NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "content_group_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "author_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "content_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_version" (
    "id" UUID NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "min_supported_version" VARCHAR(32),
    "release_note" TEXT,
    "download_url" VARCHAR(512),
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "app_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_account_phone_key" ON "user_account"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_phone_hash_key" ON "user_account"("phone_hash");

-- CreateIndex
CREATE INDEX "user_account_status_idx" ON "user_account"("status");

-- CreateIndex
CREATE INDEX "user_account_registered_at_idx" ON "user_account"("registered_at");

-- CreateIndex
CREATE INDEX "user_oauth_binding_account_id_idx" ON "user_oauth_binding"("account_id");

-- CreateIndex
CREATE INDEX "user_oauth_binding_unionid_idx" ON "user_oauth_binding"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "user_oauth_binding_provider_openid_key" ON "user_oauth_binding"("provider", "openid");

-- CreateIndex
CREATE INDEX "user_device_account_id_idx" ON "user_device"("account_id");

-- CreateIndex
CREATE INDEX "user_device_platform_idx" ON "user_device"("platform");

-- CreateIndex
CREATE INDEX "user_device_last_active_at_idx" ON "user_device"("last_active_at");

-- CreateIndex
CREATE INDEX "member_account_id_status_idx" ON "member"("account_id", "status");

-- CreateIndex
CREATE INDEX "member_relationship_idx" ON "member"("relationship");

-- CreateIndex
CREATE INDEX "member_status_idx" ON "member"("status");

-- CreateIndex
CREATE UNIQUE INDEX "member_medical_record_member_id_key" ON "member_medical_record"("member_id");

-- CreateIndex
CREATE INDEX "member_allergy_member_id_idx" ON "member_allergy"("member_id");

-- CreateIndex
CREATE INDEX "member_allergy_allergen_idx" ON "member_allergy"("allergen");

-- CreateIndex
CREATE INDEX "member_allergy_allergen_type_idx" ON "member_allergy"("allergen_type");

-- CreateIndex
CREATE INDEX "member_allergy_drug_category_id_idx" ON "member_allergy"("drug_category_id");

-- CreateIndex
CREATE INDEX "member_allergy_drug_id_idx" ON "member_allergy"("drug_id");

-- CreateIndex
CREATE INDEX "member_allergy_allergen_code_idx" ON "member_allergy"("allergen_code");

-- CreateIndex
CREATE INDEX "member_medical_history_member_id_idx" ON "member_medical_history"("member_id");

-- CreateIndex
CREATE INDEX "member_medical_history_condition_name_idx" ON "member_medical_history"("condition_name");

-- CreateIndex
CREATE INDEX "caregiver_authorization_member_id_idx" ON "caregiver_authorization"("member_id");

-- CreateIndex
CREATE INDEX "caregiver_authorization_caregiver_account_id_idx" ON "caregiver_authorization"("caregiver_account_id");

-- CreateIndex
CREATE INDEX "caregiver_authorization_level_idx" ON "caregiver_authorization"("level");

-- CreateIndex
CREATE INDEX "caregiver_authorization_status_idx" ON "caregiver_authorization"("status");

-- CreateIndex
CREATE INDEX "caregiver_authorization_expires_at_idx" ON "caregiver_authorization"("expires_at");

-- CreateIndex
CREATE INDEX "caregiver_authorization_log_authorization_id_idx" ON "caregiver_authorization_log"("authorization_id");

-- CreateIndex
CREATE INDEX "caregiver_authorization_log_action_idx" ON "caregiver_authorization_log"("action");

-- CreateIndex
CREATE INDEX "caregiver_authorization_log_operator_type_operator_id_idx" ON "caregiver_authorization_log"("operator_type", "operator_id");

-- CreateIndex
CREATE INDEX "emergency_contact_member_id_priority_idx" ON "emergency_contact"("member_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "drug_category_code_key" ON "drug_category"("code");

-- CreateIndex
CREATE INDEX "drug_category_parent_id_idx" ON "drug_category"("parent_id");

-- CreateIndex
CREATE INDEX "drug_category_name_idx" ON "drug_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "drug_approval_number_key" ON "drug"("approval_number");

-- CreateIndex
CREATE UNIQUE INDEX "drug_barcode_key" ON "drug"("barcode");

-- CreateIndex
CREATE INDEX "drug_category_id_idx" ON "drug"("category_id");

-- CreateIndex
CREATE INDEX "drug_manufacturer_idx" ON "drug"("manufacturer");

-- CreateIndex
CREATE INDEX "drug_source_type_idx" ON "drug"("source_type");

-- CreateIndex
CREATE INDEX "drug_created_by_account_id_idx" ON "drug"("created_by_account_id");

-- CreateIndex
CREATE INDEX "drug_review_status_idx" ON "drug"("review_status");

-- CreateIndex
CREATE INDEX "drug_review_status_category_id_idx" ON "drug"("review_status", "category_id");

-- CreateIndex
CREATE INDEX "plan_template_name_idx" ON "plan_template"("name");

-- CreateIndex
CREATE INDEX "plan_template_scene_idx" ON "plan_template"("scene");

-- CreateIndex
CREATE INDEX "plan_template_owner_type_idx" ON "plan_template"("owner_type");

-- CreateIndex
CREATE INDEX "plan_template_owner_account_id_idx" ON "plan_template"("owner_account_id");

-- CreateIndex
CREATE INDEX "plan_template_review_status_idx" ON "plan_template"("review_status");

-- CreateIndex
CREATE INDEX "plan_template_item_template_id_idx" ON "plan_template_item"("template_id");

-- CreateIndex
CREATE INDEX "plan_template_item_drug_id_idx" ON "plan_template_item"("drug_id");

-- CreateIndex
CREATE INDEX "medication_plan_member_id_idx" ON "medication_plan"("member_id");

-- CreateIndex
CREATE INDEX "medication_plan_created_by_account_id_idx" ON "medication_plan"("created_by_account_id");

-- CreateIndex
CREATE INDEX "medication_plan_start_date_idx" ON "medication_plan"("start_date");

-- CreateIndex
CREATE INDEX "medication_plan_status_idx" ON "medication_plan"("status");

-- CreateIndex
CREATE INDEX "medication_plan_plan_type_idx" ON "medication_plan"("plan_type");

-- CreateIndex
CREATE INDEX "medication_plan_item_plan_id_idx" ON "medication_plan_item"("plan_id");

-- CreateIndex
CREATE INDEX "medication_plan_item_drug_id_idx" ON "medication_plan_item"("drug_id");

-- CreateIndex
CREATE INDEX "medication_plan_item_frequency_type_idx" ON "medication_plan_item"("frequency_type");

-- CreateIndex
CREATE INDEX "medication_plan_item_status_idx" ON "medication_plan_item"("status");

-- CreateIndex
CREATE INDEX "medication_plan_change_log_plan_id_idx" ON "medication_plan_change_log"("plan_id");

-- CreateIndex
CREATE INDEX "medication_plan_change_log_plan_item_id_idx" ON "medication_plan_change_log"("plan_item_id");

-- CreateIndex
CREATE INDEX "medication_plan_change_log_member_id_idx" ON "medication_plan_change_log"("member_id");

-- CreateIndex
CREATE INDEX "medication_plan_change_log_operator_account_id_idx" ON "medication_plan_change_log"("operator_account_id");

-- CreateIndex
CREATE INDEX "medication_plan_change_log_change_type_idx" ON "medication_plan_change_log"("change_type");

-- CreateIndex
CREATE INDEX "medication_plan_phase_plan_item_id_idx" ON "medication_plan_phase"("plan_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_plan_phase_plan_id_plan_item_id_stage_no_key" ON "medication_plan_phase"("plan_id", "plan_item_id", "stage_no");

-- CreateIndex
CREATE INDEX "plan_change_history_plan_id_created_at_idx" ON "plan_change_history"("plan_id", "created_at");

-- CreateIndex
CREATE INDEX "plan_change_history_plan_item_id_idx" ON "plan_change_history"("plan_item_id");

-- CreateIndex
CREATE INDEX "plan_change_history_member_id_idx" ON "plan_change_history"("member_id");

-- CreateIndex
CREATE INDEX "plan_change_history_changed_field_idx" ON "plan_change_history"("changed_field");

-- CreateIndex
CREATE INDEX "plan_change_history_operator_account_id_idx" ON "plan_change_history"("operator_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "prn_intake_record_client_request_id_key" ON "prn_intake_record"("client_request_id");

-- CreateIndex
CREATE INDEX "prn_intake_record_member_id_plan_id_idx" ON "prn_intake_record"("member_id", "plan_id");

-- CreateIndex
CREATE INDEX "prn_intake_record_plan_item_id_idx" ON "prn_intake_record"("plan_item_id");

-- CreateIndex
CREATE INDEX "prn_intake_record_drug_id_idx" ON "prn_intake_record"("drug_id");

-- CreateIndex
CREATE INDEX "prn_intake_record_member_id_taken_at_idx" ON "prn_intake_record"("member_id", "taken_at");

-- CreateIndex
CREATE INDEX "prn_intake_record_member_id_local_date_idx" ON "prn_intake_record"("member_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_instance_idempotency_key_key" ON "reminder_instance"("idempotency_key");

-- CreateIndex
CREATE INDEX "reminder_instance_member_id_local_date_local_time_idx" ON "reminder_instance"("member_id", "local_date", "local_time");

-- CreateIndex
CREATE INDEX "reminder_instance_status_scheduled_at_utc_idx" ON "reminder_instance"("status", "scheduled_at_utc");

-- CreateIndex
CREATE INDEX "reminder_instance_plan_id_plan_item_id_idx" ON "reminder_instance"("plan_id", "plan_item_id");

-- CreateIndex
CREATE INDEX "reminder_delivery_log_reminder_instance_id_idx" ON "reminder_delivery_log"("reminder_instance_id");

-- CreateIndex
CREATE INDEX "reminder_delivery_log_member_id_recipient_account_id_idx" ON "reminder_delivery_log"("member_id", "recipient_account_id");

-- CreateIndex
CREATE INDEX "reminder_delivery_log_result_idx" ON "reminder_delivery_log"("result");

-- CreateIndex
CREATE UNIQUE INDEX "medication_intake_record_reminder_instance_id_key" ON "medication_intake_record"("reminder_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_intake_record_client_request_id_key" ON "medication_intake_record"("client_request_id");

-- CreateIndex
CREATE INDEX "medication_intake_record_member_id_plan_item_id_idx" ON "medication_intake_record"("member_id", "plan_item_id");

-- CreateIndex
CREATE INDEX "medication_intake_record_action_idx" ON "medication_intake_record"("action");

-- CreateIndex
CREATE INDEX "medication_intake_record_member_id_taken_at_idx" ON "medication_intake_record"("member_id", "taken_at");

-- CreateIndex
CREATE INDEX "member_drug_inventory_expiry_date_idx" ON "member_drug_inventory"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "member_drug_inventory_member_id_drug_id_batch_no_key" ON "member_drug_inventory"("member_id", "drug_id", "batch_no");

-- CreateIndex
CREATE UNIQUE INDEX "member_adherence_daily_stat_member_id_stat_date_plan_id_key" ON "member_adherence_daily_stat"("member_id", "stat_date", "plan_id");

-- CreateIndex
CREATE INDEX "member_medication_current_batch_expiry_date_idx" ON "member_medication"("current_batch_expiry_date");

-- CreateIndex
CREATE INDEX "member_medication_status_idx" ON "member_medication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "member_medication_member_id_drug_id_key" ON "member_medication"("member_id", "drug_id");

-- CreateIndex
CREATE INDEX "medication_stock_ledger_member_medication_id_created_at_idx" ON "medication_stock_ledger"("member_medication_id", "created_at");

-- CreateIndex
CREATE INDEX "medication_stock_ledger_member_id_drug_id_idx" ON "medication_stock_ledger"("member_id", "drug_id");

-- CreateIndex
CREATE INDEX "medication_stock_ledger_change_type_idx" ON "medication_stock_ledger"("change_type");

-- CreateIndex
CREATE INDEX "intake_adverse_record_member_id_occurred_at_idx" ON "intake_adverse_record"("member_id", "occurred_at");

-- CreateIndex
CREATE INDEX "intake_adverse_record_intake_record_id_idx" ON "intake_adverse_record"("intake_record_id");

-- CreateIndex
CREATE INDEX "intake_adverse_record_reminder_instance_id_idx" ON "intake_adverse_record"("reminder_instance_id");

-- CreateIndex
CREATE INDEX "intake_adverse_record_prn_intake_id_idx" ON "intake_adverse_record"("prn_intake_id");

-- CreateIndex
CREATE INDEX "intake_adverse_record_plan_item_id_idx" ON "intake_adverse_record"("plan_item_id");

-- CreateIndex
CREATE INDEX "intake_adverse_record_severity_idx" ON "intake_adverse_record"("severity");

-- CreateIndex
CREATE INDEX "notification_template_content_group_id_locale_idx" ON "notification_template"("content_group_id", "locale");

-- CreateIndex
CREATE INDEX "notification_template_status_idx" ON "notification_template"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_code_channel_locale_key" ON "notification_template"("code", "channel", "locale");

-- CreateIndex
CREATE INDEX "consent_record_account_id_member_id_idx" ON "consent_record"("account_id", "member_id");

-- CreateIndex
CREATE INDEX "consent_record_consent_type_idx" ON "consent_record"("consent_type");

-- CreateIndex
CREATE INDEX "consent_record_action_idx" ON "consent_record"("action");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachment_storage_key_key" ON "file_attachment"("storage_key");

-- CreateIndex
CREATE INDEX "file_attachment_owner_account_id_member_id_idx" ON "file_attachment"("owner_account_id", "member_id");

-- CreateIndex
CREATE INDEX "file_attachment_biz_type_idx" ON "file_attachment"("biz_type");

-- CreateIndex
CREATE INDEX "file_attachment_sha256_idx" ON "file_attachment"("sha256");

-- CreateIndex
CREATE INDEX "consent_document_effective_date_idx" ON "consent_document"("effective_date");

-- CreateIndex
CREATE INDEX "consent_document_status_idx" ON "consent_document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "consent_document_doc_type_locale_version_key" ON "consent_document"("doc_type", "locale", "version");

-- CreateIndex
CREATE INDEX "user_consent_record_account_id_document_id_confirmed_at_idx" ON "user_consent_record"("account_id", "document_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "user_consent_record_member_id_idx" ON "user_consent_record"("member_id");

-- CreateIndex
CREATE INDEX "user_consent_record_doc_type_locale_idx" ON "user_consent_record"("doc_type", "locale");

-- CreateIndex
CREATE INDEX "ai_consent_account_id_member_id_idx" ON "ai_consent"("account_id", "member_id");

-- CreateIndex
CREATE INDEX "ai_consent_action_idx" ON "ai_consent"("action");

-- CreateIndex
CREATE INDEX "ai_model_config_capability_idx" ON "ai_model_config"("capability");

-- CreateIndex
CREATE INDEX "ai_model_config_provider_model_name_model_version_idx" ON "ai_model_config"("provider", "model_name", "model_version");

-- CreateIndex
CREATE INDEX "ai_model_config_status_idx" ON "ai_model_config"("status");

-- CreateIndex
CREATE INDEX "ai_prompt_template_capability_name_idx" ON "ai_prompt_template"("capability", "name");

-- CreateIndex
CREATE INDEX "ai_prompt_template_status_idx" ON "ai_prompt_template"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_template_capability_version_locale_key" ON "ai_prompt_template"("capability", "version", "locale");

-- CreateIndex
CREATE INDEX "ai_knowledge_entry_source_type_idx" ON "ai_knowledge_entry"("source_type");

-- CreateIndex
CREATE INDEX "ai_knowledge_entry_review_status_idx" ON "ai_knowledge_entry"("review_status");

-- CreateIndex
CREATE INDEX "ai_knowledge_entry_content_group_id_locale_idx" ON "ai_knowledge_entry"("content_group_id", "locale");

-- CreateIndex
CREATE INDEX "ai_safety_rule_rule_type_idx" ON "ai_safety_rule"("rule_type");

-- CreateIndex
CREATE INDEX "ai_safety_rule_action_idx" ON "ai_safety_rule"("action");

-- CreateIndex
CREATE INDEX "ai_safety_rule_version_idx" ON "ai_safety_rule"("version");

-- CreateIndex
CREATE INDEX "ai_safety_rule_status_idx" ON "ai_safety_rule"("status");

-- CreateIndex
CREATE INDEX "ai_session_member_id_started_at_idx" ON "ai_session"("member_id", "started_at");

-- CreateIndex
CREATE INDEX "ai_session_initiator_account_id_idx" ON "ai_session"("initiator_account_id");

-- CreateIndex
CREATE INDEX "ai_session_consent_id_idx" ON "ai_session"("consent_id");

-- CreateIndex
CREATE INDEX "ai_session_capability_idx" ON "ai_session"("capability");

-- CreateIndex
CREATE INDEX "ai_session_emergency_hit_idx" ON "ai_session"("emergency_hit");

-- CreateIndex
CREATE INDEX "ai_session_status_idx" ON "ai_session"("status");

-- CreateIndex
CREATE INDEX "ai_message_safety_action_idx" ON "ai_message"("safety_action");

-- CreateIndex
CREATE UNIQUE INDEX "ai_message_session_id_seq_key" ON "ai_message"("session_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ai_consultation_session_id_key" ON "ai_consultation"("session_id");

-- CreateIndex
CREATE INDEX "ai_consultation_member_id_idx" ON "ai_consultation"("member_id");

-- CreateIndex
CREATE INDEX "ai_consultation_triage_level_idx" ON "ai_consultation"("triage_level");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analysis_task_idempotency_key_key" ON "ai_analysis_task"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_analysis_task_member_id_initiator_account_id_idx" ON "ai_analysis_task"("member_id", "initiator_account_id");

-- CreateIndex
CREATE INDEX "ai_analysis_task_consent_id_idx" ON "ai_analysis_task"("consent_id");

-- CreateIndex
CREATE INDEX "ai_analysis_task_task_type_idx" ON "ai_analysis_task"("task_type");

-- CreateIndex
CREATE INDEX "ai_analysis_task_status_idx" ON "ai_analysis_task"("status");

-- CreateIndex
CREATE INDEX "ai_report_task_id_session_id_member_id_idx" ON "ai_report"("task_id", "session_id", "member_id");

-- CreateIndex
CREATE INDEX "ai_report_member_id_created_at_idx" ON "ai_report"("member_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_report_report_type_idx" ON "ai_report"("report_type");

-- CreateIndex
CREATE INDEX "ai_report_confirmation_status_idx" ON "ai_report"("confirmation_status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_call_log_request_id_key" ON "ai_call_log"("request_id");

-- CreateIndex
CREATE INDEX "ai_call_log_session_id_idx" ON "ai_call_log"("session_id");

-- CreateIndex
CREATE INDEX "ai_call_log_task_id_idx" ON "ai_call_log"("task_id");

-- CreateIndex
CREATE INDEX "ai_call_log_member_id_account_id_idx" ON "ai_call_log"("member_id", "account_id");

-- CreateIndex
CREATE INDEX "ai_call_log_capability_provider_model_version_prompt_versio_idx" ON "ai_call_log"("capability", "provider", "model_version", "prompt_version");

-- CreateIndex
CREATE INDEX "ai_call_log_created_at_capability_model_version_idx" ON "ai_call_log"("created_at", "capability", "model_version");

-- CreateIndex
CREATE INDEX "ai_call_log_status_idx" ON "ai_call_log"("status");

-- CreateIndex
CREATE INDEX "ai_call_log_safety_action_idx" ON "ai_call_log"("safety_action");

-- CreateIndex
CREATE INDEX "ai_call_log_emergency_hit_idx" ON "ai_call_log"("emergency_hit");

-- CreateIndex
CREATE INDEX "ai_feedback_target_type_target_id_idx" ON "ai_feedback"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ai_feedback_account_id_member_id_idx" ON "ai_feedback"("account_id", "member_id");

-- CreateIndex
CREATE INDEX "ai_feedback_rating_idx" ON "ai_feedback"("rating");

-- CreateIndex
CREATE INDEX "ai_feedback_status_idx" ON "ai_feedback"("status");

-- CreateIndex
CREATE INDEX "ai_output_review_target_type_target_id_idx" ON "ai_output_review"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ai_output_review_review_type_idx" ON "ai_output_review"("review_type");

-- CreateIndex
CREATE INDEX "ai_output_review_status_created_at_idx" ON "ai_output_review"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_username_key" ON "admin_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_code_key" ON "admin_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permission_code_key" ON "admin_permission"("code");

-- CreateIndex
CREATE INDEX "admin_permission_module_idx" ON "admin_permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_role_admin_user_id_role_id_key" ON "admin_user_role"("admin_user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_permission_role_id_permission_id_key" ON "admin_role_permission"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_type_actor_id_idx" ON "audit_log"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_member_id_idx" ON "audit_log"("member_id");

-- CreateIndex
CREATE INDEX "audit_log_result_idx" ON "audit_log"("result");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_config_key_key" ON "system_config"("config_key");

-- CreateIndex
CREATE INDEX "feedback_ticket_account_id_idx" ON "feedback_ticket"("account_id");

-- CreateIndex
CREATE INDEX "feedback_ticket_status_created_at_idx" ON "feedback_ticket"("status", "created_at");

-- CreateIndex
CREATE INDEX "content_article_content_group_id_locale_idx" ON "content_article"("content_group_id", "locale");

-- CreateIndex
CREATE INDEX "content_article_status_idx" ON "content_article"("status");

-- CreateIndex
CREATE INDEX "content_article_created_at_idx" ON "content_article"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_version_platform_version_key" ON "app_version"("platform", "version");

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "file_attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_oauth_binding" ADD CONSTRAINT "user_oauth_binding_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_device" ADD CONSTRAINT "user_device_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "file_attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_medical_record" ADD CONSTRAINT "member_medical_record_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_allergy" ADD CONSTRAINT "member_allergy_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_allergy" ADD CONSTRAINT "member_allergy_drug_category_id_fkey" FOREIGN KEY ("drug_category_id") REFERENCES "drug_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_allergy" ADD CONSTRAINT "member_allergy_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_medical_history" ADD CONSTRAINT "member_medical_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_authorization" ADD CONSTRAINT "caregiver_authorization_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_authorization" ADD CONSTRAINT "caregiver_authorization_caregiver_account_id_fkey" FOREIGN KEY ("caregiver_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_authorization" ADD CONSTRAINT "caregiver_authorization_granted_by_account_id_fkey" FOREIGN KEY ("granted_by_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_authorization_log" ADD CONSTRAINT "caregiver_authorization_log_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "caregiver_authorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contact" ADD CONSTRAINT "emergency_contact_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_category" ADD CONSTRAINT "drug_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "drug_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug" ADD CONSTRAINT "drug_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "drug_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug" ADD CONSTRAINT "drug_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "file_attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug" ADD CONSTRAINT "drug_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template" ADD CONSTRAINT "plan_template_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template_item" ADD CONSTRAINT "plan_template_item_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "plan_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template_item" ADD CONSTRAINT "plan_template_item_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan" ADD CONSTRAINT "medication_plan_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan" ADD CONSTRAINT "medication_plan_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan" ADD CONSTRAINT "medication_plan_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "plan_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan" ADD CONSTRAINT "medication_plan_prescription_attachment_id_fkey" FOREIGN KEY ("prescription_attachment_id") REFERENCES "file_attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_item" ADD CONSTRAINT "medication_plan_item_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_item" ADD CONSTRAINT "medication_plan_item_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_change_log" ADD CONSTRAINT "medication_plan_change_log_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_change_log" ADD CONSTRAINT "medication_plan_change_log_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_change_log" ADD CONSTRAINT "medication_plan_change_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_change_log" ADD CONSTRAINT "medication_plan_change_log_operator_account_id_fkey" FOREIGN KEY ("operator_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_phase" ADD CONSTRAINT "medication_plan_phase_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_plan_phase" ADD CONSTRAINT "medication_plan_phase_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_history" ADD CONSTRAINT "plan_change_history_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_history" ADD CONSTRAINT "plan_change_history_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_history" ADD CONSTRAINT "plan_change_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_history" ADD CONSTRAINT "plan_change_history_operator_account_id_fkey" FOREIGN KEY ("operator_account_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_history" ADD CONSTRAINT "plan_change_history_change_log_id_fkey" FOREIGN KEY ("change_log_id") REFERENCES "medication_plan_change_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_intake_record" ADD CONSTRAINT "prn_intake_record_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_intake_record" ADD CONSTRAINT "prn_intake_record_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_intake_record" ADD CONSTRAINT "prn_intake_record_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_intake_record" ADD CONSTRAINT "prn_intake_record_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_intake_record" ADD CONSTRAINT "prn_intake_record_operated_by_account_id_fkey" FOREIGN KEY ("operated_by_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_instance" ADD CONSTRAINT "reminder_instance_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_reminder_instance_id_fkey" FOREIGN KEY ("reminder_instance_id") REFERENCES "reminder_instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "user_device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_intake_record" ADD CONSTRAINT "medication_intake_record_reminder_instance_id_fkey" FOREIGN KEY ("reminder_instance_id") REFERENCES "reminder_instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_intake_record" ADD CONSTRAINT "medication_intake_record_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_intake_record" ADD CONSTRAINT "medication_intake_record_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_intake_record" ADD CONSTRAINT "medication_intake_record_operated_by_account_id_fkey" FOREIGN KEY ("operated_by_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_drug_inventory" ADD CONSTRAINT "member_drug_inventory_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_drug_inventory" ADD CONSTRAINT "member_drug_inventory_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_adherence_daily_stat" ADD CONSTRAINT "member_adherence_daily_stat_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_adherence_daily_stat" ADD CONSTRAINT "member_adherence_daily_stat_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "medication_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_medication" ADD CONSTRAINT "member_medication_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_medication" ADD CONSTRAINT "member_medication_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "medication_stock_ledger_member_medication_id_fkey" FOREIGN KEY ("member_medication_id") REFERENCES "member_medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "medication_stock_ledger_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "medication_stock_ledger_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "medication_stock_ledger_intake_record_id_fkey" FOREIGN KEY ("intake_record_id") REFERENCES "medication_intake_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "medication_stock_ledger_prn_intake_id_fkey" FOREIGN KEY ("prn_intake_id") REFERENCES "prn_intake_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_stock_ledger" ADD CONSTRAINT "medication_stock_ledger_operator_account_id_fkey" FOREIGN KEY ("operator_account_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "intake_adverse_record_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "intake_adverse_record_intake_record_id_fkey" FOREIGN KEY ("intake_record_id") REFERENCES "medication_intake_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "intake_adverse_record_reminder_instance_id_fkey" FOREIGN KEY ("reminder_instance_id") REFERENCES "reminder_instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "intake_adverse_record_prn_intake_id_fkey" FOREIGN KEY ("prn_intake_id") REFERENCES "prn_intake_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "intake_adverse_record_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "medication_plan_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_adverse_record" ADD CONSTRAINT "intake_adverse_record_recorded_by_account_id_fkey" FOREIGN KEY ("recorded_by_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_document" ADD CONSTRAINT "consent_document_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consent_record" ADD CONSTRAINT "user_consent_record_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consent_record" ADD CONSTRAINT "user_consent_record_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consent_record" ADD CONSTRAINT "user_consent_record_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "consent_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_consent" ADD CONSTRAINT "ai_consent_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_consent" ADD CONSTRAINT "ai_consent_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_consent" ADD CONSTRAINT "ai_consent_guardian_account_id_fkey" FOREIGN KEY ("guardian_account_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_config" ADD CONSTRAINT "ai_model_config_fallback_config_id_fkey" FOREIGN KEY ("fallback_config_id") REFERENCES "ai_model_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_template" ADD CONSTRAINT "ai_prompt_template_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_template" ADD CONSTRAINT "ai_prompt_template_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_entry" ADD CONSTRAINT "ai_knowledge_entry_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_safety_rule" ADD CONSTRAINT "ai_safety_rule_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_initiator_account_id_fkey" FOREIGN KEY ("initiator_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "caregiver_authorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "ai_consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_attachment_file_id_fkey" FOREIGN KEY ("attachment_file_id") REFERENCES "file_attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_call_log_id_fkey" FOREIGN KEY ("call_log_id") REFERENCES "ai_call_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_consultation" ADD CONSTRAINT "ai_consultation_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_consultation" ADD CONSTRAINT "ai_consultation_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_task" ADD CONSTRAINT "ai_analysis_task_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_task" ADD CONSTRAINT "ai_analysis_task_initiator_account_id_fkey" FOREIGN KEY ("initiator_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_task" ADD CONSTRAINT "ai_analysis_task_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "ai_consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_task" ADD CONSTRAINT "ai_analysis_task_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_analysis_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_supersedes_report_id_fkey" FOREIGN KEY ("supersedes_report_id") REFERENCES "ai_report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_analysis_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_output_review" ADD CONSTRAINT "ai_output_review_reviewer_admin_id_fkey" FOREIGN KEY ("reviewer_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_role" ADD CONSTRAINT "admin_user_role_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_role" ADD CONSTRAINT "admin_user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_role" ADD CONSTRAINT "admin_user_role_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permission" ADD CONSTRAINT "admin_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permission" ADD CONSTRAINT "admin_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "admin_permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_ticket" ADD CONSTRAINT "feedback_ticket_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_ticket" ADD CONSTRAINT "feedback_ticket_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_ticket" ADD CONSTRAINT "feedback_ticket_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_article" ADD CONSTRAINT "content_article_author_admin_id_fkey" FOREIGN KEY ("author_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

