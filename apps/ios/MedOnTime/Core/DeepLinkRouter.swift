import Combine
import Foundation

enum MainTab {
    case today
    case plans
    case adherence
    case profile
}

enum ReminderActionKind {
    case open
    case take
    case snooze
}

/// 通知点击 / 通知动作的深链路由：通知中心回调只写这里，UI 层订阅消费（点击直达今日页并执行对应动作）。
@MainActor
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()

    @Published var selectedTab: MainTab = .today
    @Published private(set) var pendingReminderId: String?
    @Published private(set) var pendingAction: ReminderActionKind = .open

    func handleNotification(instanceId: String, action: ReminderActionKind) {
        pendingReminderId = instanceId
        pendingAction = action
        selectedTab = .today
    }

    /// 今日页消费待处理动作（消费后清空，避免重复执行）。
    func consumePendingAction() -> (instanceId: String, action: ReminderActionKind)? {
        guard let instanceId = pendingReminderId else { return nil }
        let action = pendingAction
        pendingReminderId = nil
        pendingAction = .open
        return (instanceId, action)
    }
}
