import SwiftUI

/// 依从统计：汇总卡片（应服 / 实服 / 按时率 / 漏服 / 跳过）+ 月历热力。
struct AdherenceView: View {
    @StateObject private var viewModel = AdherenceViewModel()
    @EnvironmentObject private var session: AuthSession
    @Environment(\.careMode) private var careMode

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let error = viewModel.errorMessage {
                        ErrorBanner(message: error)
                    }
                    Picker("统计范围", selection: rangeBinding) {
                        Text("本周").tag("week")
                        Text("本月").tag("month")
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    if let summary = viewModel.summary {
                        summaryCards(summary)
                    } else if viewModel.isLoading {
                        ProgressView("正在加载统计…")
                            .padding(.top, 40)
                    }

                    calendarSection
                }
                .padding(.vertical)
            }
            .background(Theme.background)
            .navigationTitle("依从统计")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    MemberSwitcherMenu()
                }
            }
            .task(id: session.currentMember?.id) {
                await reload()
            }
            .refreshable { await reload() }
        }
    }

    private var rangeBinding: Binding<String> {
        Binding(
            get: { viewModel.range },
            set: { newValue in
                Task {
                    if let memberId = session.currentMember?.id {
                        await viewModel.changeRange(newValue, memberId: memberId)
                    }
                }
            }
        )
    }

    private func summaryCards(_ summary: AdherenceSummaryDTO) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                statCard(title: "服药依从率", value: percentText(summary.adherenceRate), color: Theme.primary, large: true)
                statCard(title: "按时率", value: percentText(summary.onTimeRate), color: Theme.primary, large: true)
            }
            HStack(spacing: 12) {
                statCard(title: "应服", value: "\(summary.scheduledCount)", color: .primary, large: false)
                statCard(title: "实服", value: "\(summary.takenCount)", color: .primary, large: false)
                statCard(title: "漏服", value: "\(summary.missedCount)", color: Theme.danger, large: false)
                statCard(title: "跳过", value: "\(summary.skippedCount)", color: Theme.warning, large: false)
            }
        }
        .padding(.horizontal)
    }

    private func statCard(title: String, value: String, color: Color, large: Bool) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(large ? .largeTitle.bold() : .title3.bold())
                .foregroundStyle(color)
            Text(title)
                .font(careMode ? .body : .caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, large ? 16 : 10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var calendarSection: some View {
        VStack(spacing: 10) {
            HStack {
                Button {
                    Task { await moveMonth(-1) }
                } label: {
                    Image(systemName: "chevron.left")
                }
                Spacer()
                Text(monthTitle)
                    .font(careMode ? .title3.bold() : .headline)
                Spacer()
                Button {
                    Task { await moveMonth(1) }
                } label: {
                    Image(systemName: "chevron.right")
                }
            }
            HStack {
                ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { label in
                    Text("周\(label)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            let cells = viewModel.calendarCells()
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(cells.indices, id: \.self) { index in
                    calendarCell(cells[index])
                }
            }
            Text("颜色越深依从越好；红色为有漏服的日子")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func calendarCell(_ cell: (dayNumber: Int, data: AdherenceCalendarDayDTO?)) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(cellColor(cell.data))
                .aspectRatio(1, contentMode: .fit)
            if cell.dayNumber > 0 {
                VStack(spacing: 0) {
                    Text("\(cell.dayNumber)")
                        .font(careMode ? .body.bold() : .callout)
                    if let data = cell.data, data.scheduledCount > 0 {
                        Text("\(data.takenCount)/\(data.scheduledCount)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func cellColor(_ data: AdherenceCalendarDayDTO?) -> Color {
        guard let data, data.scheduledCount > 0 else { return Color(.systemBackground) }
        if data.missedCount > 0 { return Theme.danger.opacity(0.25) }
        guard let rate = data.adherenceRate else { return Color(.systemBackground) }
        return Theme.primary.opacity(0.15 + 0.55 * rate)
    }

    private var monthTitle: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy 年 M 月"
        return formatter.string(from: viewModel.currentMonth)
    }

    private func percentText(_ rate: Double?) -> String {
        guard let rate else { return "—" }
        return String(format: "%.0f%%", rate * 100)
    }

    private func reload() async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.load(memberId: memberId)
    }

    private func moveMonth(_ months: Int) async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.moveMonth(by: months, memberId: memberId)
    }
}
