import Foundation

/// stock 域：库存与到期预警 / 增减流水（服药打卡自动扣减走服务端同事务，客户端不重复扣）。
struct StockService {
    let api: APIClient

    func list(memberId: String) async throws -> [StockItemDTO] {
        let res: PageResult<StockItemDTO> = try await api.get("members/\(memberId)/stock")
        return res.items
    }

    func adjust(memberId: String, _ request: StockAdjustRequest) async throws -> StockItemDTO {
        try await api.post("members/\(memberId)/stock/adjust", body: request)
    }
}
