package com.medontime.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * API DTO —— 逐条对应 docs/dev/API_CONTRACT.md 与 services/api 各模块 DTO/响应视图：
 * - 信封 {code, message, traceId, data}，code=0 为成功（BusinessCode.OK）。
 * - 分页 data = {items, total, page, pageSize}（通知列表额外带 unread）。
 * - 时间统一 ISO 8601 字符串；剂量 Decimal 在后端视图中以字符串下发（doseAmount: String）。
 * 响应字段一律给默认值，配合 Json.ignoreUnknownKeys 容忍后端增量字段。
 */

// ---------- 信封与分页 ----------

@Serializable
data class ApiResponse<T>(
    val code: Int = -1,
    val message: String = "",
    val traceId: String? = null,
    val data: T? = null,
)

@Serializable
data class PageData<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
)

// ---------- auth ----------

@Serializable
data class SendSmsCodeRequest(val phone: String, val scene: SmsScene)

@Serializable
data class SendSmsCodeResponse(val expiresInSeconds: Int = 60)

@Serializable
data class RegisterRequest(
    val phone: String,
    val password: String,
    val smsCode: String,
    val registerChannel: String = "android",
    val nickname: String? = null,
    val platform: String? = "android",
    val deviceName: String? = null,
)

@Serializable
data class LoginRequest(
    val phone: String,
    val password: String,
    val platform: String? = "android",
    val deviceName: String? = null,
)

