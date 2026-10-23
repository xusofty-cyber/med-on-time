import Foundation

/// 家庭成员（member 投影）。被授权照护的非自有成员由后端附带 accessLevel / authorizationId。
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
}

/// 成员关怀 / 提醒偏好（PUT /members/:memberId/care-settings）。
/// 锁屏显示药品详情默认 OFF（需求定版口径）；cycle 预设：标准 90/15、温和 120/30、严格 60/10，可按计划覆盖。
struct CareSettingsDTO: Codable, Equatable {
    var careMode: Bool
    var cyclePreset: CyclePreset
    var cycleWindowMinutes: Int
    var cycleIntervalMinutes: Int
    var lockScreenShowDrugDetail: Bool

    static let defaults = CareSettingsDTO(
        careMode: false,
        cyclePreset: .standard,
        cycleWindowMinutes: CyclePreset.standard.windowMinutes,
        cycleIntervalMinutes: CyclePreset.standard.intervalMinutes,
        lockScreenShowDrugDetail: false
    )
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
