import Combine
import Foundation

/// 依从统计 ViewModel：汇总（week / month）+ 月历（按月切换重查）。
@MainActor
final class AdherenceViewModel: ObservableObject {
    @Published private(set) var summary: AdherenceSummaryDTO?
    @Published private(set) var calendarDays: [AdherenceCalendarDayDTO] = []
    @Published var range: String = "week"
    @Published var currentMonth = Date()
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let adherenceService: AdherenceService

    init(adherenceService: AdherenceService = AppEnvironment.shared.adherenceService) {
        self.adherenceService = adherenceService
    }

    func load(memberId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let summaryResult = adherenceService.summary(memberId: memberId, range: range)
            async let calendarResult = adherenceService.calendar(memberId: memberId, month: ISO8601.monthString(from: currentMonth))
            summary = try await summaryResult
            calendarDays = try await calendarResult
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "统计加载失败"
        }
    }

    func changeRange(_ newRange: String, memberId: String) async {
        range = newRange
        do {
            summary = try await adherenceService.summary(memberId: memberId, range: range)
        } catch {
            errorMessage = (error as? APIError)?.message ?? "统计加载失败"
        }
    }

    func moveMonth(by months: Int, memberId: String) async {
        guard let next = Calendar.current.date(byAdding: .month, value: months, to: currentMonth) else { return }
        currentMonth = next
        do {
            calendarDays = try await adherenceService.calendar(memberId: memberId, month: ISO8601.monthString(from: next))
        } catch {
            errorMessage = (error as? APIError)?.message ?? "月历加载失败"
        }
    }

    /// 月历网格：周一起始；返回 (日期串, 该日数据?)，nil 数据表示当月空白或无统计。
    func calendarCells() -> [(dayNumber: Int, data: AdherenceCalendarDayDTO?)] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2 // 周一
        guard let interval = calendar.dateInterval(of: .month, for: currentMonth),
              let dayRange = calendar.range(of: .day, in: .month, for: currentMonth) else {
            return []
        }
        let firstWeekday = calendar.component(.weekday, from: interval.start) // 1=周日 … 7=周六
        let leadingBlanks = (firstWeekday + 5) % 7 // 转成周一起始的空格数
        let byDate = Dictionary(uniqueKeysWithValues: calendarDays.map { ($0.date, $0) })
        var cells: [(dayNumber: Int, data: AdherenceCalendarDayDTO?)] = []
        for _ in 0..<leadingBlanks {
            cells.append((dayNumber: 0, data: nil))
        }
        let monthPrefix = ISO8601.monthString(from: currentMonth)
        for day in dayRange {
            let dateString = String(format: "%@-%02d", monthPrefix, day)
            cells.append((dayNumber: day, data: byDate[dateString]))
        }
        return cells
    }
}
