import BackgroundTasks
import Foundation

/// 本地通知排程刷新（2026-10-30 全项目审查 C-1 修复）。
///
/// 背景：iOS 客户端未接 APNs（服务端 app_push 通道在本端无令牌可投），本地通知是
/// 唯一兜底。此前排程只发生在打开今日页时且只排当日——用户某天不打开 App，
/// 当天即零提醒。现统一口径：任一刷新时机（今日页加载 / App 回前台 / 系统后台
/// 刷新任务）都重排「当前成员今明两日」，把无提醒窗口压到最短；长期解法仍是
/// APNs 接入（需后端推送通道配合，另行立项）。
enum ReminderScheduleRefresher {
    /// 须与 Info.plist 的 BGTaskSchedulerPermittedIdentifiers 一致。
    static let taskIdentifier = "com.medontime.app.reminder-refresh"

    /// 拉取当前成员今明两日时间线并重排本地通知。网络失败时保留既有排程不清零。
    static func refresh() async {
        let env = AppEnvironment.shared
        let session = env.session
        guard session.isSignedIn, let member = session.currentMember else { return }
        if session.careSettings == nil {
            await session.refreshCareSettings()
        }
        do {
            let items = try await env.reminderService.todayAndTomorrow(
                memberId: member.id,
                memberTimeZoneId: member.timezone
            )
            let overrides = await env.planStrongAlertOverrides(memberId: member.id)
            env.localNotifications.scheduleUpcomingReminders(
                items,
                careSettings: session.careSettings,
                planOverrides: overrides
            )
        } catch {
            // 拉取失败：既有排程仍是最近一次成功口径，不清空、不覆盖。
        }
    }

    /// 提交下一次系统后台刷新（最早 6 小时后，系统按电量/使用习惯择机执行）。
    static func scheduleNextBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// 注册后台刷新处理（必须在 App 启动完成前调用，见 AppDelegate）。
    static func registerBackgroundTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            scheduleNextBackgroundRefresh()
            let work = Task {
                await refresh()
                refreshTask.setTaskCompleted(success: true)
            }
            refreshTask.expirationHandler = {
                work.cancel()
            }
        }
    }
}
