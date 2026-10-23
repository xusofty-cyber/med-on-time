import Foundation

/// 药品（drug 的说明书层投影，字段与 Prisma camelCase 对齐）。
struct DrugDTO: Decodable, Identifiable {
    let id: String
    let genericName: String
    let brandName: String?
    let manufacturer: String?
    let approvalNumber: String?
    let dosageForm: DosageForm
    let specification: String
    let packageDesc: String?
    let unit: String
    let efficacy: String?
    let contraindications: String?
    let adverseReactions: String?
    let interactions: String?
    let storageCondition: String?
    let isOtc: Bool?
    let sourceType: String?
    let reviewStatus: String?

    var displayName: String {
        if let brandName, !brandName.isEmpty {
            return "\(genericName)（\(brandName)）"
        }
        return genericName
    }
}

/// 相互作用查询结果：说明书结构化字段 + ONC 高优先硬检标记。
struct DrugInteractionsDTO: Decodable {
    let interactions: String?
    let hardWarnings: [String]?
}

/// 自建药品请求（POST /members/:memberId/drugs/custom）。
struct CustomDrugRequest: Encodable {
    let genericName: String
    var brandName: String?
    var manufacturer: String?
    let dosageForm: DosageForm
    let specification: String
    let unit: String
    var efficacy: String?
    var contraindications: String?
    var adverseReactions: String?
    var interactions: String?
    var storageCondition: String?
}
