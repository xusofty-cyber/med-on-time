import Foundation

/// ehr 域：过敏档案 / 服药后不适记录 / 紧急联系人 / 病历文本（正文服务端字段加密）。
struct EhrService {
    let api: APIClient

    // MARK: 过敏档案（全量读写）

    func getAllergies(memberId: String) async throws -> [AllergyDTO] {
        try await api.get("members/\(memberId)/allergies")
    }

    func putAllergies(memberId: String, items: [AllergyDTO]) async throws -> [AllergyDTO] {
        try await api.put("members/\(memberId)/allergies", body: AllergiesPutRequest(items: items))
    }

    // MARK: 服药后不适记录

    func listAdverseRecords(memberId: String) async throws -> [AdverseRecordDTO] {
        try await api.get("members/\(memberId)/adverse-records")
    }

    func createAdverseRecord(memberId: String, _ request: AdverseRecordCreateRequest) async throws -> AdverseRecordDTO {
        try await api.post("members/\(memberId)/adverse-records", body: request)
    }

    // MARK: 紧急联系人

    func listContacts(memberId: String) async throws -> [EmergencyContactDTO] {
        try await api.get("members/\(memberId)/emergency-contacts")
    }

    func createContact(memberId: String, _ request: EmergencyContactCreateRequest) async throws -> EmergencyContactDTO {
        try await api.post("members/\(memberId)/emergency-contacts", body: request)
    }

    func updateContact(memberId: String, contactId: String, _ request: EmergencyContactUpdateRequest) async throws -> EmergencyContactDTO {
        try await api.patch("members/\(memberId)/emergency-contacts/\(contactId)", body: request)
    }

    func removeContact(memberId: String, contactId: String) async throws -> OkResult {
        try await api.delete("members/\(memberId)/emergency-contacts/\(contactId)")
    }

    // MARK: 病历文本

    func listMedicalRecords(memberId: String) async throws -> [MedicalRecordDTO] {
        try await api.get("members/\(memberId)/medical-records")
    }

    func createMedicalRecord(memberId: String, _ request: MedicalRecordCreateRequest) async throws -> MedicalRecordDTO {
        try await api.post("members/\(memberId)/medical-records", body: request)
    }
}
