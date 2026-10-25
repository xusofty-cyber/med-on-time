import Foundation

/// 家庭成员（member 投影）。被授权照护的非自有成员由后端附带 access / level / authorizationId，
/// accessLevel 在解码时按 Web 口径派生（见下方 init(from:)）。
struct MemberDTO: Decodable, Identifiable {
    let id: String
    let accountId: String
    let displayName: String
    let relationship: MemberRelationship
    let gender: String?
    let birthDate: String?
    let timezone: String
    let status: MemberStatus
    let sortOrder: Int?
    /// owner = 自有成员；否则为授权级别 L1/L2/L3。
    let accessLevel: String?
    let authorizationId: String?

    var isOwn: Bool { accessLevel == nil || accessLevel == "owner" }

    /// 解码键：后端下发 `access`（own → owner，authorized → caregiver）与 `level`（L1/L2/L3），
    /// 不直接下发 `accessLevel`；accessLevel 由下方 init(from:) 按 Web 口径派生。
    enum CodingKeys: String, CodingKey {
        case id, accountId, displayName, relationship, gender, birthDate, timezone, status, sortOrder
        case access, level, authorizationId
    }
}

extension MemberDTO {
    /// accessLevel 按 Web 口径派生（endpoints.ts）：自有成员为 owner；被授权成员为级别 L1/L2/L3，缺失时为 caregiver。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        accountId = try c.decode(String.self, forKey: .accountId)
        displayName = try c.decode(String.self, forKey: .displayName)
        relationship = try c.decode(MemberRelationship.self, forKey: .relationship)
        gender = try c.decodeIfPresent(String.self, forKey: .gender)
        birthDate = try c.decodeIfPresent(String.self, forKey: .birthDate)
        timezone = try c.decode(String.self, forKey: .timezone)
        status = try c.decode(MemberStatus.self, forKey: .status)
        sortOrder = try c.decodeIfPresent(Int.self, forKey: .sortOrder)
        let access = try c.decodeIfPresent(String.self, forKey: .access)
        let level = try c.decodeIfPresent(String.self, forKey: .level)
        accessLevel = access == "owner" ? "owner" : (level ?? "caregiver")
        authorizationId = try c.decodeIfPresent(String.self, forKey: .authorizationId)
    }
}

/// GET /members 的分组返回（契约 2026-10-23 定版）：own 自有成员 + authorized 被授权照护的成员。
struct MembersGroupedDTO: Decodable {
    let own: [MemberDTO]
    let authorized: [MemberDTO]
}

/// 成员关怀 / 提醒偏好（PUT /members/:memberId/care-settings）。
/// 锁屏显示药品详情默认 OFF（需求定版口径）；cycle 预设：标准 90/15、温和 120/30、严格 60/10，可按计划覆盖；strongAlertMode：none / alarm / voice。
struct CareSettingsDTO: Codable, Equatable {
    var careMode: Bool
    var cyclePreset: CyclePreset
    var cycleWindowMinutes: Int
    var cycleIntervalMinutes: Int
    var lockScreenShowDrugDetail: Bool
    var strongAlertMode: StrongAlertMode

    static let defaults = CareSettingsDTO(
        careMode: false,
        cyclePreset: .standard,
        cycleWindowMinutes: CyclePreset.standard.windowMinutes,
        cycleIntervalMinutes: CyclePreset.standard.intervalMinutes,
        lockScreenShowDrugDetail: false,
        strongAlertMode: .none
    )

    private enum CodingKeys: String, CodingKey {
        case careMode, cyclePreset, cycleWindowMinutes, cycleIntervalMinutes, lockScreenShowDrugDetail, strongAlertMode
    }

    init(
        careMode: Bool,
        cyclePreset: CyclePreset,
        cycleWindowMinutes: Int,
        cycleIntervalMinutes: Int,
        lockScreenShowDrugDetail: Bool,
        strongAlertMode: StrongAlertMode = .none
    ) {
        self.careMode = careMode
        self.cyclePreset = cyclePreset
        self.cycleWindowMinutes = cycleWindowMinutes
        self.cycleIntervalMinutes = cycleIntervalMinutes
        self.lockScreenShowDrugDetail = lockScreenShowDrugDetail
        self.strongAlertMode = strongAlertMode
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        careMode = try container.decode(Bool.self, forKey: .careMode)
        cyclePreset = try container.decode(CyclePreset.self, forKey: .cyclePreset)
        cycleWindowMinutes = try container.decode(Int.self, forKey: .cycleWindowMinutes)
        cycleIntervalMinutes = try container.decode(Int.self, forKey: .cycleIntervalMinutes)
        lockScreenShowDrugDetail = try container.decode(Bool.self, forKey: .lockScreenShowDrugDetail)
        strongAlertMode = try container.decodeIfPresent(StrongAlertMode.self, forKey: .strongAlertMode) ?? .none
    }
}

// MARK: - 请求体

struct CreateMemberRequest: Encodable {
    let displayName: String
    let relationship: MemberRelationship
    let gender: String?
    let birthDate: String?
    let timezone: String?
}

struct UpdateMemberRequest: Encodable {
    var displayName: String?
    var relationship: MemberRelationship?
    var gender: String?
    var birthDate: String?
    var timezone: String?
}
