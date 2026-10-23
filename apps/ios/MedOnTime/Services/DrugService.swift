import Foundation

/// drug 域：药品搜索（trgm 模糊）/ 详情（说明书层）/ 相互作用 / 自建药品。
struct DrugService {
    let api: APIClient

    func search(query: String, page: Int = 1, pageSize: Int = 20) async throws -> PageResult<DrugDTO> {
        try await api.get("drugs/search", query: [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize)),
        ])
    }

    func detail(id: String) async throws -> DrugDTO {
        try await api.get("drugs/\(id)")
    }

    func interactions(id: String) async throws -> DrugInteractionsDTO {
        try await api.get("drugs/\(id)/interactions")
    }

    func createCustom(memberId: String, _ request: CustomDrugRequest) async throws -> DrugDTO {
        try await api.post("members/\(memberId)/drugs/custom", body: request)
    }
}
