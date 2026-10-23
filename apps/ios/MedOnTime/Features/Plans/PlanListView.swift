import SwiftUI

/// 计划列表：常规 / PRN、疗程阶段、存放位置一目了然；支持暂停 / 恢复 / 删除与变更史查看。
struct PlanListView: View {
    @StateObject private var viewModel = PlansViewModel()
    @EnvironmentObject private var session: AuthSession
    @Environment(\.careMode) private var careMode

    var body: some View {
        NavigationStack {
            Group {
                if session.currentMember == nil {
                    EmptyStateView(title: "暂无成员", systemImage: "person.crop.circle", description: "请先在「我的」里添加家庭成员")
                } else if viewModel.isLoading && viewModel.plans.isEmpty {
                    ProgressView("正在加载计划…")
                } else if viewModel.plans.isEmpty {
                    EmptyStateView(title: "暂无用药计划", systemImage: "pills", description: "点右上角 + 新建计划")
                } else {
                    list
                }
            }
            .navigationTitle("用药计划")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    MemberSwitcherMenu()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        PlanEditView(plan: nil)
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task(id: session.currentMember?.id) {
                await reload()
            }
            .refreshable { await reload() }
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
            ForEach(viewModel.plans) { plan in
                NavigationLink {
                    PlanEditView(plan: plan)
                } label: {
                    PlanRowView(plan: plan, careMode: careMode)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await delete(plan) }
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                    if plan.status == .active {
                        Button {
                            Task { await viewModel.pause(plan) }
                        } label: {
                            Label("暂停", systemImage: "pause.circle")
                        }
                        .tint(.orange)
                    } else if plan.status == .paused {
                        Button {
                            Task { await viewModel.resume(plan) }
                        } label: {
                            Label("恢复", systemImage: "play.circle")
                        }
                        .tint(Theme.primary)
                    }
                }
            }
        }
    }

    private func reload() async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.load(memberId: memberId)
    }

    private func delete(_ plan: PlanDTO) async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.remove(plan, memberId: memberId)
    }
}

/// 计划行：名称 + 类型 / 状态徽标 + 药品概览 + 存放位置。
struct PlanRowView: View {
    let plan: PlanDTO
    let careMode: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(plan.name)
                    .font(careMode ? .title3.bold() : .headline)
                if plan.planType == .prn {
                    badge("按需", color: .purple)
                }
                badge(plan.status.label, color: plan.status == .active ? Theme.primary : .secondary)
            }
            Text(itemsSummary)
                .font(careMode ? .body : .subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            HStack(spacing: 12) {
                Text("自 \(plan.startDate)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let location = plan.storageLocation, !location.isEmpty {
                    Label(location, systemImage: "cabinet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let phases = plan.phases, !phases.isEmpty {
                    Label("\(phases.count) 个阶段", systemImage: "chart.line.downtrend.xyaxis")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
        .careTouchTarget(careMode)
    }

    private var itemsSummary: String {
        guard let items = plan.items, !items.isEmpty else { return "暂无药品明细" }
        return items.map { "\($0.drugNameSnapshot) \(DoseFormatter.string(amount: $0.doseAmount, unit: $0.doseUnit))" }
            .joined(separator: "；")
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
