-- V1.5 增量：公众号文章（管理后台写稿 → 同步微信公众号草稿箱），2026-10-24。
CREATE TABLE "oa_article" (
  "id" UUID NOT NULL,
  "title" VARCHAR(64) NOT NULL,
  "author" VARCHAR(16),
  "digest" VARCHAR(120),
  "content_source" TEXT NOT NULL,
  "content_html" TEXT,
  "cover_media_id" VARCHAR(128),
  "cover_url" VARCHAR(500),
  "wx_draft_media_id" VARCHAR(128),
  "last_synced_at" TIMESTAMPTZ(6),
  "created_by" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "oa_article_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "oa_article_deleted_at_updated_at_idx" ON "oa_article" ("deleted_at", "updated_at");
