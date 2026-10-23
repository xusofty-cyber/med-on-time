import Combine
import Foundation

/// 计划新建 / 编辑表单状态：与 PlanPayloadDTO 同形组装，阶段与 PRN 约束在保存前本地校验（服务端再兜底）。
@MainActor
final class PlanEditViewModel: ObservableObject {
    struct ItemDraft: Identifiable {
        var id = UUID()
        var drugId: String?
        var drugName: String = ""
        var doseAmountText: String = "1"
        var doseUnit: String = "片"
        var frequencyType: FrequencyType = .timesPerDay
        var times: [Date] = [ISO8601.date(fromTimeString: "08:00")]
        var weekdays: Set<Int> = [1, 2, 3, 4, 5, 6, 7]
        var intervalDays: Int = 2
        var mealRelation: MealRelation = .none
        var courseType: CourseType = .longTerm
        var courseDaysText: String = ""
    }

    struct PhaseDraft: Identifiable {
        var id = UUID()
        var durationDaysText: String = "7"
        var dailyDoseAmountText: String = "1"
        var dailyDoseUnit: String = "片"
        var isFinalStop: Bool = false
        var note: String = ""
    }

    @Published var name = ""
    @Published var planType: PlanType = .scheduled
    @Published var startDate = Date()
    @Published var hasEndDate = false
    @Published var endDate = Date()
    @Published var note = ""
    @Published var storageLocation = ""
    @Published var additionalNote = ""
    @Published var prnMinIntervalText = ""
    @Published var prnMaxPerDayText = ""
    @Published var useCycleOverride = false
    @Published var cyclePreset: CyclePreset = .standard
    @Published var items: [ItemDraft] = [ItemDraft()]
    @Published var phases: [PhaseDraft] = []
    @Published var isSaving = false
    @Published var errorMessage: String?

    let editingPlanId: String?
    private let planService: PlanService

    init(plan: PlanDTO?, planService: PlanService = AppEnvironment.shared.planService) {
        self.planService = planService
        editingPlanId = plan?.id
        guard let plan else { return }

        name = plan.name
        planType = plan.planType
        startDate = Self.parseDay(plan.startDate) ?? Date()
        if let end = plan.endDate {
            hasEndDate = true
            endDate = Self.parseDay(end) ?? Date()
        }
        note = plan.note ?? ""
        storageLocation = plan.storageLocation ?? ""
        additionalNote = plan.additionalNote ?? ""
        prnMinIntervalText = plan.prnMinIntervalMinutes.map(String.init) ?? ""
        prnMaxPerDayText = plan.prnMaxPerDay.map(String.init) ?? ""
        if let preset = plan.cyclePreset {
            useCycleOverride = true
            cyclePreset = preset
        }
        if let planItems = plan.items, !planItems.isEmpty {
            items = planItems.map { item in
                var draft = ItemDraft()
                draft.drugId = item.drugId
                draft.drugName = item.drugNameSnapshot
                draft.doseAmountText = Self.numberText(item.doseAmount)
                draft.doseUnit = item.doseUnit
                draft.frequencyType = item.frequencyType
                draft.times = (item.frequencyRule.times ?? ["08:00"]).map { ISO8601.date(fromTimeString: $0) }
                draft.weekdays = Set(item.frequencyRule.weekdays ?? [1, 2, 3, 4, 5, 6, 7])
                draft.intervalDays = item.frequencyRule.intervalDays ?? 2
                draft.mealRelation = item.mealRelation
                draft.courseType = item.courseType
                draft.courseDaysText = item.courseDays.map(String.init) ?? ""
                return draft
            }
        }
        if let planPhases = plan.phases {
            phases = planPhases.sorted { $0.stageNo < $1.stageNo }.map { phase in
                var draft = PhaseDraft()
                draft.durationDaysText = String(phase.durationDays)
                draft.dailyDoseAmountText = Self.numberText(phase.dailyDoseAmount)
                draft.dailyDoseUnit = phase.dailyDoseUnit
                draft.isFinalStop = phase.isFinalStop
                draft.note = phase.note ?? ""
                return draft
            }
        }
    }

    var isEditing: Bool { editingPlanId != nil }

