import Foundation

/// plan 域：计划 CRUD / 变更史 / 暂停恢复。
struct PlanService {
    let api: APIClient

    func list(memberId: String) async throws -> [PlanDTO] {
        let res: PageResult<PlanDTO> = try await api.get("members/\(memberId)/plans")
        return res.items
    }

    func create(memberId: String, _ payload: PlanPayloadDTO) async throws -> PlanDTO {
        try await api.post("members/\(memberId)/plans", body: payload)
    }

    func update(planId: String, _ payload: PlanPayloadDTO) async throws -> PlanDTO {
        try await api.patch("plans/\(planId)", body: payload)
    }

    func remove(planId: String) async throws -> OkResult {
        try await api.delete("plans/\(planId)")
    }

    func history(planId: String) async throws -> [PlanChangeHistoryDTO] {
        let res: PageResult<PlanChangeHistoryDTO> = try await api.get("plans/\(planId)/history")
        return res.items
    }

    func pause(planId: String) async throws -> PlanDTO {
        try await api.post("plans/\(planId)/pause")
    }

    func resume(planId: String) async throws -> PlanDTO {
        try await api.post("plans/\(planId)/resume")
    }
}
