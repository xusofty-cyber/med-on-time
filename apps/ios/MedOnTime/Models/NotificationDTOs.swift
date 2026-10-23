import Foundation

/// 站内通知条目。
struct NotificationItemDTO: Decodable, Identifiable {
    let id: String
    let title: String
    let content: String
    let type: String?
    let memberId: String?
    let isRead: Bool?
    let readAt: Date?
    let createdAt: Date

    var unread: Bool { !(isRead ?? false) }
}

/// 通知渠道偏好：站内默认开；短信为用户自选开启的常规渠道；微信为占位（未接真实通道前服务端不投递）。
struct NotificationPrefsDTO: Codable {
    var inApp: Bool
    var sms: Bool
    var wechat: Bool
}
