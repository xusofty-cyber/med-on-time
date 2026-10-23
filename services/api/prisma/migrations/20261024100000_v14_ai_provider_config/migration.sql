-- MedOnTime V1.4 迁移：后台可配大模型接入表
-- 依据：负责人 2026-10-24 要求——后台管理可配置大模型的名称、API key 与请求 URL。
-- 口径：api_key 只落 FieldCrypto 密文（enc:v1:），另存尾 4 位供界面掩码展示；
--       与 ai_model_config（能力路由/托管引用）分工，不改其既有契约。
-- 前置条件：紧随 20261023110000_v13_auth_channels 执行。

CREATE TABLE "ai_provider_config" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "base_url" VARCHAR(500) NOT NULL,
    "api_key_cipher" TEXT NOT NULL,
    "api_key_last4" VARCHAR(8) NOT NULL,
    "capability" VARCHAR(48) NOT NULL DEFAULT 'general',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_provider_config_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_config_capability_is_active_idx"
    ON "ai_provider_config"("capability", "is_active");
