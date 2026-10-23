import SwiftUI

/// 设计口径：医嘱绿 #0B6B4F（UI 规范定版）；关怀模式指标 ≥18pt / 对比度 ≥7:1 / 点击区 ≥56。
enum Theme {
    static let primary = Color(red: 11 / 255, green: 107 / 255, blue: 79 / 255)
    static let primaryDark = Color(red: 7 / 255, green: 79 / 255, blue: 58 / 255)
    static let warning = Color.orange
    static let danger = Color.red
    static let background = Color(.systemGroupedBackground)
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
            .clipShape(RoundedRectangle(cornerRadius: 8))
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
