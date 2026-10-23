import SwiftUI

/// 根视图：按会话状态分发 登录 / 主 Tab；关怀模式（大字）随当前成员设置全局生效。
struct RootView: View {
    @EnvironmentObject private var session: AuthSession

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                ProgressView("正在加载…")
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
        .task {
            await session.bootstrap()
        }
        .environment(\.careMode, session.careSettings?.careMode ?? false)
        .if(session.careSettings?.careMode == true) { view in
            view.dynamicTypeSize(.accessibility1)
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
