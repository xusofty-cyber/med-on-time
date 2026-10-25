import SwiftUI

/// 根视图：按会话状态分发 登录 / 主 Tab；关怀模式（大字）随当前成员设置全局生效。
struct RootView: View {
    @EnvironmentObject private var session: AuthSession
    @StateObject private var themeStore = ThemeStore.shared

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                ProgressView("正在加载…")
            case .signedOut:
                LoginView()
            case .signedIn:
                // 主题切换时重建主 Tab 树：Theme.* 为按当前主题计算的静态值，
                // 须重建子树才会重新求值。代价是切换瞬间各 Tab 的导航栈回到根页；
                // 会话引导（.task bootstrap）挂在 Group 层，不受影响。
                MainTabView()
                    .id(themeStore.theme.rawValue)
            }
        }
        .task {
            await session.bootstrap()
        }
        .environment(\.careMode, session.careSettings?.careMode ?? false)
        .environmentObject(themeStore)
        .if(session.careSettings?.careMode == true) { view in
            view.dynamicTypeSize(.accessibility1)
        }
        .onOpenURL { url in
            guard url.scheme == "medontime" else { return }
            guard url.host == "today" else { return }
            guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
            let instanceId = components.queryItems?.first(where: { $0.name == "instanceId" })?.value
            let memberId = components.queryItems?.first(where: { $0.name == "memberId" })?.value
            guard let instanceId, UUID(uuidString: instanceId) != nil else { return }
            if let memberId, UUID(uuidString: memberId) == nil { return }
            DeepLinkRouter.shared.handleNotification(instanceId: instanceId, memberId: memberId, action: .open)
        }
    }
}

/// 五模块之四 Tab（登录为第五模块）：今日提醒 / 计划 / 统计 / 我的。
struct MainTabView: View {
    @EnvironmentObject private var router: DeepLinkRouter

    var body: some View {
        TabView(selection: $router.selectedTab) {
            TodayView()
                .tabItem { Label("今日", systemImage: "checklist") }
                .tag(MainTab.today)
            PlanListView()
                .tabItem { Label("计划", systemImage: "pills") }
                .tag(MainTab.plans)
            AdherenceView()
                .tabItem { Label("统计", systemImage: "chart.bar") }
                .tag(MainTab.adherence)
            ProfileView()
                .tabItem { Label("我的", systemImage: "person.crop.circle") }
                .tag(MainTab.profile)
        }
        .tint(Theme.primary)
    }
}