    func addItem() {
        items.append(ItemDraft())
    }

    func removeItem(id: UUID) {
        items.removeAll { $0.id == id }
        if items.isEmpty {
            items.append(ItemDraft())
        }
    }

    func addPhase() {
        phases.append(PhaseDraft())
    }

    func removePhase(id: UUID) {
        phases.removeAll { $0.id == id }
    }

    func save(memberId: String) async -> Bool {
        guard let payload = buildPayload() else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            if let editingPlanId {
                _ = try await planService.update(planId: editingPlanId, payload)
            } else {
                _ = try await planService.create(memberId: memberId, payload)
            }
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "保存失败"
            return false
        }
    }

    private func buildPayload() -> PlanPayloadDTO? {
        for item in items where item.drugId == nil {
            errorMessage = "每条明细都要先搜索选择药品"
            return nil
        }
        if planType == .prn {
            guard let interval = Int(prnMinIntervalText), interval > 0,
                  let maxPerDay = Int(prnMaxPerDayText), maxPerDay > 0 else {
                errorMessage = "按需计划须填写最小间隔分钟数与每日上限（均为正整数）"
                return nil
            }
        }
        let itemPayloads: [PlanItemInputDTO] = items.map { item in
            var rule = FrequencyRuleDTO()
            switch item.frequencyType {
            case .daily, .timesPerDay:
                rule.times = item.times.map { ISO8601.timeString(from: $0) }
            case .weekly:
                rule.times = item.times.map { ISO8601.timeString(from: $0) }
                rule.weekdays = item.weekdays.sorted()
            case .intervalDays:
                rule.times = item.times.map { ISO8601.timeString(from: $0) }
                rule.intervalDays = item.intervalDays
            case .onDemand, .courseCycle:
                rule.times = item.times.map { ISO8601.timeString(from: $0) }
            }
            return PlanItemInputDTO(
                drugId: item.drugId ?? "",
                doseAmount: Double(item.doseAmountText) ?? 1,
                doseUnit: item.doseUnit,
                frequencyType: item.frequencyType,
                frequencyRule: rule,
                mealRelation: item.mealRelation,
                courseType: item.courseType,
                courseDays: item.courseType == .fixedDays ? Int(item.courseDaysText) : nil
            )
        }
        // PRN 计划禁止挂剂量阶段（服务端同口径校验）。
        let phasePayloads: [PlanPhaseInputDTO]? = (planType == .scheduled && !phases.isEmpty)
            ? phases.enumerated().map { index, phase in
                PlanPhaseInputDTO(
                    stageNo: index + 1,
                    durationDays: Int(phase.durationDaysText) ?? 7,
                    dailyDoseAmount: Double(phase.dailyDoseAmountText) ?? 1,
                    dailyDoseUnit: phase.dailyDoseUnit,
                    isFinalStop: phase.isFinalStop,
                    note: phase.note.isEmpty ? nil : phase.note
                )
            }
            : nil
        return PlanPayloadDTO(
            name: name.isEmpty ? (items.first?.drugName ?? "用药计划") : name,
            planType: planType,
            startDate: ISO8601.dayString(from: startDate),
            endDate: hasEndDate ? ISO8601.dayString(from: endDate) : nil,
            note: note.isEmpty ? nil : note,
            storageLocation: storageLocation.isEmpty ? nil : storageLocation,
            additionalNote: additionalNote.isEmpty ? nil : additionalNote,
            prnMinIntervalMinutes: planType == .prn ? Int(prnMinIntervalText) : nil,
            prnMaxPerDay: planType == .prn ? Int(prnMaxPerDayText) : nil,
            cyclePreset: useCycleOverride ? cyclePreset : nil,
            cycleWindowMinutes: useCycleOverride ? cyclePreset.windowMinutes : nil,
            cycleIntervalMinutes: useCycleOverride ? cyclePreset.intervalMinutes : nil,
            items: itemPayloads,
            phases: phasePayloads
        )
    }

    private static func parseDay(_ string: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        if let date = formatter.date(from: String(string.prefix(10))) {
            return date
        }
        return ISO8601.date(from: string)
    }

    private static func numberText(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }
}