@Serializable
data class LoginByCodeRequest(
    val phone: String,
    val smsCode: String,
    val platform: String? = "android",
    val deviceName: String? = null,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class LogoutRequest(val refreshToken: String? = null)

@Serializable
data class ResetPasswordRequest(val phone: String, val smsCode: String, val newPassword: String)

@Serializable
data class BindWechatRequest(val code: String? = null)

@Serializable
data class TokenPairDto(
    val accessToken: String = "",
    val refreshToken: String = "",
    val expiresIn: Long? = null,
    val tokenType: String? = null,
)

/** GET /auth/me 与 GET /account/profile 共用（user_account 视图，手机号密文不下发）。 */
@Serializable
data class AccountDto(
    val id: String = "",
    val nickname: String = "",
    val avatarFileId: String? = null,
    val registerChannel: String? = null,
    val status: AccountStatus = AccountStatus.Active,
    val timezone: String = "Asia/Shanghai",
    val registeredAt: String? = null,
    val lastLoginAt: String? = null,
)

// ---------- account ----------

@Serializable
data class UpdateProfileRequest(
    val nickname: String? = null,
    val avatarFileId: String? = null,
    val timezone: String? = null,
)

@Serializable
data class CancelAccountRequest(val reason: String? = null)

@Serializable
data class SessionDto(
    val id: String = "",
    val platform: String? = null,
    val deviceName: String? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val current: Boolean = false,
)

// ---------- member ----------

@Serializable
data class MemberDto(
    val id: String = "",
    val accountId: String = "",
    val displayName: String = "",
    val relationship: MemberRelationship = MemberRelationship.Self,
    val gender: Gender? = null,
    val birthDate: String? = null,
    val timezone: String = "Asia/Shanghai",
    val status: String = "active",
    val sortOrder: Int = 0,
)

@Serializable
data class CreateMemberRequest(
    val displayName: String,
    val relationship: MemberRelationship,
    val gender: Gender? = null,
    val birthDate: String? = null,
    val timezone: String? = null,
    val sortOrder: Int? = null,
)

@Serializable
data class UpdateMemberRequest(
    val displayName: String? = null,
    val relationship: MemberRelationship? = null,
    val gender: Gender? = null,
    val birthDate: String? = null,
    val timezone: String? = null,
    val sortOrder: Int? = null,
)

/** GET/PUT /members/:memberId/care-settings（后端 CareSettings 视图）。 */
@Serializable
data class CareSettingsDto(
    val memberId: String = "",
    val careMode: Boolean = false,
    val cyclePreset: CyclePreset = CyclePreset.Standard,
    val cycleWindowMinutes: Int = 90,
    val cycleIntervalMinutes: Int = 15,
    val lockScreenShowDrugDetail: Boolean = false,
    val updatedAt: String? = null,
)

@Serializable
data class UpdateCareSettingsRequest(
    val careMode: Boolean? = null,
    val cyclePreset: CyclePreset? = null,
    val lockScreenShowDrugDetail: Boolean? = null,
)

// ---------- authorization ----------

@Serializable
data class AuthorizationDto(
    val id: String = "",
    val memberId: String = "",
    val caregiverAccountId: String = "",
    val grantedByAccountId: String = "",
    val level: CaregiverLevel = CaregiverLevel.L1,
    val permissions: JsonObject? = null,
    val status: AuthorizationStatus = AuthorizationStatus.PendingAccept,
    val invitedAt: String? = null,
    val acceptedAt: String? = null,
    val expiresAt: String? = null,
    /** 以下为便于展示的冗余字段，后端如未下发则为空。 */
    val memberDisplayName: String? = null,
    val caregiverNickname: String? = null,
)

@Serializable
data class CreateAuthorizationRequest(
    val memberId: String,
    val caregiverPhone: String,
    val level: CaregiverLevel,
    val permissions: Map<String, Boolean>? = null,
    val expiresAt: String? = null,
)

@Serializable
data class RevokeAuthorizationRequest(val reason: String? = null)

// ---------- drug ----------

@Serializable
data class DrugDto(
    val id: String = "",
    val genericName: String = "",
    val brandName: String? = null,
    val manufacturer: String? = null,
    val approvalNumber: String? = null,
    val barcode: String? = null,
    val categoryId: String? = null,
    val dosageForm: DosageForm = DosageForm.Other,
    val specification: String = "",
    val packageDesc: String? = null,
    val unit: String = "",
    val efficacy: String? = null,
    /** 说明书用法用量原文（后端 usage_default JsonB，通常含 text 字段）。 */
    val usageDefault: JsonElement? = null,
    val contraindications: String? = null,
    val adverseReactions: String? = null,
    val interactions: String? = null,
    val storageCondition: String? = null,
    val isOtc: Boolean = false,
    val sourceType: String = "platform",
    val reviewStatus: String = "approved",
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class OncHighPriorityCheckDto(
    val status: String = "placeholder",
    val hits: List<JsonElement> = emptyList(),
    val note: String = "",
)

/** GET /drugs/:id/interactions：说明书原文 + ONC 硬检占位（不得据此判定无相互作用）。 */
@Serializable
data class DrugInteractionsDto(
    val drugId: String = "",
    val genericName: String = "",
    val brandName: String? = null,
    val labelInteractionsText: String? = null,
    val labelInteractionEntries: List<String> = emptyList(),
    val labelContraindications: String? = null,
    val oncHighPriorityCheck: OncHighPriorityCheckDto = OncHighPriorityCheckDto(),
)

@Serializable
data class CreateCustomDrugRequest(
    val genericName: String,
    val brandName: String? = null,
    val manufacturer: String? = null,
    val approvalNumber: String? = null,
    val barcode: String? = null,
    val categoryId: String? = null,
    val dosageForm: DosageForm,
    val specification: String,
    val packageDesc: String? = null,
    val unit: String,
    val efficacy: String? = null,
    val usageText: String? = null,
    val contraindications: String? = null,
    val adverseReactions: String? = null,
    val interactions: String? = null,
    val storageCondition: String? = null,
    val isOtc: Boolean? = null,
)

// ---------- plan ----------

/** frequency_rule JsonB 约定形状（见后端 create-plan.dto 类注释），按 frequencyType 取用子集。 */
@Serializable
data class FrequencyRule(
    val times: List<String> = emptyList(),
    val timesPerDay: Int? = null,
    val weekdays: List<Int> = emptyList(),
    val intervalDays: Int? = null,
    val cycleDays: Int? = null,
    val onDays: Int? = null,
)

@Serializable
data class PlanItemDto(
    val id: String? = null,
    val planId: String? = null,
    val drugId: String = "",
    val drugNameSnapshot: String? = null,
    val doseAmount: Double = 0.0,
    val doseUnit: String = "",
    val frequencyType: FrequencyType = FrequencyType.Daily,
    val frequencyRule: FrequencyRule = FrequencyRule(),
    val mealRelation: MealRelation = MealRelation.None,
    val courseType: CourseType = CourseType.LongTerm,
    val courseDays: Int? = null,
    val status: PlanItemStatus = PlanItemStatus.Active,
    val sortOrder: Int = 0,
)

@Serializable
data class PlanPhaseDto(
    val id: String? = null,
    val planId: String? = null,
    val planItemId: String? = null,
    val stageNo: Int = 1,
    val durationDays: Int = 1,
    val dailyDoseAmount: Double = 0.0,
    val dailyDoseUnit: String = "",
    val isFinalStop: Boolean = false,
    val note: String? = null,
)

@Serializable
data class PlanDto(
    val id: String = "",
    val memberId: String = "",
    val name: String = "",
    val createdByAccountId: String? = null,
    val sourceTemplateId: String? = null,
    val planType: PlanType = PlanType.Scheduled,
    val status: PlanStatus = PlanStatus.Active,
    val startDate: String = "",
    val endDate: String? = null,
    val note: String? = null,
    val storageLocation: String? = null,
    val additionalNote: String? = null,
    val prescriptionSourceText: String? = null,
    val prnMinIntervalMinutes: Int? = null,
    val prnMaxPerDay: Int? = null,
    val version: Int = 1,
    val items: List<PlanItemDto> = emptyList(),
    val phases: List<PlanPhaseDto> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class PlanItemInput(
    val drugId: String,
    val doseAmount: Double,
    val doseUnit: String,
    val frequencyType: FrequencyType,
    val frequencyRule: FrequencyRule,
    val mealRelation: MealRelation? = null,
    val courseType: CourseType? = null,
    val courseDays: Int? = null,
    val sortOrder: Int? = null,
)

@Serializable
data class PlanPhaseInput(
    val planItemIndex: Int? = null,
    val stageNo: Int,
    val durationDays: Int,
    val dailyDoseAmount: Double,
    val dailyDoseUnit: String,
    val isFinalStop: Boolean? = null,
    val note: String? = null,
)

@Serializable
data class CreatePlanRequest(
    val name: String,
    val planType: PlanType? = null,
    val startDate: String,
    val endDate: String? = null,
    val note: String? = null,
    val storageLocation: String? = null,
    val additionalNote: String? = null,
    val prescriptionSourceText: String? = null,
    val sourceTemplateId: String? = null,
    val prnMinIntervalMinutes: Int? = null,
    val prnMaxPerDay: Int? = null,
    val items: List<PlanItemInput>,
    val phases: List<PlanPhaseInput>? = null,
)

/** PATCH /plans/:planId：全字段可选（后端 update-plan.dto 口径），明细带 id 表示更新、缺 id 表示新增。 */
@Serializable
data class PlanItemPatchInput(
    val id: String? = null,
    val drugId: String? = null,
    val doseAmount: Double? = null,
    val doseUnit: String? = null,
    val frequencyType: FrequencyType? = null,
    val frequencyRule: FrequencyRule? = null,
    val mealRelation: MealRelation? = null,
    val courseType: CourseType? = null,
    val courseDays: Int? = null,
    val sortOrder: Int? = null,
)

@Serializable
data class PlanPhasePatchInput(
    val id: String? = null,
    val planItemId: String? = null,
    val stageNo: Int? = null,
    val durationDays: Int? = null,
    val dailyDoseAmount: Double? = null,
    val dailyDoseUnit: String? = null,
    val isFinalStop: Boolean? = null,
    val note: String? = null,
)

@Serializable
data class UpdatePlanRequest(
    val name: String? = null,
    val planType: PlanType? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val note: String? = null,
    val storageLocation: String? = null,
    val additionalNote: String? = null,
    val prescriptionSourceText: String? = null,
    val prnMinIntervalMinutes: Int? = null,
    val prnMaxPerDay: Int? = null,
    val items: List<PlanItemPatchInput>? = null,
    val phases: List<PlanPhasePatchInput>? = null,
)

@Serializable
data class PlanHistoryDto(
    val id: String = "",
    val planId: String = "",
    val planItemId: String? = null,
    val memberId: String = "",
    val changedField: String = "",
    val oldValue: String? = null,
    val newValue: String? = null,
    val operatorAccountId: String? = null,
    val operatorType: OperatorType = OperatorType.MemberSelf,
    val operatorLevel: String? = null,
    val createdAt: String = "",
)

// ---------- reminder / checkin ----------

@Serializable
data class IntakeSummaryDto(
    val id: String = "",
    val action: String = "",
    val takenAt: String? = null,
    val recordedAt: String? = null,
    val isMakeup: Boolean = false,
)

/** GET 今日/按日提醒的实例视图（后端 ReminderInstanceView；doseAmount 为字符串保精度）。 */
@Serializable
data class ReminderInstanceDto(
    val id: String = "",
    val memberId: String = "",
    val planId: String = "",
    val planItemId: String = "",
    val drugId: String = "",
    val drugNameSnapshot: String = "",
    val doseAmount: String = "0",
    val doseUnit: String = "",
    val scheduledAtUtc: String = "",
    val localDate: String = "",
    /** 形如 "08:00" 或 "08:00:00"，展示时取前 5 位。 */
    val localTime: String = "",
    val timezone: String = "Asia/Shanghai",
    val status: ReminderInstanceStatus = ReminderInstanceStatus.Pending,
    val snoozeUntil: String? = null,
    val snoozeCount: Int = 0,
    val source: String = "schedule",
    val intake: IntakeSummaryDto? = null,
) {
    /** 是否仍可操作（打卡/稍后/跳过）。 */
    val actionable: Boolean
        get() = status == ReminderInstanceStatus.Pending ||
            status == ReminderInstanceStatus.Reminded ||
            status == ReminderInstanceStatus.Snoozed
}

@Serializable
data class ReminderDayDto(
    val date: String = "",
    val timezone: String = "Asia/Shanghai",
    val items: List<ReminderInstanceDto> = emptyList(),
)

@Serializable
data class SnoozeRequest(val minutes: Int? = null)

@Serializable
data class SkipRequest(val reason: String? = null, val clientRequestId: String? = null)

/** POST /reminders/:instanceId/skip 返回（已打卡时 alreadyRecorded=true 并回既有实例）。 */
@Serializable
data class SkipResultDto(
    val instance: ReminderInstanceDto = ReminderInstanceDto(),
    val alreadyRecorded: Boolean = false,
)

@Serializable
data class CheckinRequest(
    val clientRequestId: String,
    val takenAt: String? = null,
    val confirmationMethod: String? = "tap",
)

@Serializable
data class IntakeRecordDto(
    val id: String = "",
    val reminderInstanceId: String = "",
    val memberId: String = "",
    val planItemId: String = "",
    val action: String = "",
    val takenAt: String? = null,
    val recordedAt: String? = null,
    val isMakeup: Boolean = false,
    val operatedByAccountId: String? = null,
    val skipReason: String? = null,
    val confirmationMethod: String = "tap",
)

// ---------- adherence ----------

@Serializable
data class AdherenceSummaryDto(
    val range: String = "week",
    val from: String = "",
    val to: String = "",
    val scheduled: Int = 0,
    val taken: Int = 0,
    val onTime: Int = 0,
    val missed: Int = 0,
    val skipped: Int = 0,
    val adherenceRate: Double? = null,
    val onTimeRate: Double? = null,
)

@Serializable
data class AdherenceDayDto(
    val date: String = "",
    val scheduled: Int = 0,
    val taken: Int = 0,
    val onTime: Int = 0,
    val missed: Int = 0,
    val skipped: Int = 0,
    val adherenceRate: Double? = null,
    /** none / complete / partial / missed */
    val status: String = "none",
)

@Serializable
data class AdherenceCalendarDto(
    val month: String = "",
    val timezone: String = "Asia/Shanghai",
    val days: List<AdherenceDayDto> = emptyList(),
)

// ---------- stock ----------

@Serializable
data class StockDrugDto(
    val genericName: String = "",
    val brandName: String? = null,
    val specification: String = "",
    val dosageForm: String = "",
    val unit: String = "",
)

@Serializable
data class StockItemDto(
    val memberMedicationId: String = "",
    val memberId: String = "",
    val drugId: String = "",
    val drug: StockDrugDto = StockDrugDto(),
    val stockQuantity: Double = 0.0,
    val stockUnit: String = "",
    val currentBatchExpiryDate: String? = null,
    val daysUntilExpiry: Int? = null,
    /** unknown / expired / expiring_soon / ok */
    val expiryStatus: String = "unknown",
    val storageLocation: String? = null,
    val lowStockAlertEnabled: Boolean = true,
    val status: String = "in_use",
    val estimatedDailyUsage: Double? = null,
    val estimatedDaysLeft: Int? = null,
    val alerts: List<String> = emptyList(),
    val updatedAt: String? = null,
)

@Serializable
data class AdjustStockRequest(
    val drugId: String,
    /** 手动接口仅开放 manual_adjust / restock / expiry_writeoff（intake_deduct 为系统专用）。 */
    val changeType: String,
    val changeAmount: Double,
    val note: String? = null,
    val expiryDate: String? = null,
    val storageLocation: String? = null,
    val stockUnit: String? = null,
)

// ---------- ehr ----------

@Serializable
data class AllergyDto(
    val id: String? = null,
    val memberId: String? = null,
    val allergen: String = "",
    val severity: Severity? = null,
    val reaction: String? = null,
    val note: String? = null,
    val allergenType: AllergenType = AllergenType.Other,
    val drugCategoryId: String? = null,
    val drugId: String? = null,
    val allergenCode: String? = null,
    val source: String? = null,
)

@Serializable
data class PutAllergiesRequest(val items: List<AllergyDto>)

@Serializable
data class AdverseRecordDto(
    val id: String = "",
    val memberId: String = "",
    val intakeRecordId: String? = null,
    val reminderInstanceId: String? = null,
    val prnIntakeId: String? = null,
    val planItemId: String? = null,
    val symptomTags: List<String> = emptyList(),
    val description: String? = null,
    val severity: Severity = Severity.Mild,
    val occurredAt: String = "",
    val recordedByAccountId: String? = null,
)

@Serializable
data class CreateAdverseRecordRequest(
    val intakeRecordId: String? = null,
    val reminderInstanceId: String? = null,
    val prnIntakeId: String? = null,
    val planItemId: String? = null,
    val symptomTags: List<String> = emptyList(),
    val description: String? = null,
    val severity: Severity? = null,
    val occurredAt: String,
)

@Serializable
data class EmergencyContactDto(
    val id: String = "",
    val memberId: String = "",
    val contactName: String = "",
    /** 响应侧电话以后端下发为准（可能为掩码），写入时传明文。 */
    val phone: String? = null,
    val relationship: String = "",
    val priority: Int = 1,
    val note: String? = null,
)

@Serializable
data class CreateEmergencyContactRequest(
    val contactName: String,
    val phone: String,
    val relationship: String,
    val priority: Int? = null,
    val note: String? = null,
)

@Serializable
data class UpdateEmergencyContactRequest(
    val contactName: String? = null,
    val phone: String? = null,
    val relationship: String? = null,
    val priority: Int? = null,
    val note: String? = null,
)

/** 病历摘要（正文在服务端加密存储，客户端只见明文回读结果）。 */
@Serializable
data class MedicalRecordDto(
    val id: String? = null,
    val memberId: String = "",
    val bloodType: String? = null,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val primaryHospital: String? = null,
    val summary: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class UpsertMedicalRecordRequest(
    val bloodType: String? = null,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val primaryHospital: String? = null,
    val summary: String? = null,
)

// ---------- notification ----------

@Serializable
data class NotificationInstanceDto(
    val drugNameSnapshot: String = "",
    val doseAmount: String = "0",
    val doseUnit: String = "",
    val localDate: String = "",
    val localTime: String = "",
    val timezone: String = "Asia/Shanghai",
    val status: String = "",
)

/** 站内通知 = 投递日志行（后端 NotificationListItem）。 */
@Serializable
data class NotificationDto(
    val id: String = "",
    val instanceId: String = "",
    val memberId: String = "",
    val channel: String = "",
    val result: String = "",
    val createdAt: String = "",
    val read: Boolean = false,
    val instance: NotificationInstanceDto? = null,
)

@Serializable
data class NotificationPageDto(
    val items: List<NotificationDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    val unread: Int = 0,
)

@Serializable
data class NotificationPrefsDto(
    val inApp: Boolean = true,
    val sms: Boolean = false,
    val wechat: Boolean = false,
)

@Serializable
data class UpdateNotificationPrefsRequest(
    val inApp: Boolean? = null,
    val sms: Boolean? = null,
    val wechat: Boolean? = null,
)

// ---------- content ----------

@Serializable
data class ArticleDto(
    val id: String = "",
    val title: String = "",
    val category: String = "",
    val body: String? = null,
    val locale: AppLocale = AppLocale.ZhCN,
    val contentGroupId: String = "",
    val status: String = "published",
    val publishedAt: String? = null,
)
