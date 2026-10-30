import Foundation

// 跨端共享枚举 —— 与 packages/shared/src/enums.ts（源头为 DB 设计 V1.2 附录 B）同名同值。
// 纪律：枚举值一律小写蛇形英文；预留值（*_RESERVED）只登记不启用，MVP 端禁止提交。
// 后端按同一清单做 CHECK 校验，客户端出现清单外取值视为契约破坏，直接解码失败暴露问题。

/// 强提醒模式：none 普通通知 / alarm 强提醒闹钟 / voice 语音播报（定版口径）。
enum StrongAlertMode: String, Codable, CaseIterable {
    case none
    case alarm
    case voice

    var label: String {
        switch self {
        case .none: return L("普通通知")
        case .alarm: return L("强提醒闹钟")
        case .voice: return L("语音播报")
        }
    }
}

/// 照护授权级别：L1 仅查看 / L2 可协助 / L3 可配置
enum CaregiverLevel: String, Codable, CaseIterable {
    case l1 = "L1"
    case l2 = "L2"
    case l3 = "L3"

    var label: String {
        switch self {
        case .l1: return L("L1 · 仅查看")
        case .l2: return L("L2 · 可协助打卡")
        case .l3: return L("L3 · 可协助配置")
        }
    }
}

/// 授权状态（caregiver_authorization.status）
enum AuthorizationStatus: String, Codable {
    case pendingAccept = "pending_accept"
    case active
    case suspended
    case revoked
    case expired
    case rejected

    var label: String {
        switch self {
        case .pendingAccept: return L("待接受")
        case .active: return L("生效中")
        case .suspended: return L("已暂停")
        case .revoked: return L("已撤销")
        case .expired: return L("已过期")
        case .rejected: return L("已拒绝")
        }
    }
}

/// 提醒实例状态（reminder_instance.status）
enum ReminderInstanceStatus: String, Codable {
    case pending
    case reminded
    case taken
    case snoozed
    case skipped
    case missed
    case cancelled

    var label: String {
        switch self {
        case .pending: return L("待提醒")
        case .reminded: return L("待服药")
        case .taken: return L("已服用")
        case .snoozed: return L("已稍后")
        case .skipped: return L("已跳过")
        case .missed: return L("已漏服")
        case .cancelled: return L("已取消")
        }
    }

    /// 是否还能执行打卡 / 稍后 / 跳过。
    var isActionable: Bool {
        self == .pending || self == .reminded || self == .snoozed
    }

    var isFinished: Bool {
        self == .taken || self == .skipped || self == .missed || self == .cancelled
    }
}

/// 用药计划状态（medication_plan.status）
enum PlanStatus: String, Codable {
    case active
    case paused
    case finished
    case stopped

    var label: String {
        switch self {
        case .active: return L("进行中")
        case .paused: return L("已暂停")
        case .finished: return L("已完成")
        case .stopped: return L("已停止")
        }
    }
}

/// 计划明细状态（medication_plan_item.status）
enum PlanItemStatus: String, Codable {
    case active
    case paused
    case stopped
}

/// 计划类型（medication_plan.plan_type）：prn 不生成提醒实例
enum PlanType: String, Codable, CaseIterable {
    case scheduled
    case prn

    var label: String {
        switch self {
        case .scheduled: return L("常规计划")
        case .prn: return L("按需服用（PRN）")
        }
    }
}

/// 账号状态（user_account.status）；cancelling = 注销冷静期（30 天）进行中
enum AccountStatus: String, Codable {
    case active
    case frozen
    case cancelling
    case cancelled
}

/// 成员状态（member.status）
enum MemberStatus: String, Codable {
    case active
    case archived
    case removed
}

/// 成员关系（member.relationship）
enum MemberRelationship: String, Codable, CaseIterable {
    case selfMember = "self"
    case father
    case mother
    case spouse
    case child
    case grandparent
    case otherFamily = "other_family"
    case employer
    case other

    var label: String {
        switch self {
        case .selfMember: return L("本人")
        case .father: return L("父亲")
        case .mother: return L("母亲")
        case .spouse: return L("配偶")
        case .child: return L("子女")
        case .grandparent: return L("祖辈")
        case .otherFamily: return L("其他家人")
        case .employer: return L("雇主")
        case .other: return L("其他")
        }
    }
}

/// 投递通道（reminder_delivery_log.channel）——现行启用值
enum DeliveryChannel: String, Codable {
    case appPush = "app_push"
    case wechatSubscribe = "wechat_subscribe"
    case sms
    case voiceCall = "voice_call"
    case inApp = "in_app"
    case pcPopup = "pc_popup"
}

/// 投递通道预留值（V1.2 登记，MVP 未启用，提交即拒绝并记审计）
enum DeliveryChannelReserved: String, Codable {
    case smartwatch
    case smartSpeaker = "smart_speaker"
}

/// 打卡确认方式（现行仅 tap 启用）
enum ConfirmationMethod: String, Codable {
    case tap
}

/// 打卡确认方式预留值（MVP 未启用）
enum ConfirmationMethodReserved: String, Codable {
    case photo
    case voice
}

/// 库存变动类型（medication_stock_ledger.change_type）
enum StockChangeType: String, Codable, CaseIterable {
    case intakeDeduct = "intake_deduct"
    case manualAdjust = "manual_adjust"
    case restock
    case expiryWriteoff = "expiry_writeoff"

