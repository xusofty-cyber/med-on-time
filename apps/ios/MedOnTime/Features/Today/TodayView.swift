import SwiftUI

/// 今日提醒：当日时间线 + 打卡 / 稍后 / 跳过；通知点击直达本页并执行对应动作。
struct TodayView: View {
    @StateObject private var viewModel = TodayViewModel()
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var router: DeepLinkRouter
    @Environment(\.careMode) private var careMode
    @State private var skipTarget: ReminderInstanceDTO?
    @State private var skipReason = ""

    var body: some View {
        NavigationStack {
            Group {
                if session.currentMember == nil {
                    EmptyStateView(title: "暂无成员", systemImage: "person.crop.circle", description: "请先在「我的」里添加家庭成员")
                } else if viewModel.isLoading && viewModel.instances.isEmpty {
                    ProgressView("正在加载今日提醒…")
                } else if viewModel.instances.isEmpty {
                    EmptyStateView(title: "今天没有用药安排", systemImage: "checkmark.circle", description: "下拉可刷新")
                } else {
                    list
                }
            }
            .navigationTitle("今日提醒")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    MemberSwitcherMenu()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await reload() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task(id: session.currentMember?.id) {
                await reload()
                await consumePendingAction()
            }
            .refreshable { await reload() }
            .onChange(of: router.pendingReminderId) { _ in
                Task { await consumePendingAction() }
            }
            .alert("跳过这次服药？", isPresented: skipAlertBinding) {
                TextField("跳过原因（选填）", text: $skipReason)
                Button("取消", role: .cancel) { skipTarget = nil }
                Button("确认跳过", role: .destructive) {
                    if let target = skipTarget {
                        Task { await viewModel.skip(target, reason: skipReason.isEmpty ? nil : skipReason) }
                    }
                    skipTarget = nil
                    skipReason = ""
                }
            } message: {
                Text("跳过会记入依从统计，请确认不是漏服。")
            }
        }
    }

    private var list: some View {
        List {
            if let error = viewModel.errorMessage {
                Section {
                    ErrorBanner(message: error)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
            if !viewModel.pendingInstances.isEmpty {
                Section("待服药") {
                    ForEach(viewModel.pendingInstances) { instance in
                        ReminderRowView(
                            instance: instance,
                            careMode: careMode,
                            isActing: viewModel.actingInstanceId == instance.id,
                            onTake: { Task { await viewModel.checkin(instance) } },
                            onSnooze: { Task { await viewModel.snooze(instance) } },
                            onSkip: { skipTarget = instance }
                        )
                    }
                }
            }
            if !viewModel.finishedInstances.isEmpty {
                Section("已完成") {
                    ForEach(viewModel.finishedInstances) { instance in
                        ReminderRowView(
                            instance: instance,
                            careMode: careMode,
                            isActing: false,
                            onTake: {},
                            onSnooze: {},
                            onSkip: {}
                        )
                    }
                }
            }
        }
        // 主题 A：列表底改为暖白（主题 0 沿用系统分组底，不动）。
        .if(Theme.current == .warm) { view in
            view.scrollContentBackground(.hidden)
                .background(Theme.background)
        }
    }

    private var skipAlertBinding: Binding<Bool> {
        Binding(
            get: { skipTarget != nil },
            set: { if !$0 { skipTarget = nil } }
        )
    }

    private func reload() async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.load(memberId: memberId)
    }

    private func consumePendingAction() async {
        guard let pending = router.consumePendingAction() else { return }
        await viewModel.consumeDeepLink(pending)
    }
}

/// 单条提醒行：时刻 / 药名 / 剂量 / 餐食关系 / 存放位置与备注（详细提醒）+ 状态与动作。
struct ReminderRowView: View {
    let instance: ReminderInstanceDTO
    let careMode: Bool
    let isActing: Bool
    let onTake: () -> Void
    let onSnooze: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(instance.localTimeText)
                    .font(Theme.titleFont(care: careMode))
                    .foregroundStyle(Theme.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(instance.drugNameSnapshot)
                        .font(Theme.drugNameFont(care: careMode))
                    Text(detailText)
                        .font(Theme.bodyFont(care: careMode))
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer()
                statusChip
            }

            if let location = instance.storageLocation, !location.isEmpty {
                Label("存放位置：\(location)", systemImage: "cabinet")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let note = instance.additionalNote, !note.isEmpty {
                Label(note, systemImage: "note.text")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if instance.status.isActionable {
                // 状态三重表达（颜色 + 图标 + 文字）：三按钮各配 SF Symbol，不再只靠颜色区分。
                HStack(spacing: 10) {
                    Button { onTake() } label: {
                        Label("已服用", systemImage: "checkmark")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.successAction)
                    Button { onSnooze() } label: {
                        Label("稍后", systemImage: "clock")
                    }
                    .buttonStyle(.bordered)
                    Button { onSkip() } label: {
                        Label("跳过", systemImage: "xmark")
                    }
                    .buttonStyle(.bordered)
                    .foregroundStyle(Theme.danger)
                    if isActing {
                        ProgressView()
                    }
                }
                .themeTouchTarget(careMode)
            }
        }
        // 主题 A 今日提醒大卡片：白底卡片 + 24pt 内边距 + 12pt 圆角 + 柔和阴影，
        // 行底透出暖白页底；主题 0 保持原有 4pt 纵向间距，不动。
        .if(Theme.current == .warm) { view in
            view
                .padding(Theme.cardPadding)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
                .shadow(color: Theme.cardShadowColor, radius: 12, x: 0, y: 4)
                .listRowBackground(Theme.background)
        }
        .if(Theme.current == .standard) { view in
            view.padding(.vertical, 4)
        }
    }

    private var detailText: String {
        var parts = [instance.doseText]
        if let meal = instance.mealRelation, meal != .none {
            parts.append(meal.label)
        }
        return parts.joined(separator: " · ")
    }

    /// 状态三重表达（颜色 + 图标 + 文字）：徽标同时给 tint 底、SF Symbol 与文字。
    private var statusChip: some View {
        Label(instance.status.label, systemImage: statusIcon)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(chipColor.opacity(0.15))
            .foregroundStyle(chipColor)
            .clipShape(Capsule())
    }

    private var statusIcon: String {
        switch instance.status {
        case .taken: return "checkmark.circle.fill"
        case .missed: return "xmark.circle.fill"
        case .snoozed: return "clock.fill"
        case .skipped: return "minus.circle.fill"
        default: return "circle"
        }
    }

    private var chipColor: Color {
        switch instance.status {
        case .taken: return Theme.primary
        case .skipped, .missed: return Theme.danger
        case .snoozed: return Theme.warning
        default: return .secondary
        }
    }
}
