import SwiftUI

@main
struct MedOnTimeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var environment = AppEnvironment.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(environment)
                .environmentObject(environment.session)
                .environmentObject(environment.router)
        }
        .onChange(of: scenePhase) { phase in
            // 本地通知排程续期（C-1 修复）：回前台即重排今明两日；
            // 进后台提交下一次系统后台刷新，形成不依赖打开今日页的续期链。
            if phase == .active {
                Task { await ReminderScheduleRefresher.refresh() }
            } else if phase == .background {
                ReminderScheduleRefresher.scheduleNextBackgroundRefresh()
            }
        }
    }
}
