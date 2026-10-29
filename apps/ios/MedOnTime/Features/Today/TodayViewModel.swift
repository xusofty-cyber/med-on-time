import Combine
import Foundation

/// 今日提醒 ViewModel：拉取当日时间线、执行打卡 / 稍后 / 跳过，并同步本地通知兜底排程。
@MainActor
final class TodayViewModel: ObservableObject {
    @Published private(set) var instances: [ReminderInstanceDTO] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var actingInstanceId: String?

    private let reminderService: ReminderService
    private let checkinService: CheckinService
    private let localNotifications: LocalNotificationManager
    private let session: AuthSession

    init(
        reminderService: ReminderService = AppEnvironment.shared.reminderService,
        checkinService: CheckinService = AppEnvironment.shared.checkinService,
        localNotifications: LocalNotificationManager = AppEnvironment.shared.localNotifications,
        session: AuthSession = AppEnvironment.shared.session
    ) {
        self.reminderService = reminderService
        self.checkinService = checkinService
        self.localNotifications = localNotifications
        self.session = session
    }

    var pendingInstances: [ReminderInstanceDTO] {
        instances.filter { $0.status.isActionable }
    }

    var finishedInstances: [ReminderInstanceDTO] {
        instances.filter { $0.status.isFinished }
    }

    func load(memberId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let fetchedResult = reminderService.today(memberId: memberId)
            // 确保关怀设置在本地通知排程前就绪，防止多成员切换或首启时用旧/nil设置排程
            let currentSettings: CareSettingsDTO?
            if let existing = session.careSettings, session.currentMember?.id == memberId {
                currentSettings = existing
            } else {
                await session.refreshCareSettings()
                currentSettings = session.careSettings
            }
            let fetched = try await fetchedResult
            instances = fetched.sorted { $0.scheduledAtUtc < $1.scheduledAtUtc }
            errorMessage = nil
            // 以服务端时间线为准重排本地通知兜底（锁屏药名展示受关怀设置控制）。
            // C-1 修复：排程含今明两日——只排当日时，用户某天不打开 App 当天即零提醒。
            let tzId = fetched.first?.timezone ?? session.currentMember?.timezone ?? "Asia/Shanghai"
            let upcoming = (try? await reminderService.todayAndTomorrow(memberId: memberId, memberTimeZoneId: tzId)) ?? fetched
            localNotifications.scheduleUpcomingReminders(upcoming, careSettings: currentSettings)
        } catch {
            errorMessage = (error as? APIError)?.message ?? "今日提醒加载失败"
        }
    }

    /// 打卡：一实例仅一条有效记录，clientRequestId 幂等；成功后刷新时间线（库存与统计由服务端回写）。
    func checkin(_ instance: ReminderInstanceDTO) async {
        await act(instance) {
            _ = try await checkinService.checkin(instanceId: instance.id)
        }
    }

    /// 稍后：按成员 / 计划 cycle 顺延，服务端返回更新后的实例。
    func snooze(_ instance: ReminderInstanceDTO) async {
        await act(instance) {
            let updated = try await reminderService.snooze(instanceId: instance.id)
            replace(updated)
        }
    }

    func skip(_ instance: ReminderInstanceDTO, reason: String? = nil) async {
        await act(instance) {
            let updated = try await reminderService.skip(instanceId: instance.id, reason: reason)
            replace(updated)
        }
    }

    /// 消费通知深链动作（打卡 / 稍后 / 仅打开）。
    func consumeDeepLink(_ pending: (instanceId: String, action: ReminderActionKind)) async {
        guard let instance = instances.first(where: { $0.id == pending.instanceId }) else { return }
        switch pending.action {
        case .take:
            await checkin(instance)
        case .snooze:
            await snooze(instance)
        case .open:
            break
        }
    }

    private func act(_ instance: ReminderInstanceDTO, operation: () async throws -> Void) async {
        guard actingInstanceId == nil else { return }
        actingInstanceId = instance.id
        defer { actingInstanceId = nil }
        do {
            try await operation()
            errorMessage = nil
            if let memberId = session.currentMember?.id {
                await load(memberId: memberId)
            }
        } catch {
            errorMessage = (error as? APIError)?.message ?? "操作失败"
        }
    }

    private func replace(_ updated: ReminderInstanceDTO) {
        if let index = instances.firstIndex(where: { $0.id == updated.id }) {
            instances[index] = updated
        }
    }
}
