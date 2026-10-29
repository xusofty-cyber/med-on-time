import Foundation

/// reminder 域：今日时间线 / 按日期查询 / 稍后（按 cycle 顺延）/ 跳过。
struct ReminderService {
    let api: APIClient

    func today(memberId: String) async throws -> [ReminderInstanceDTO] {
        let resp: ReminderDayDTO = try await api.get("members/\(memberId)/reminders/today")
        return resp.items
    }

    /// 今明两日时间线（本地通知排程专用）：today 走服务端成员本地日口径，
    /// 明日按成员时区日期走 byDate；明日拉取失败不阻断今日（降级只排今日）。
    func todayAndTomorrow(memberId: String, memberTimeZoneId: String) async throws -> [ReminderInstanceDTO] {
        let todayItems = try await today(memberId: memberId)
        let tomorrow = Self.localDateString(offsetDays: 1, timeZoneId: memberTimeZoneId)
        let tomorrowItems = (try? await byDate(memberId: memberId, date: tomorrow)) ?? []
        return todayItems + tomorrowItems
    }

    /// 成员时区下「今天 + offsetDays」的 yyyy-MM-dd（与后端 local_date 口径一致）。
    static func localDateString(offsetDays: Int, timeZoneId: String) -> String {
        let tz = TimeZone(identifier: timeZoneId) ?? .current
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tz
        let base = calendar.date(byAdding: .day, value: offsetDays, to: Date()) ?? Date()
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = tz
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: base)
    }

    func byDate(memberId: String, date: String) async throws -> [ReminderInstanceDTO] {
        let resp: ReminderDayDTO = try await api.get("members/\(memberId)/reminders", query: [URLQueryItem(name: "date", value: date)])
        return resp.items
    }

    func snooze(instanceId: String) async throws -> ReminderInstanceDTO {
        try await api.post("reminders/\(instanceId)/snooze", body: EmptyBody())
    }

    func skip(instanceId: String, reason: String?) async throws -> ReminderInstanceDTO {
        try await api.post("reminders/\(instanceId)/skip", body: SkipRequest(reason: reason))
    }
}
