import SwiftUI

/// 计划新建 / 编辑：基本信息 + 药品明细（搜索选药）+ 疗程阶段 + PRN + 周期覆盖 + 存放位置 / 备注（R-1）。
struct PlanEditView: View {
    @StateObject private var viewModel: PlanEditViewModel
    @EnvironmentObject private var session: AuthSession
    @Environment(\.dismiss) private var dismiss
    @State private var searchTarget: SearchTarget?

    private struct SearchTarget: Identifiable {
        let itemId: UUID
        var id: UUID { itemId }
    }

    init(plan: PlanDTO?) {
        _viewModel = StateObject(wrappedValue: PlanEditViewModel(plan: plan))
    }

    var body: some View {
        Form {
            basicSection
            itemsSection
            if viewModel.planType == .scheduled {
                phasesSection
            }
            cycleSection
            storageSection
            if viewModel.isEditing, let planId = viewModel.editingPlanId {
                Section {
                    NavigationLink("查看变更历史") {
                        PlanHistoryView(planId: planId)
                    }
                }
            }
            if let error = viewModel.errorMessage {
                Section {
                    ErrorBanner(message: error)
                }
            }
        }
        .navigationTitle(viewModel.isEditing ? "编辑计划" : "新建计划")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(viewModel.isSaving ? "保存中…" : "保存") {
                    Task { await save() }
                }
                .disabled(viewModel.isSaving)
            }
        }
        .sheet(item: $searchTarget) { target in
            if let memberId = session.currentMember?.id {
                DrugSearchView(memberId: memberId) { drug in
                    if let index = viewModel.items.firstIndex(where: { $0.id == target.itemId }) {
                        viewModel.items[index].drugId = drug.id
                        viewModel.items[index].drugName = drug.displayName
                        viewModel.items[index].doseUnit = drug.unit
                    }
                }
            }
        }
    }

    // MARK: - Sections

    private var basicSection: some View {
        Section("基本信息") {
            TextField("计划名称（留空按首个药品生成）", text: $viewModel.name)
            Picker("计划类型", selection: $viewModel.planType) {
                ForEach(PlanType.allCases, id: \.self) { type in
                    Text(type.label).tag(type)
                }
            }
            DatePicker("开始日期", selection: $viewModel.startDate, displayedComponents: .date)
            Toggle("设置结束日期", isOn: $viewModel.hasEndDate)
            if viewModel.hasEndDate {
                DatePicker("结束日期", selection: $viewModel.endDate, in: viewModel.startDate..., displayedComponents: .date)
            }
            if viewModel.planType == .prn {
                HStack {
                    Text("最小间隔（分钟）")
                    TextField("如 240", text: $viewModel.prnMinIntervalText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
                HStack {
                    Text("每日最多次数")
                    TextField("如 3", text: $viewModel.prnMaxPerDayText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
    }

    private var itemsSection: some View {
        Section("药品明细") {
            ForEach($viewModel.items) { $draft in
                PlanItemEditorView(
                    draft: $draft,
                    onSearchDrug: { searchTarget = SearchTarget(itemId: draft.id) },
                    onRemove: { viewModel.removeItem(id: draft.id) }
                )
            }
            Button {
                viewModel.addItem()
            } label: {
                Label("添加药品", systemImage: "plus.circle")
            }
        }
    }

    private var phasesSection: some View {
        Section("疗程阶段（可选，阶段只改每日剂量）") {
            ForEach($viewModel.phases) { $phase in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("持续天数")
                        TextField("天", text: $phase.durationDaysText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }
                    HStack {
                        Text("每日总量")
                        TextField("数量", text: $phase.dailyDoseAmountText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        TextField("单位", text: $phase.dailyDoseUnit)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 56)
                    }
                    Toggle("末阶段（停药）", isOn: $phase.isFinalStop)
                    TextField("阶段备注（选填）", text: $phase.note)
                    Button(role: .destructive) {
                        viewModel.removePhase(id: phase.id)
                    } label: {
                        Text("删除阶段")
                    }
                }
                .padding(.vertical, 4)
            }
            Button {
                viewModel.addPhase()
            } label: {
                Label("添加阶段", systemImage: "plus.circle")
            }
        }
    }

    private var cycleSection: some View {
        Section("提醒周期") {
            Toggle("按计划覆盖提醒周期", isOn: $viewModel.useCycleOverride)
            if viewModel.useCycleOverride {
                Picker("周期预设", selection: $viewModel.cyclePreset) {
                    ForEach(CyclePreset.allCases, id: \.self) { preset in
                        Text(preset.label).tag(preset)
                    }
                }
            } else {
                Text("未覆盖时使用成员关怀设置中的周期预设")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var storageSection: some View {
        Section("存放与备注") {
            TextField("存放位置（如：客厅药箱）", text: $viewModel.storageLocation)
            TextField("附加备注（详细提醒时展示）", text: $viewModel.additionalNote)
            TextField("计划备注", text: $viewModel.note)
        }
    }

    private func save() async {
        guard let memberId = session.currentMember?.id else { return }
        if await viewModel.save(memberId: memberId) {
            dismiss()
        }
    }
}

/// 单条药品明细编辑器。
struct PlanItemEditorView: View {
    @Binding var draft: PlanEditViewModel.ItemDraft
    let onSearchDrug: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: onSearchDrug) {
                HStack {
                    Image(systemName: "magnifyingglass")
                    Text(draft.drugName.isEmpty ? "搜索选择药品" : draft.drugName)
                        .foregroundStyle(draft.drugName.isEmpty ? .secondary : .primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack {
                Text("每次剂量")
                Spacer()
                TextField("数量", text: $draft.doseAmountText)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 70)
                TextField("单位", text: $draft.doseUnit)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 52)
            }

            Picker("频次", selection: $draft.frequencyType) {
                ForEach(FrequencyType.allCases, id: \.self) { type in
                    Text(type.label).tag(type)
                }
            }

            timesEditor

            if draft.frequencyType == .weekly {
                weekdayPicker
            }
            if draft.frequencyType == .intervalDays {
                Stepper("每隔 \(draft.intervalDays) 天", value: $draft.intervalDays, in: 1...30)
            }

            Picker("餐食关系", selection: $draft.mealRelation) {
                ForEach(MealRelation.allCases, id: \.self) { relation in
                    Text(relation.label).tag(relation)
                }
            }
            Picker("疗程", selection: $draft.courseType) {
                ForEach(CourseType.allCases, id: \.self) { course in
                    Text(course.label).tag(course)
                }
            }
            if draft.courseType == .fixedDays {
                HStack {
                    Text("疗程天数")
                    TextField("天", text: $draft.courseDaysText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
            }

            Button(role: .destructive, action: onRemove) {
                Label("删除这条明细", systemImage: "trash")
            }
        }
        .padding(.vertical, 4)
    }

    private var timesEditor: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(draft.times.indices, id: \.self) { index in
                HStack {
                    DatePicker("服药时刻", selection: timeBinding(index), displayedComponents: .hourAndMinute)
                    if draft.times.count > 1 {
                        Button {
                            draft.times.remove(at: index)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Button {
                draft.times.append(ISO8601.date(fromTimeString: "12:00"))
            } label: {
                Label("添加时刻", systemImage: "plus.circle")
            }
        }
    }

    private func timeBinding(_ index: Int) -> Binding<Date> {
        Binding(
            get: { draft.times[index] },
            set: { draft.times[index] = $0 }
        )
    }

    private var weekdayPicker: some View {
        let labels = ["一", "二", "三", "四", "五", "六", "日"]
        return VStack(alignment: .leading, spacing: 6) {
            Text("每周哪几天")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                ForEach(labels.indices, id: \.self) { index in
                    let day = index + 1
                    Button("周\(labels[index])") {
                        if draft.weekdays.contains(day) {
                            draft.weekdays.remove(day)
                        } else {
                            draft.weekdays.insert(day)
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(draft.weekdays.contains(day) ? Theme.primary : .gray)
                }
            }
        }
    }
}

/// 计划变更历史（字段级时间线；代操作的操作人与级别在此双记可见）。
struct PlanHistoryView: View {
    let planId: String
    @State private var entries: [PlanChangeHistoryDTO] = []
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(Theme.danger)
            }
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(entry.changedField)
                            .font(.headline)
                        Spacer()
                        Text(entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("\(entry.oldValue ?? "—") → \(entry.newValue ?? "—")")
                        .font(.subheadline)
                    Text(operatorText(entry))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
            }
        }
        .navigationTitle("变更历史")
        .task {
            do {
                entries = try await AppEnvironment.shared.planService.history(planId: planId)
            } catch {
                errorMessage = (error as? APIError)?.message ?? "历史加载失败"
            }
        }
    }

    private func operatorText(_ entry: PlanChangeHistoryDTO) -> String {
        if let level = entry.operatorLevel, !level.isEmpty {
            return "操作人：\(entry.operatorType.label)（\(level)）"
        }
        return "操作人：\(entry.operatorType.label)"
    }
}
