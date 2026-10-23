import Foundation

/// authorization 域：照护授权的发起 / 接受 / 拒绝 / 撤销。
struct AuthorizationService {
    let api: APIClient

    /// 我授权的 + 授权我的，合并一页返回（UI 按 grantedBy / caregiver 区分）。
    func list() async throws -> [AuthorizationDTO] {
        try await api.get("authorizations")
    }

    func create(_ request: CreateAuthorizationRequest) async throws -> AuthorizationDTO {
        try await api.post("authorizations", body: request)
    }

    func accept(id: String) async throws -> AuthorizationDTO {
        try await api.post("authorizations/\(id)/accept")
    }

    func reject(id: String) async throws -> AuthorizationDTO {
        try await api.post("authorizations/\(id)/reject")
    }

    func revoke(id: String) async throws -> AuthorizationDTO {
        try await api.post("authorizations/\(id)/revoke")
    }
}
