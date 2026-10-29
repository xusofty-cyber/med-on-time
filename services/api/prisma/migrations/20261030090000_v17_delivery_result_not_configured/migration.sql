-- V1.7（2026-10-30 全项目审查 H-5）：app_push 日志桩改诚实状态
-- reminder_delivery_log.result 新增 'suppressed_not_configured'
-- （推送通道未配置、未真实下发），与既有 suppressed_* 同语义族：
-- 终局、不重试、不计送达、不参与跨渠道成功去重。
ALTER TABLE "reminder_delivery_log" DROP CONSTRAINT "ck_reminder_delivery_log_result";
ALTER TABLE "reminder_delivery_log" ADD CONSTRAINT "ck_reminder_delivery_log_result" CHECK ("result" IN ('success', 'failed', 'suppressed_dnd', 'suppressed_dedup', 'suppressed_not_configured'));
