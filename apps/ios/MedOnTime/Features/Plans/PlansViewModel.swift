import Combine
import Foundation

/// 计划列表 ViewModel。
@MainActor
final class PlansViewModel: ObservableObject {
    @Published private(set) var plans: [PlanDTO] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let planService: PlanService

    init(planService: PlanService = AppEnvironment.shared.planService) {
        self.planService = planService
    }

    func load(memberId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            plans = try await planService.list(memberId: memberId)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "计划加载失败"
        }
    }

    func pause(_ plan: PlanDTO) async {
        await mutate { try await planService.pause(planId: plan.id) }
    }

    func resume(_ plan: PlanDTO) async {
        await mutate { try await planService.resume(planId: plan.id) }
    }

    func remove(_ plan: PlanDTO, memberId: String) async {
        do {
            _ = try await planService.remove(planId: plan.id)
            await load(memberId: memberId)
        } catch {
            errorMessage = (error as? APIError)?.message ?? "删除失败"
        }
    }

    private func mutate(_ operation: () async throws -> PlanDTO) async {
        do {
            let updated = try await operation()
            if let index = plans.firstIndex(where: { $0.id == updated.id }) {
                plans[index] = updated
            }
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "操作失败"
        }
    }
}
