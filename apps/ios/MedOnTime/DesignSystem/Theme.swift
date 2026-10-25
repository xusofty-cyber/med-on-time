import SwiftUI

/// 界面主题（阶段 3，事实源：design-system/medontime/tokens.json + MASTER-A.md）。
/// - 主题 0 现行绿白（默认）：归并定稿值——页面底由系统分组底承担、正文 #101511、
///   主绿 #0B6B4F、深绿 #084C38（归并 iOS 原 RGB 7/79/58 的换算漂移 #074F3A）。
/// - 主题 A 暖阳关怀（推断级）：暖白底 #FFF9F2、主按钮 #0369A1、正文 17pt、圆角 12pt、
///   卡片内边距 24pt + 柔和阴影、触控 ≥48pt。
/// - 主题 B（临床极简）只落 Admin + PC Web，移动端不做：本枚举只有 0 与 A。
/// - 关怀模式与主题是独立维度（关怀是密度/无障碍设置，不是主题）；两者叠加后的
///   配色未裁决（MASTER-A §0），关怀开启时字号/触控仍按关怀口径放大。
enum AppTheme: String, CaseIterable {
    case standard = "0"
    case warm = "a"

    var label: String {
        switch self {
        case .standard: return "现行绿白"
        case .warm: return "暖阳关怀"
        }
    }

    var description: String {
        switch self {
        case .standard: return "默认主题 · 绿白配色"
        case .warm: return "暖白护眼底色 · 大字号与疏朗间距，适合长辈日常使用"
        }
    }
}

/// 主题存储：UserDefaults（@AppStorage，键 medontime-theme，与 Web/Admin/小程序端同键同值，
/// 不同存储后端）。@Published theme 是 SwiftUI 刷新的事实源；storedId 只做持久化镜像。
/// 注意：@AppStorage 在 ObservableObject 内不会自动触发 objectWillChange，故另设 @Published。
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()

    @AppStorage("medontime-theme") private var storedId: String = "0"

    @Published private(set) var theme: AppTheme

    private init() {
        let stored = UserDefaults.standard.string(forKey: "medontime-theme")
        theme = AppTheme(rawValue: stored ?? "0") ?? .standard
    }

    func setTheme(_ theme: AppTheme) {
        self.theme = theme
        storedId = theme.rawValue
    }
}

/// 设计口径：医嘱绿 #0B6B4F（UI 规范定版）；关怀模式指标 ≥18pt / 对比度 ≥7:1 / 点击区 ≥56。
/// 各 Token 均为按当前主题计算的静态值，调用方写法不变（Theme.primary 等）；
/// 主题切换后 RootView 用 .id(theme) 重建主 Tab 树，全部调用处重新求值。
enum Theme {
    static var current: AppTheme { ThemeStore.shared.theme }

    static var primary: Color {
        current == .warm
            ? Color(red: 3 / 255, green: 105 / 255, blue: 161 / 255)
            : Color(red: 11 / 255, green: 107 / 255, blue: 79 / 255)
    }

    static var primaryDark: Color {
        current == .warm
            ? Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
            : Color(red: 8 / 255, green: 76 / 255, blue: 56 / 255)
    }

    static var warning: Color {
        current == .warm
            ? Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
            : Color.orange
    }

    static var danger: Color {
        current == .warm
            ? Color(red: 220 / 255, green: 38 / 255, blue: 38 / 255)
            : Color.red
    }

    static var background: Color {
        current == .warm
            ? Color(red: 255 / 255, green: 249 / 255, blue: 242 / 255)
            : Color(.systemGroupedBackground)
    }

    /// 卡片/弹窗/输入底：两套主题均为白色。
    static var surface: Color { Color.white }

    static var textPrimary: Color {
        current == .warm
            ? Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
            : Color(red: 16 / 255, green: 21 / 255, blue: 17 / 255)
    }

    static var textSecondary: Color {
        current == .warm
            ? Color(red: 71 / 255, green: 85 / 255, blue: 105 / 255)
            : Color.secondary
    }

    static var borderSubtle: Color {
        current == .warm
            ? Color(red: 232 / 255, green: 220 / 255, blue: 200 / 255)
            : Color(red: 227 / 255, green: 232 / 255, blue: 229 / 255)
    }

    static var borderStrong: Color {
        current == .warm
            ? Color(red: 100 / 255, green: 116 / 255, blue: 139 / 255)
            : Color(red: 211 / 255, green: 218 / 255, blue: 214 / 255)
    }

    /// 已服按钮底：主题 0 与主绿同值；主题 A 取 #047857（推断级）。
    static var successAction: Color {
        current == .warm
            ? Color(red: 4 / 255, green: 120 / 255, blue: 87 / 255)
            : Color(red: 11 / 255, green: 107 / 255, blue: 79 / 255)
    }

