import Foundation

/// account 域：资料 / 注销申请（30 天冷静期）/ 登录设备会话。
struct AccountService {
    let api: APIClient

    func profile() async throws -> AccountDTO {
        try await api.get("account/profile")
    }

    func updateProfile(nickname: String?, timezone: String?) async throws -> AccountDTO {
        try await api.patch("account/profile", body: UpdateProfileRequest(nickname: nickname, timezone: timezone))
    }

    /// 注销申请：提交后进入 30 天冷静期，冷静期内登录可撤销（服务端口径）。
    func cancel(reason: String?) async throws -> OkResult {
        try await api.post("account/cancel", body: CancelAccountRequest(reason: reason))
    }

    func sessions() async throws -> [UserSessionDTO] {
        let paged: PagedDTO<UserSessionDTO> = try await api.get("account/sessions")
        return paged.items
    }

    func revokeSession(id: String) async throws -> OkResult {
        try await api.delete("account/sessions/\(id)")
    }
}
