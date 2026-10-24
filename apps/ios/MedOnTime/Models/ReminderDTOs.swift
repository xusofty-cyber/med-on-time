import Foundation

/// 提醒实例（reminder_instance 投影）。
/// 时间口径：scheduledAtUtc 为绝对时刻；localDate / localTime / timezone 为成员本地墙钟快照，展示优先用墙钟字段。
/// storageLocation / additionalNote 为计划级 R-1 字段在实例上的冗余展示（详细提醒时出现）。
struct ReminderInstanceDTO: Decodable, Identifiable {
    let id: String
    let memberId: String
    let planId: String
    let planItemId: String
    let drugId: String
    let drugNameSnapshot: String
    let doseAmount: Double
    let doseUnit: String
    let scheduledAtUtc: Date
    let localDate: String
    let localTime: String
    let timezone: String
    let status: ReminderInstanceStatus
    let snoozeUntil: Date?
    let snoozeCount: Int?
    let storageLocation: String?
    let additionalNote: String?
    let mealRelation: MealRelation?

    private enum CodingKeys: String, CodingKey {
        case id, memberId, planId, planItemId, drugId, drugNameSnapshot, doseAmount, doseUnit
        case scheduledAtUtc, localDate, localTime, timezone, status, snoozeUntil, snoozeCount
        case storageLocation, additionalNote, mealRelation
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        memberId = try container.decode(String.self, forKey: .memberId)
        planId = try container.decode(String.self, forKey: .planId)
        planItemId = try container.decode(String.self, forKey: .planItemId)
        drugId = try container.decode(String.self, forKey: .drugId)
        drugNameSnapshot = try container.decode(String.self, forKey: .drugNameSnapshot)
        doseAmount = try container.decodeFlexibleDouble(forKey: .doseAmount)
        doseUnit = try container.decode(String.self, forKey: .doseUnit)
        scheduledAtUtc = try container.decode(Date.self, forKey: .scheduledAtUtc)
        localDate = try container.decode(String.self, forKey: .localDate)
        localTime = try container.decode(String.self, forKey: .localTime)
        timezone = try container.decode(String.self, forKey: .timezone)
        status = try container.decode(ReminderInstanceStatus.self, forKey: .status)
        snoozeUntil = try container.decodeIfPresent(Date.self, forKey: .snoozeUntil)
        snoozeCount = try container.decodeIfPresent(Int.self, forKey: .snoozeCount)
        storageLocation = try container.decodeIfPresent(String.self, forKey: .storageLocation)
        additionalNote = try container.decodeIfPresent(String.self, forKey: .additionalNote)
        mealRelation = try container.decodeIfPresent(MealRelation.self, forKey: .mealRelation)
    }

    var doseText: String {
        DoseFormatter.string(amount: doseAmount, unit: doseUnit)
    }

    /// 墙钟时刻展示（localTime 形如 "08:30:00" 或 ISO 时间串时取 HH:mm 段）。
    var localTimeText: String {
        if localTime.count >= 5, localTime[localTime.index(localTime.startIndex, offsetBy: 2)] == ":" {
            return String(localTime.prefix(5))
        }
        if let date = ISO8601.date(from: localTime) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(identifier: timezone) ?? .current
            formatter.dateFormat = "HH:mm"
            return formatter.string(from: date)
        }
        return localTime
    }
}

/// 服药打卡记录（medication_intake_record 投影；一实例仅一条有效记录）。
struct IntakeRecordDTO: Decodable, Identifiable {
    let id: String
    let reminderInstanceId: String
    let memberId: String
    let planItemId: String
    /// taken / skipped
    let action: String
    let takenAt: Date?
    let recordedAt: Date
    let isMakeup: Bool
    let operatedByAccountId: String
    let skipReason: String?
    let confirmationMethod: String
}

/// 成员单日提醒视图（GET /members/:memberId/reminders/today 及按日期查询接口返回）。
struct ReminderDayDTO: Decodable {
    let date: String
    let timezone: String
    let items: [ReminderInstanceDTO]
}

// MARK: - 请求体

/// 打卡请求：clientRequestId 为客户端幂等键（UUID），与服务端实例幂等键共同防重复打卡。
struct CheckinRequest: Encodable {
    let action: String
    let takenAt: String
    let confirmationMethod: String
    let clientRequestId: String

    static func takenNow() -> CheckinRequest {
        CheckinRequest(
            action: "taken",
            takenAt: ISO8601.string(from: Date()),
            confirmationMethod: ConfirmationMethod.tap.rawValue,
            clientRequestId: UUID().uuidString
        )
    }
}

struct SkipRequest: Encodable {
    let reason: String?
}
