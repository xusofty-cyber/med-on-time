import Foundation

/// 频次规则（frequency_rule JSONB）：times 为 "HH:mm" 数组；weekdays 1=周一 … 7=周日（与 Web 端 WEEKDAY_LABELS 口径一致）。
struct FrequencyRuleDTO: Codable {
    var times: [String]?
    var weekdays: [Int]?
    var intervalDays: Int?
}

/// 计划明细入参（一行 = 一种药在计划里的一套服药安排）。
struct PlanItemInputDTO: Encodable {
    var drugId: String
    var doseAmount: Double
    var doseUnit: String
    var frequencyType: FrequencyType
    var frequencyRule: FrequencyRuleDTO
    var mealRelation: MealRelation
    var courseType: CourseType
    var courseDays: Int?
}

/// 剂量阶段入参（course+dose phases；阶段只改剂量、不改服用时刻；PRN 计划禁止挂阶段）。
struct PlanPhaseInputDTO: Encodable {
    var stageNo: Int
    var durationDays: Int
    var dailyDoseAmount: Double
    var dailyDoseUnit: String
    var isFinalStop: Bool?
    var note: String?
}

/// 建/改计划入参（与 Web 端 PlanPayload 同形）。
/// cycle* 为计划级提醒周期覆盖；storageLocation / additionalNote 为 R-1 定版字段（存放位置 / 附加备注）。
struct PlanPayloadDTO: Encodable {
    var name: String
    var planType: PlanType
    var startDate: String
    var endDate: String?
    var note: String?
    var storageLocation: String?
    var additionalNote: String?
    var prnMinIntervalMinutes: Int?
    var prnMaxPerDay: Int?
    var cyclePreset: CyclePreset?
    var cycleWindowMinutes: Int?
    var cycleIntervalMinutes: Int?
    var items: [PlanItemInputDTO]
    var phases: [PlanPhaseInputDTO]?
}

/// 计划明细（medication_plan_item 投影）。
struct PlanItemDTO: Decodable, Identifiable {
    let id: String
    let planId: String
    let drugId: String
    let drugNameSnapshot: String
    let doseAmount: Double
    let doseUnit: String
    let frequencyType: FrequencyType
    let frequencyRule: FrequencyRuleDTO
    let mealRelation: MealRelation
    let courseType: CourseType
    let courseDays: Int?
    let status: PlanItemStatus
    let drug: DrugDTO?

    private enum CodingKeys: String, CodingKey {
        case id, planId, drugId, drugNameSnapshot, doseAmount, doseUnit
        case frequencyType, frequencyRule, mealRelation, courseType, courseDays, status, drug
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        planId = try container.decode(String.self, forKey: .planId)
        drugId = try container.decode(String.self, forKey: .drugId)
        drugNameSnapshot = try container.decode(String.self, forKey: .drugNameSnapshot)
        doseAmount = try container.decodeFlexibleDouble(forKey: .doseAmount)
        doseUnit = try container.decode(String.self, forKey: .doseUnit)
        frequencyType = try container.decode(FrequencyType.self, forKey: .frequencyType)
        frequencyRule = try container.decode(FrequencyRuleDTO.self, forKey: .frequencyRule)
        mealRelation = try container.decode(MealRelation.self, forKey: .mealRelation)
        courseType = try container.decode(CourseType.self, forKey: .courseType)
        courseDays = try container.decodeIfPresent(Int.self, forKey: .courseDays)
        status = try container.decode(PlanItemStatus.self, forKey: .status)
        drug = try container.decodeIfPresent(DrugDTO.self, forKey: .drug)
    }
}

/// 剂量阶段（medication_plan_phase 投影）。
struct PlanPhaseDTO: Decodable, Identifiable {
    let id: String
    let planId: String
    let planItemId: String?
    let stageNo: Int
    let durationDays: Int
    let dailyDoseAmount: Double
    let dailyDoseUnit: String
    let isFinalStop: Bool
    let note: String?

    private enum CodingKeys: String, CodingKey {
        case id, planId, planItemId, stageNo, durationDays, dailyDoseAmount, dailyDoseUnit, isFinalStop, note
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        planId = try container.decode(String.self, forKey: .planId)
        planItemId = try container.decodeIfPresent(String.self, forKey: .planItemId)
        stageNo = try container.decode(Int.self, forKey: .stageNo)
        durationDays = try container.decode(Int.self, forKey: .durationDays)
        dailyDoseAmount = try container.decodeFlexibleDouble(forKey: .dailyDoseAmount)
        dailyDoseUnit = try container.decode(String.self, forKey: .dailyDoseUnit)
        isFinalStop = try container.decode(Bool.self, forKey: .isFinalStop)
        note = try container.decodeIfPresent(String.self, forKey: .note)
    }
}

/// 用药计划（medication_plan 投影，含明细与阶段）。
struct PlanDTO: Decodable, Identifiable {
    let id: String
    let memberId: String
    let name: String
    let planType: PlanType
    let status: PlanStatus
    let startDate: String
    let endDate: String?
    let note: String?
    let storageLocation: String?
    let additionalNote: String?
    let prnMinIntervalMinutes: Int?
    let prnMaxPerDay: Int?
    let cyclePreset: CyclePreset?
    let cycleWindowMinutes: Int?
    let cycleIntervalMinutes: Int?
    let items: [PlanItemDTO]?
    let phases: [PlanPhaseDTO]?
    let createdAt: Date?
}

/// 计划变更史条目（plan_change_history 字段级时间线；代操作双记录在此可见）。
struct PlanChangeHistoryDTO: Decodable, Identifiable {
    let id: String
    let createdAt: Date
    let changedField: String
    let oldValue: String?
    let newValue: String?
    let operatorType: OperatorType
    let operatorLevel: String?
    let planItemId: String?
}
