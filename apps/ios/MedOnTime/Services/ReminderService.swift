import Foundation

/// reminder 域：今日时间线 / 按日期查询 / 稍后（按 cycle 顺延）/ 跳过。
struct ReminderService {
    let api: APIClient

    func today(memberId: String) async throws -> [ReminderInstanceDTO] {
        try await api.get("members/\(memberId)/reminders/today")
    }

    func byDate(memberId: String, date: String) async throws -> [ReminderInstanceDTO] {
        try await api.get("members/\(memberId)/reminders", query: [URLQueryItem(name: "date", value: date)])
    }

    func snooze(instanceId: String) async throws -> ReminderInstanceDTO {
        try await api.post("reminders/\(instanceId)/snooze", body: EmptyBody())
    }

    func skip(instanceId: String, reason: String?) async throws -> ReminderInstanceDTO {
        try await api.post("reminders/\(instanceId)/skip", body: SkipRequest(reason: reason))
    }
}
