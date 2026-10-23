import Foundation

/// adherence 域：汇总（周 / 月）+ 月历。
struct AdherenceService {
    let api: APIClient

    func summary(memberId: String, range: String) async throws -> AdherenceSummaryDTO {
        try await api.get("members/\(memberId)/adherence/summary", query: [URLQueryItem(name: "range", value: range)])
    }

    /// month 口径为 yyyy-MM（成员本地月份）。
    func calendar(memberId: String, month: String) async throws -> [AdherenceCalendarDayDTO] {
        try await api.get("members/\(memberId)/adherence/calendar", query: [URLQueryItem(name: "month", value: month)])
    }
}