    var label: String {
        switch self {
        case .intakeDeduct: return L("服药扣减")
        case .manualAdjust: return L("手动调整")
        case .restock: return L("补货入库")
        case .expiryWriteoff: return L("过期作废")
        }
    }
}

/// 成员药品库存状态（member_medication.status）
enum StockStatus: String, Codable {
    case inUse = "in_use"
    case depleted
    case expired
    case archived
}

/// 过敏原类型（member_allergy.allergen_type）
enum AllergenType: String, Codable, CaseIterable {
    case drugCategory = "drug_category"
    case drug
    case other

    var label: String {
        switch self {
        case .drugCategory: return L("药品类别")
        case .drug: return L("具体药品")
        case .other: return L("其他")
        }
    }
}

/// 严重程度（过敏 / 不适记录共用：mild / moderate / severe）
enum Severity: String, Codable, CaseIterable {
    case mild
    case moderate
    case severe

    var label: String {
        switch self {
        case .mild: return L("轻微")
        case .moderate: return L("中等")
        case .severe: return L("严重")
        }
    }
}

/// 变更操作人类型（plan_change_history.operator_type）
enum OperatorType: String, Codable {
    case memberSelf = "member_self"
    case caregiver
    case adminCs = "admin_cs"
    case system

    var label: String {
        switch self {
        case .memberSelf: return L("成员本人")
        case .caregiver: return L("照护人")
        case .adminCs: return L("客服")
        case .system: return L("系统")
        }
    }
}

/// 内容语言维度（BCP 47；zh-TW 口径为台湾用语）
enum AppLocale: String, Codable, CaseIterable {
    case zhCN = "zh-CN"
    case zhTW = "zh-TW"
    case en
}

/// 同意文本类型（consent_document.doc_type）
enum ConsentDocType: String, Codable {
    case userAgreement = "user_agreement"
    case privacyPolicy = "privacy_policy"
    case aiDataUse = "ai_data_use"
    case healthDataProcessing = "health_data_processing"
}

/// AI 能力（仅登记 DB 文档确证的四项；其余两项待 AI 子系统定版后补入，禁止先行臆造）
enum AiCapability: String, Codable {
    case healthQa = "health_qa"
    case labReportInterpretation = "lab_report_interpretation"
    case medicalRecordAnalysis = "medical_record_analysis"
    case symptomAnalysis = "symptom_analysis"
}

/// AI 紧急程度分级
enum AiTriageLevel: String, Codable {
    case emergencyNow = "emergency_now"
    case urgent2448 = "urgent_24_48"
    case observe
}

/// AI 输出安全处置
enum AiSafetyAction: String, Codable {
    case pass
    case blocked
    case rewritten
}

/// 剂型（drug.dosage_form，与 POC-1 入库 seed 口径一致）
enum DosageForm: String, Codable, CaseIterable {
    case tablet
    case capsule
    case granule
    case oralLiquid = "oral_liquid"
    case injection
    case external
    case other

    var label: String {
        switch self {
        case .tablet: return L("片剂")
        case .capsule: return L("胶囊")
        case .granule: return L("颗粒")
        case .oralLiquid: return L("口服液")
        case .injection: return L("注射剂")
        case .external: return L("外用")
        case .other: return L("其他")
        }
    }
}

/// 服药频次类型（medication_plan_item.frequency_type）
enum FrequencyType: String, Codable, CaseIterable {
    case daily
    case timesPerDay = "times_per_day"
    case weekly
    case intervalDays = "interval_days"
    case onDemand = "on_demand"
    case courseCycle = "course_cycle"

    var label: String {
        switch self {
        case .daily: return L("每日一次")
        case .timesPerDay: return L("每日多次")
        case .weekly: return L("每周固定日")
        case .intervalDays: return L("每隔几天")
        case .onDemand: return L("按需")
        case .courseCycle: return L("疗程周期")
        }
    }
}

/// 餐食关系（medication_plan_item.meal_relation）
enum MealRelation: String, Codable, CaseIterable {
    case beforeMeal = "before_meal"
    case withMeal = "with_meal"
    case afterMeal = "after_meal"
    case beforeSleep = "before_sleep"
    case none

    var label: String {
        switch self {
        case .beforeMeal: return L("饭前")
        case .withMeal: return L("随餐")
        case .afterMeal: return L("饭后")
        case .beforeSleep: return L("睡前")
        case .none: return L("不限")
        }
    }
}

/// 疗程类型（medication_plan_item.course_type）
enum CourseType: String, Codable, CaseIterable {
    case longTerm = "long_term"
    case fixedDays = "fixed_days"
    case untilFinished = "until_finished"

    var label: String {
        switch self {
        case .longTerm: return L("长期服用")
        case .fixedDays: return L("固定天数")
        case .untilFinished: return L("服完为止")
        }
    }
}

/// 提醒周期预设（成员 care-settings / 计划级覆盖共用；与 Web 端 CYCLE_PRESETS 同值）
enum CyclePreset: String, Codable, CaseIterable {
    case standard
    case gentle
    case strict

    var windowMinutes: Int {
        switch self {
        case .standard: return 90
        case .gentle: return 120
        case .strict: return 60
        }
    }

    var intervalMinutes: Int {
        switch self {
        case .standard: return 15
        case .gentle: return 30
        case .strict: return 10
        }
    }

    var label: String {
        switch self {
        case .standard: return L("标准（90 分钟内每 15 分钟）")
        case .gentle: return L("温和（120 分钟内每 30 分钟）")
        case .strict: return L("严格（60 分钟内每 10 分钟）")
        }
    }
}
