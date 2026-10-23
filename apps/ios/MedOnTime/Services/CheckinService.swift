import Foundation

/// checkin 域：服药打卡（一实例仅一条有效 intake_record；打卡成功后服务端自动扣库存、刷新依从统计）。
struct CheckinService {
    let api: APIClient

    func checkin(instanceId: String) async throws -> OkResult {
        try await api.post("reminders/\(instanceId)/checkin", body: CheckinRequest.takenNow())
    }

    func checkins(memberId: String, from: String, to: String) async throws -> [IntakeRecordDTO] {
        try await api.get("members/\(memberId)/checkins", query: [
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to),
        ])
    }
}
