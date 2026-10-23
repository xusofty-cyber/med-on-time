import Foundation

/// member 域：成员 CRUD（上限 10 / 账号）+ 关怀设置。
/// 列表同时含自有成员与被授权照护的成员（后端按成员隔离口径组装，客户端不跨成员拼接数据）。
struct MemberService {
    let api: APIClient

    func list() async throws -> [MemberDTO] {
        try await api.get("members")
    }

    func create(_ request: CreateMemberRequest) async throws -> MemberDTO {
        try await api.post("members", body: request)
    }

    func update(memberId: String, _ request: UpdateMemberRequest) async throws -> MemberDTO {
        try await api.patch("members/\(memberId)", body: request)
    }

    func remove(memberId: String) async throws -> OkResult {
        try await api.delete("members/\(memberId)")
    }

    func getCareSettings(memberId: String) async throws -> CareSettingsDTO {
        try await api.get("members/\(memberId)/care-settings")
    }

    func putCareSettings(memberId: String, _ settings: CareSettingsDTO) async throws -> CareSettingsDTO {
        try await api.put("members/\(memberId)/care-settings", body: settings)
    }
}
