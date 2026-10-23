package com.medontime.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 跨端共享枚举的 Android 侧镜像 —— 与 packages/shared/src/enums.ts（源头为 DB V1.2 附录 B）
 * 同名同值，禁止自创取值。改值必须先改 shared 与 DB CHECK，再同步本文件。
 * 未列入 shared 的取值（如 relationship / frequency_type）取自 schema.prisma 列注释，
 * 与后端 DTO 常量（auth.dto / member.dto / create-plan.dto 等）逐字对齐。
 */

@Serializable
enum class CaregiverLevel {
    @SerialName("L1") L1,
    @SerialName("L2") L2,
    @SerialName("L3") L3,
}

@Serializable
enum class AuthorizationStatus {
    @SerialName("pending_accept") PendingAccept,
    @SerialName("active") Active,
    @SerialName("suspended") Suspended,
    @SerialName("revoked") Revoked,
    @SerialName("expired") Expired,
    @SerialName("rejected") Rejected,
}

@Serializable
enum class ReminderInstanceStatus {
    @SerialName("pending") Pending,
    @SerialName("reminded") Reminded,
    @SerialName("taken") Taken,
    @SerialName("snoozed") Snoozed,
    @SerialName("skipped") Skipped,
    @SerialName("missed") Missed,
    @SerialName("cancelled") Cancelled,
}

@Serializable
enum class PlanStatus {
    @SerialName("active") Active,
    @SerialName("paused") Paused,
    @SerialName("finished") Finished,
    @SerialName("stopped") Stopped,
}

@Serializable
enum class PlanItemStatus {
    @SerialName("active") Active,
    @SerialName("paused") Paused,
    @SerialName("stopped") Stopped,
}

@Serializable
enum class PlanType {
    @SerialName("scheduled") Scheduled,
    @SerialName("prn") Prn,
}

@Serializable
enum class AccountStatus {
    @SerialName("active") Active,
    @SerialName("frozen") Frozen,
    @SerialName("cancelling") Cancelling,
    @SerialName("cancelled") Cancelled,
}

/** 投递通道现行启用值（DeliveryChannelReserved 的 smartwatch/smart_speaker 为预留，禁止提交）。 */
@Serializable
enum class DeliveryChannel {
    @SerialName("app_push") AppPush,
    @SerialName("wechat_subscribe") WechatSubscribe,
    @SerialName("sms") Sms,
    @SerialName("voice_call") VoiceCall,
    @SerialName("in_app") InApp,
    @SerialName("pc_popup") PcPopup,
}

/** 打卡确认方式：MVP 仅 tap 启用（photo/voice 为预留值，提交即被服务端拒绝）。 */
@Serializable
enum class ConfirmationMethod {
    @SerialName("tap") Tap,
}

@Serializable
enum class StockChangeType {
    @SerialName("intake_deduct") IntakeDeduct,
    @SerialName("manual_adjust") ManualAdjust,
    @SerialName("restock") Restock,
    @SerialName("expiry_writeoff") ExpiryWriteoff,
}

@Serializable
enum class AllergenType {
    @SerialName("drug_category") DrugCategory,
    @SerialName("drug") Drug,
    @SerialName("other") Other,
}

@Serializable
enum class OperatorType {
    @SerialName("member_self") MemberSelf,
    @SerialName("caregiver") Caregiver,
    @SerialName("admin_cs") AdminCs,
    @SerialName("system") System,
}

@Serializable
enum class AppLocale {
    @SerialName("zh-CN") ZhCN,
    @SerialName("zh-TW") ZhTW,
    @SerialName("en") En,
}

@Serializable
enum class ConsentDocType {
    @SerialName("user_agreement") UserAgreement,
    @SerialName("privacy_policy") PrivacyPolicy,
    @SerialName("ai_data_use") AiDataUse,
    @SerialName("health_data_processing") HealthDataProcessing,
}

/** 短信验证码场景（后端 verification-code.service SMS_SCENES）。 */
@Serializable
enum class SmsScene {
    @SerialName("register") Register,
    @SerialName("login") Login,
    @SerialName("reset") Reset,
}

/** 成员关系（schema member.relationship / member.dto MEMBER_RELATIONSHIPS）。 */
@Serializable
enum class MemberRelationship {
    @SerialName("self") Self,
    @SerialName("father") Father,
    @SerialName("mother") Mother,
    @SerialName("spouse") Spouse,
    @SerialName("child") Child,
    @SerialName("grandparent") Grandparent,
    @SerialName("other_family") OtherFamily,
    @SerialName("employer") Employer,
    @SerialName("other") Other,
}

@Serializable
enum class Gender {
    @SerialName("male") Male,
    @SerialName("female") Female,
    @SerialName("unknown") Unknown,
}

/** 提醒 cycle 预设（定版口径：standard 90/15、gentle 120/30、strict 60/10）。 */
@Serializable
enum class CyclePreset {
    @SerialName("standard") Standard,
    @SerialName("gentle") Gentle,
    @SerialName("strict") Strict,
}

/** 剂型（schema drug.dosage_form / create-custom-drug.dto DOSAGE_FORMS）。 */
@Serializable
enum class DosageForm {
    @SerialName("tablet") Tablet,
    @SerialName("capsule") Capsule,
    @SerialName("granule") Granule,
    @SerialName("oral_liquid") OralLiquid,
    @SerialName("injection") Injection,
    @SerialName("external") External,
    @SerialName("other") Other,
}

/** 频次类型（schema medication_plan_item.frequency_type / create-plan.dto FREQUENCY_TYPES）。 */
@Serializable
enum class FrequencyType {
    @SerialName("daily") Daily,
    @SerialName("times_per_day") TimesPerDay,
    @SerialName("weekly") Weekly,
    @SerialName("interval_days") IntervalDays,
    @SerialName("on_demand") OnDemand,
    @SerialName("course_cycle") CourseCycle,
}

/** 餐食关系（schema meal_relation）。 */
@Serializable
enum class MealRelation {
    @SerialName("before_meal") BeforeMeal,
    @SerialName("with_meal") WithMeal,
    @SerialName("after_meal") AfterMeal,
    @SerialName("before_sleep") BeforeSleep,
    @SerialName("none") None,
}

/** 疗程类型（schema course_type）。 */
@Serializable
enum class CourseType {
    @SerialName("long_term") LongTerm,
    @SerialName("fixed_days") FixedDays,
    @SerialName("until_finished") UntilFinished,
}

/** 严重程度（member_allergy.severity / intake_adverse_record.severity）。 */
@Serializable
enum class Severity {
    @SerialName("mild") Mild,
    @SerialName("moderate") Moderate,
    @SerialName("severe") Severe,
}
