import Foundation

/// 依从汇总（应服 / 实服 / 按时率；口径：补记计入 taken 不计 on_time，missed 与 skipped 分开统计）。
struct AdherenceSummaryDTO: Decodable {
    let range: String
    let scheduled: Int
    let taken: Int
    let onTime: Int
    let missed: Int
    let skipped: Int
    let adherenceRate: Double?
    let onTimeRate: Double?

    var scheduledCount: Int { scheduled }
    var takenCount: Int { taken }
    var onTimeCount: Int { onTime }
    var missedCount: Int { missed }
    var skippedCount: Int { skipped }
}

/// 依从月历响应（GET /members/:memberId/adherence/calendar 投影）。
struct AdherenceCalendarResponse: Decodable {
    let month: String
    let timezone: String
    let days: [AdherenceCalendarDayDTO]
}

/// 依从月历单日（date 为成员本地日期 yyyy-MM-dd）。
struct AdherenceCalendarDayDTO: Decodable, Identifiable {
    let date: String
    let scheduled: Int
    let taken: Int
    let onTime: Int
    let missed: Int
    let skipped: Int
    let adherenceRate: Double?
    let status: String?

    var id: String { date }

    var scheduledCount: Int { scheduled }
    var takenCount: Int { taken }
    var onTimeCount: Int { onTime }
    var missedCount: Int { missed }
    var skippedCount: Int { skipped }
}

/// 库存条目（member_medication 汇总池投影 + 到期 / 低量预警标记）。
struct StockItemDTO: Decodable, Identifiable {
    let id: String
    let memberId: String
    let drugId: String
    let drugName: String?
    let genericName: String?
    let brandName: String?
    let specification: String?
    let stockQuantity: Double
    let stockUnit: String
    let currentBatchExpiryDate: String?
    let storageLocation: String?
    let status: StockStatus
    let daysLeftEstimate: Double?
    let lowStock: Bool?
    let expiringSoon: Bool?
    let expired: Bool?
    let drug: DrugDTO?

    private enum CodingKeys: String, CodingKey {
        case id, memberId, drugId, drugName, genericName, brandName, specification
        case stockQuantity, stockUnit, currentBatchExpiryDate, storageLocation, status
        case daysLeftEstimate, lowStock, expiringSoon, expired, drug
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        memberId = try container.decode(String.self, forKey: .memberId)
        drugId = try container.decode(String.self, forKey: .drugId)
        drugName = try container.decodeIfPresent(String.self, forKey: .drugName)
        genericName = try container.decodeIfPresent(String.self, forKey: .genericName)
        brandName = try container.decodeIfPresent(String.self, forKey: .brandName)
        specification = try container.decodeIfPresent(String.self, forKey: .specification)
        stockQuantity = try container.decodeFlexibleDouble(forKey: .stockQuantity)
        stockUnit = try container.decode(String.self, forKey: .stockUnit)
        currentBatchExpiryDate = try container.decodeIfPresent(String.self, forKey: .currentBatchExpiryDate)
        storageLocation = try container.decodeIfPresent(String.self, forKey: .storageLocation)
        status = try container.decode(StockStatus.self, forKey: .status)
        daysLeftEstimate = try container.decodeFlexibleDoubleIfPresent(forKey: .daysLeftEstimate)
        lowStock = try container.decodeIfPresent(Bool.self, forKey: .lowStock)
        expiringSoon = try container.decodeIfPresent(Bool.self, forKey: .expiringSoon)
        expired = try container.decodeIfPresent(Bool.self, forKey: .expired)
        drug = try container.decodeIfPresent(DrugDTO.self, forKey: .drug)
    }

    var title: String {
        drugName ?? genericName ?? drug?.genericName ?? "药品"
    }

    var quantityText: String {
        DoseFormatter.string(amount: stockQuantity, unit: stockUnit)
    }
}

/// 库存调整入参（增减必须走流水：restock / manual_adjust / expiry_writeoff；手动调整与过期作废须填 note）。
struct StockAdjustRequest: Encodable {
    let drugId: String
    let changeType: StockChangeType
    let changeAmount: Double
    var expiryDate: String?
    var note: String?
}
