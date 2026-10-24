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

/// 病历档案（medical-records 接口投影；正文在服务端字段加密存储，客户端只经手明文传输，不落本地缓存）。
struct MedicalRecordDTO: Codable, Identifiable {
    let id: String
    let memberId: String?
    let bloodType: String?
    let heightCm: Double?
    let weightKg: Double?
    let primaryHospital: String?
    let summary: String?
    let createdAt: Date?
    let updatedAt: Date?

    var title: String? { primaryHospital }
    var content: String { summary ?? "" }
    var recordDate: String? {
        guard let date = updatedAt ?? createdAt else { return nil }
        return ISO8601.dayString(from: date)
    }

    private enum CodingKeys: String, CodingKey {
        case id, memberId, bloodType, heightCm, weightKg, primaryHospital, summary, createdAt, updatedAt
    }

    init(
        id: String = UUID().uuidString,
        memberId: String? = nil,
        bloodType: String? = nil,
        heightCm: Double? = nil,
        weightKg: Double? = nil,
        primaryHospital: String? = nil,
        summary: String? = nil,
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.memberId = memberId
        self.bloodType = bloodType
        self.heightCm = heightCm
        self.weightKg = weightKg
        self.primaryHospital = primaryHospital
        self.summary = summary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        memberId = try container.decodeIfPresent(String.self, forKey: .memberId)
        bloodType = try container.decodeIfPresent(String.self, forKey: .bloodType)
        heightCm = try container.decodeFlexibleDoubleIfPresent(forKey: .heightCm)
        weightKg = try container.decodeFlexibleDoubleIfPresent(forKey: .weightKg)
        primaryHospital = try container.decodeIfPresent(String.self, forKey: .primaryHospital)
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt)
    }
}

struct UpsertMedicalRecordRequest: Encodable {
    var bloodType: String?
    var heightCm: Double?
    var weightKg: Double?
    var primaryHospital: String?
    var summary: String?
}

typealias MedicalRecordCreateRequest = UpsertMedicalRecordRequest
