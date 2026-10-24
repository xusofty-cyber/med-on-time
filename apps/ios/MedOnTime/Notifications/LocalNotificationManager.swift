import AVFoundation
import Foundation
import UserNotifications

/// 本地通知兜底：以服务端当日时间线（reminder_instance）为数据源排程 UNUserNotificationCenter。
/// - 药名 / 剂量是否出现在通知正文受成员关怀设置 `lockScreenShowDrugDetail` 控制，默认不含（锁屏隐私口径）。
/// - 通知带「已服用 / 稍后提醒」动作，点击一律直达今日页（动作的实际 API 调用在今日页执行，保证走统一鉴权与幂等）。
final class LocalNotificationManager {
    static let categoryIdentifier = "MED_REMINDER"
    static let takeActionIdentifier = "ACTION_TAKE"
    static let snoozeActionIdentifier = "ACTION_SNOOZE"
    static let instanceIdUserInfoKey = "instanceId"
    static let memberIdUserInfoKey = "memberId"
    static let strongAlertModeUserInfoKey = "strongAlertMode"
    static let showDetailUserInfoKey = "showDetail"
    static let drugNameUserInfoKey = "drugName"
    private static let identifierPrefix = "reminder-"

    private let center = UNUserNotificationCenter.current()

    static func registerCategories() {
        let take = UNNotificationAction(identifier: takeActionIdentifier, title: "已服用", options: [.foreground])
        let snooze = UNNotificationAction(identifier: snoozeActionIdentifier, title: "稍后提醒", options: [.foreground])
        let category = UNNotificationCategory(
            identifier: categoryIdentifier,
            actions: [take, snooze],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    /// 重排当日提醒：先清掉本 App 已排程的提醒类通知，再按时间线逐条排（仅未完成且时刻未到的实例）。
    func scheduleTodayReminders(_ instances: [ReminderInstanceDTO], careSettings: CareSettingsDTO?) {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else { return }
            let ours = requests.map(\.identifier).filter { $0.hasPrefix(Self.identifierPrefix) }
            self.center.removePendingNotificationRequests(withIdentifiers: ours)

            let strongMode = careSettings?.strongAlertMode ?? .none
            let showDetail = careSettings?.lockScreenShowDrugDetail ?? false
            let now = Date()
            for instance in instances {
                guard instance.status.isActionable, instance.scheduledAtUtc > now else { continue }
                let content = UNMutableNotificationContent()
                content.title = "服药提醒"
                if strongMode == .alarm {
                    content.sound = .defaultCritical
                } else {
                    content.sound = .default
                }
                content.categoryIdentifier = Self.categoryIdentifier
                if showDetail {
                    content.body = "\(instance.drugNameSnapshot) \(instance.doseText)，到时间服药了，点击查看详情"
                } else {
                    content.body = "您有一条服药提醒，点击查看详情"
                }
                content.userInfo = [
                    Self.instanceIdUserInfoKey: instance.id,
                    Self.memberIdUserInfoKey: instance.memberId,
                    Self.strongAlertModeUserInfoKey: strongMode.rawValue,
                    Self.showDetailUserInfoKey: showDetail,
                    Self.drugNameUserInfoKey: instance.drugNameSnapshot,
                ]
                // 按成员时区墙钟触发（trigger 自带时区，避免设备时区变化导致错位）。
                let timeZone = TimeZone(identifier: instance.timezone) ?? .current
                var components = Calendar.current.dateComponents(in: timeZone, from: instance.scheduledAtUtc)
                components.timeZone = timeZone
                let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
                let request = UNNotificationRequest(
                    identifier: Self.identifierPrefix + instance.id,
                    content: content,
                    trigger: trigger
                )
                self.center.add(request)
            }
        }
    }

    func cancelAllReminderNotifications() {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else { return }
            let ours = requests.map(\.identifier).filter { $0.hasPrefix(Self.identifierPrefix) }
            self.center.removePendingNotificationRequests(withIdentifiers: ours)
        }
    }
}

/// 通知中心回调：前台展示横幅；点击 / 动作统一转 DeepLinkRouter（直达今日页）。
final class LocalNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = LocalNotificationDelegate()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let userInfo = notification.request.content.userInfo
        let mode = userInfo[LocalNotificationManager.strongAlertModeUserInfoKey] as? String
        let showDetail = userInfo[LocalNotificationManager.showDetailUserInfoKey] as? Bool ?? false
        let drugName = userInfo[LocalNotificationManager.drugNameUserInfoKey] as? String ?? ""

        if mode == StrongAlertMode.voice.rawValue {
            let speechText: String
            if showDetail && !drugName.isEmpty {
                speechText = "服药时间到了，请按时服用 \(drugName)"
            } else {
                speechText = "服药时间到了，请按时服药"
            }
            await MainActor.run {
                VoiceAnnouncer.shared.speak(text: speechText)
            }
        }
        return [.banner, .list, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        guard let instanceId = userInfo[LocalNotificationManager.instanceIdUserInfoKey] as? String else { return }
        let memberId = userInfo[LocalNotificationManager.memberIdUserInfoKey] as? String
        let action: ReminderActionKind
        switch response.actionIdentifier {
        case LocalNotificationManager.takeActionIdentifier:
            action = .take
        case LocalNotificationManager.snoozeActionIdentifier:
            action = .snooze
        default:
            action = .open
        }
        await MainActor.run {
            DeepLinkRouter.shared.handleNotification(instanceId: instanceId, memberId: memberId, action: action)
        }
    }
}

/// 语音播报合成器（前台强提醒 voice 模式）。
@MainActor
final class VoiceAnnouncer {
    static let shared = VoiceAnnouncer()
    private let synthesizer = AVSpeechSynthesizer()

    func speak(text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
    }
}
