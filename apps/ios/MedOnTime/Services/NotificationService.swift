import Foundation

/// notification 域：站内通知列表 / 标记已读 / 渠道偏好。
struct NotificationService {
    let api: APIClient

    func list(page: Int = 1, pageSize: Int = 30) async throws -> PageResult<NotificationItemDTO> {
        try await api.get("notifications", query: [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize)),
        ])
    }

    func markRead(id: String) async throws -> OkResult {
        try await api.post("notifications/\(id)/read", body: EmptyBody())
    }

    func getPrefs() async throws -> NotificationPrefsDTO {
        try await api.get("notification-prefs")
    }

    func putPrefs(_ prefs: NotificationPrefsDTO) async throws -> NotificationPrefsDTO {
        try await api.put("notification-prefs", body: prefs)
    }
}
