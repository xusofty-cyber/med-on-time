import Foundation

/// 过敏档案条目（member_allergy 投影；PUT 全量替换口径，与 Web 端一致）。
struct AllergyDTO: Codable, Identifiable {
    var id: String?
    var allergen: String
    var allergenType: AllergenType
    var severity: Severity?
    var reaction: String?
    var note: String?
}

struct AllergiesPutRequest: Encodable {
    let items: [AllergyDTO]
}

/// 服药后不适记录（intake_adverse_record 投影）。
struct AdverseRecordDTO: Decodable, Identifiable {
    let id: String
    let symptomTags: [String]
    let description: String?
    let severity: Severity
    let occurredAt: Date
    let drugNameSnapshot: String?
    let planItemId: String?
    let createdAt: Date?
}

struct AdverseRecordCreateRequest: Encodable {
    let symptomTags: [String]
    var description: String?
    let severity: Severity
    let occurredAt: String
    var planItemId: String?
}

/// 不适症状标签字典（schema 口径：system_config 字典，先按定版值内置）。
struct SymptomTagItem: Identifiable {
    let key: String
    let label: String
    var id: String { key }
}

enum SymptomTag {
    static let all: [SymptomTagItem] = [
        SymptomTagItem(key: "dizzy", label: "头晕"),
        SymptomTagItem(key: "nausea", label: "恶心"),
        SymptomTagItem(key: "rash", label: "皮疹"),
        SymptomTagItem(key: "palpitation", label: "心悸"),
        SymptomTagItem(key: "stomachache", label: "胃痛"),
        SymptomTagItem(key: "sleepiness", label: "嗜睡"),
        SymptomTagItem(key: "other", label: "其他"),
    ]

    static func label(for key: String) -> String {
        all.first(where: { $0.key == key })?.label ?? key
    }
}

/// 紧急联系人（emergency_contact 投影；电话只回掩码时用 phoneMasked 展示）。
struct EmergencyContactDTO: Decodable, Identifiable {
    let id: String
    let contactName: String
    let phone: String?
    let phoneMasked: String?
    let relationship: String
    let priority: Int
    let note: String?

    var displayPhone: String {
        phone ?? phoneMasked ?? ""
    }
}

struct EmergencyContactCreateRequest: Encodable {
    let contactName: String
    let phone: String
    let relationship: String
    let priority: Int
    var note: String?
}

struct EmergencyContactUpdateRequest: Encodable {
    var contactName: String?
    var phone: String?
    var relationship: String?
    var priority: Int?
    var note: String?
}

/// 病历条目（medical-records 接口投影；正文在服务端字段加密存储，客户端只经手明文传输，不落本地缓存）。
struct MedicalRecordDTO: Decodable, Identifiable {
    let id: String
    let title: String?
    let content: String
    let recordDate: String?
    let createdAt: Date?
}

struct MedicalRecordCreateRequest: Encodable {
    var title: String?
    let content: String
    var recordDate: String?
}
