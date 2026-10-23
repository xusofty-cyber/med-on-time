-- MedOnTime V1.3 迁移：注册验证通道（微信/邮箱先行 + 手机号未验证受限）
-- 依据：用户 2026-10-23 拍板（短信网关未接前，注册验证走微信/邮箱先行，手机号保持
--       账号根但可未验证登记，未验证手机号三受限）+ docs/dev/AUTH_CHANNELS.md。
-- 前置条件：紧随 20261023090100_constraints_partitions 执行。
-- 内容：
--   1) user_account 新增四列：email（密文）/ email_hash（HMAC 查找哈希）/
--      email_verified_at / phone_verified_at；
--   2) email_hash 部分唯一索引（与 V1.2 对 phone_hash 的处理口径一致：
--      注销/软删后释放，且仅对已登记邮箱的账号生效）；
--   3) 存量回填：见下方 UPDATE 的口径注释。

-- ===== 1. 新增列 =====
ALTER TABLE "user_account" ADD COLUMN "email" VARCHAR(512);
ALTER TABLE "user_account" ADD COLUMN "email_hash" CHAR(64);
ALTER TABLE "user_account" ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "user_account" ADD COLUMN "phone_verified_at" TIMESTAMPTZ(6);

-- ===== 2. email_hash 部分唯一索引 =====
CREATE UNIQUE INDEX "user_account_email_hash_key" ON "user_account"("email_hash") WHERE "deleted_at" IS NULL AND "email_hash" IS NOT NULL;

-- ===== 3. 存量回填 =====
-- 试点期口径：本迁移之前不存在「未验证手机号」的账号——手机号注册一律经短信
-- 验证码核验（VerificationCodeService），故 phone 非空的既有账号一律视为已验证，
-- 回填为其注册时间。迁移之后经邮箱/微信先行注册登记的手机号 phone_verified_at
-- 保持 NULL，直至短信网关接通补验或微信 getPhoneNumber 核验后置值。
UPDATE "user_account" SET "phone_verified_at" = "registered_at" WHERE "phone" IS NOT NULL AND "phone_verified_at" IS NULL;
