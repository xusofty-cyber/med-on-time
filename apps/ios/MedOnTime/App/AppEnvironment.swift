import Combine
import Foundation

/// 依赖容器：组装 APIClient、各域 Service、会话、通知与路由（App 内单例，兼作 SwiftUI EnvironmentObject）。
@MainActor
final class AppEnvironment: ObservableObject {
    static let shared = AppEnvironment()

    let tokenStore = KeychainStore()
    let apiClient: APIClient
    let session: AuthSession
    let router = DeepLinkRouter.shared
    let localNotifications = LocalNotificationManager()

    let authService: AuthService
    let accountService: AccountService
    let memberService: MemberService
    let authorizationService: AuthorizationService
    let drugService: DrugService
    let planService: PlanService
    let reminderService: ReminderService
    let checkinService: CheckinService
    let adherenceService: AdherenceService
    let stockService: StockService
    let ehrService: EhrService
    let notificationService: NotificationService

    init() {
        let apiClient = APIClient(baseURL: AppConfig.apiBaseURL, tokenStore: tokenStore)
        self.apiClient = apiClient
        authService = AuthService(api: apiClient)
        accountService = AccountService(api: apiClient)
        memberService = MemberService(api: apiClient)
        authorizationService = AuthorizationService(api: apiClient)
        drugService = DrugService(api: apiClient)
        planService = PlanService(api: apiClient)
        reminderService = ReminderService(api: apiClient)
        checkinService = CheckinService(api: apiClient)
        adherenceService = AdherenceService(api: apiClient)
        stockService = StockService(api: apiClient)
        ehrService = EhrService(api: apiClient)
        notificationService = NotificationService(api: apiClient)

        let session = AuthSession(api: apiClient, tokenStore: tokenStore)
        self.session = session
        apiClient.onSessionExpired = { [weak session] in
            Task { @MainActor in
                session?.handleSessionExpired()
            }
        }
    }

    /// 计划级强提醒覆盖表（审查 H-3）：[planId: mode]，仅含设了覆盖的计划；
    /// 拉取失败返回空表（排程全体回落成员级），不阻断本地通知排程。
    func planStrongAlertOverrides(memberId: String) async -> [String: StrongAlertMode] {
        let plans = (try? await planService.list(memberId: memberId)) ?? []
        var map: [String: StrongAlertMode] = [:]
        for plan in plans {
            if let mode = plan.strongAlertModeOverride {
                map[plan.id] = mode
            }
        }
        return map
    }
}