    /// 已服浅底 / 深字（D10 状态组）：主题 A 取 #D1FAE5 / #065F46。
    static var successTint: Color {
        current == .warm
            ? Color(red: 209 / 255, green: 250 / 255, blue: 229 / 255)
            : Color(red: 230 / 255, green: 244 / 255, blue: 239 / 255)
    }

    static var successTintText: Color {
        current == .warm
            ? Color(red: 6 / 255, green: 95 / 255, blue: 70 / 255)
            : Color(red: 11 / 255, green: 107 / 255, blue: 79 / 255)
    }

    /// 危险深字（D10）：主题 A 取 #991B1B。
    static var dangerTintText: Color {
        current == .warm
            ? Color(red: 153 / 255, green: 27 / 255, blue: 27 / 255)
            : Color(red: 185 / 255, green: 28 / 255, blue: 28 / 255)
    }

    /// 主题 A 卡片阴影色（推断级）：rgba(15,23,42,0.08)，配合 12pt 半径、y 偏移 4pt 使用。
    static var cardShadowColor: Color {
        Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255).opacity(0.08)
    }

    /// 卡片圆角：主题 0 取 8pt（与既有 ErrorBanner 一致）；主题 A 取 12pt。
    static var cornerRadius: CGFloat { current == .warm ? 12 : 8 }

    /// 今日提醒卡片内边距：主题 A 取 24pt；主题 0 取 16pt。
    static var cardPadding: CGFloat { current == .warm ? 24 : 16 }

    /// 最小触控目标：主题 0 取 44pt；主题 A 取 48pt；关怀模式取 56pt（见 themeTouchTarget）。
    static var touchTargetMin: CGFloat { current == .warm ? 48 : 44 }

    /// 正文字体：关怀模式走 .body（另有 dynamicTypeSize 放大）；主题 A 取 17pt；主题 0 取 .subheadline。
    static func bodyFont(care: Bool) -> Font {
        if care { return .body }
        return current == .warm ? .system(size: 17) : .subheadline
    }

    /// 标题字体（时刻）：关怀模式走 .title2.bold；主题 A 取 20pt bold；主题 0 取 .headline。
    static func titleFont(care: Bool) -> Font {
        if care { return .title2.bold() }
        return current == .warm ? .system(size: 20).bold() : .headline
    }

    /// 标题字体（药名）：关怀模式走 .title3.bold（与原值一致）；主题 A 取 20pt bold；主题 0 取 .headline。
    static func drugNameFont(care: Bool) -> Font {
        if care { return .title3.bold() }
        return current == .warm ? .system(size: 20).bold() : .headline
    }
}

/// 关怀模式环境值：由 RootView 按当前成员 careSettings 注入，子视图据此放大字号与点击区。
struct CareModeKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var careMode: Bool {
        get { self[CareModeKey.self] }
        set { self[CareModeKey.self] = newValue }
    }
}

extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }

    /// 关怀模式下点击区不低于 56pt（普通模式 44pt）。
    func careTouchTarget(_ care: Bool) -> some View {
        frame(minHeight: care ? 56 : 44)
    }

    /// 主题感知点击区：关怀 56pt；主题 A 48pt；主题 0 44pt。
    func themeTouchTarget(_ care: Bool) -> some View {
        frame(minHeight: care ? 56 : Theme.touchTargetMin)
    }
}

/// 统一的成员选择菜单（今日 / 计划 / 统计页头共用）：切换即走 session，成员数据隔离由服务端保证。
struct MemberSwitcherMenu: View {
    @EnvironmentObject private var session: AuthSession
    @Environment(\.careMode) private var careMode

    var body: some View {
        Menu {
            ForEach(session.members) { member in
                Button {
                    Task { await session.selectMember(member) }
                } label: {
                    if member.id == session.currentMember?.id {
                        Label(member.displayName, systemImage: "checkmark")
                    } else {
                        Text(member.displayName)
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "person.crop.circle")
                Text(session.currentMember?.displayName ?? "选择成员")
                    .font(careMode ? .title3.bold() : .headline)
                Image(systemName: "chevron.down")
                    .font(.caption)
            }
            .foregroundStyle(Theme.primary)
        }
    }
}

/// 错误横幅（服务端 message 已脱敏，可直接展示）。
struct ErrorBanner: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.footnote)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(Theme.danger)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
            .padding(.horizontal)
    }
}

/// 空态占位（iOS 16 无 ContentUnavailableView，自备一份等价组件）。
struct EmptyStateView: View {
    let title: String
    let systemImage: String
    let description: String?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            if let description {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
