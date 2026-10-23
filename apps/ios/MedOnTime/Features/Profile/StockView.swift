import SwiftUI

/// 库存 ViewModel。
@MainActor
final class StockViewModel: ObservableObject {
    @Published private(set) var items: [StockItemDTO] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let stockService: StockService

    init(stockService: StockService = AppEnvironment.shared.stockService) {
        self.stockService = stockService
    }

    func load(memberId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await stockService.list(memberId: memberId)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "库存加载失败"
        }
    }

    func adjust(memberId: String, item: StockItemDTO, changeType: StockChangeType, amount: Double, expiryDate: String?, note: String?) async -> Bool {
        do {
            let updated = try await stockService.adjust(
                memberId: memberId,
                StockAdjustRequest(
                    drugId: item.drugId,
                    changeType: changeType,
                    changeAmount: amount,
                    expiryDate: expiryDate,
                    note: note
                )
            )
            if let index = items.firstIndex(where: { $0.id == updated.id }) {
                items[index] = updated
            } else {
                await load(memberId: memberId)
            }
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "库存调整失败"
            return false
        }
    }
}

/// 药品库存：余量 / 可服天数 / 到期预警 + 补货、手动调整、过期作废（均走库存流水）。
struct StockView: View {
    @StateObject private var viewModel = StockViewModel()
    @EnvironmentObject private var session: AuthSession
    @State private var adjustTarget: StockItemDTO?

    var body: some View {
        Group {
            if session.currentMember == nil {
                EmptyStateView(title: "暂无成员", systemImage: "person.crop.circle", description: nil)
            } else if viewModel.isLoading && viewModel.items.isEmpty {
                ProgressView("正在加载库存…")
            } else if viewModel.items.isEmpty {
                EmptyStateView(title: "暂无库存记录", systemImage: "shippingbox", description: "添加用药计划后，服药打卡会自动扣减库存")
            } else {
                List {
                    if let error = viewModel.errorMessage {
                        Section {
                            ErrorBanner(message: error)
                        }
                    }
                    ForEach(viewModel.items) { item in
                        StockRowView(item: item)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                adjustTarget = item
                            }
                    }
                }
            }
        }
        .navigationTitle("药品库存")
        .task(id: session.currentMember?.id) {
            await reload()
        }
        .refreshable { await reload() }
        .sheet(item: $adjustTarget) { item in
            StockAdjustView(item: item) { changeType, amount, expiry, note in
                guard let memberId = session.currentMember?.id else { return false }
                return await viewModel.adjust(
                    memberId: memberId,
                    item: item,
                    changeType: changeType,
                    amount: amount,
                    expiryDate: expiry,
                    note: note
                )
            }
        }
    }

    private func reload() async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.load(memberId: memberId)
    }
}

struct StockRowView: View {
    let item: StockItemDTO

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(item.title)
                    .font(.headline)
                Spacer()
                Text(item.quantityText)
                    .font(.headline)
                    .foregroundStyle(Theme.primary)
            }
            HStack(spacing: 8) {
                if let spec = item.specification {
                    Text(spec)
                }
                if let days = item.daysLeftEstimate {
                    Text("约可服 \(Int(days)) 天")
                }
                if let expiry = item.currentBatchExpiryDate {
                    Text("有效期至 \(String(expiry.prefix(10)))")
                }
                if let location = item.storageLocation, !location.isEmpty {
                    Label(location, systemImage: "cabinet")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                if item.expired == true {
                    badge("已过期", color: Theme.danger)
                } else if item.expiringSoon == true {
                    badge("临近过期", color: Theme.warning)
                }
                if item.lowStock == true {
                    badge("余量不足", color: Theme.warning)
                }
                if item.status == .depleted {
                    badge("已用完", color: .secondary)
                }
            }
        }
        .padding(.vertical, 3)
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

/// 库存调整表单：补货为正数入库；手动调整可正可负；过期作废按当前余量负数出库且必填备注。
struct StockAdjustView: View {
    let item: StockItemDTO
    /// (changeType, amount, expiryDate, note) -> 是否成功
    let onSubmit: (StockChangeType, Double, String?, String?) async -> Bool

    @State private var changeType: StockChangeType = .restock
    @State private var amountText = ""
    @State private var hasExpiry = false
    @State private var expiryDate = Date()
    @State private var note = ""
    @State private var isSubmitting = false
    @Environment(\.dismiss) private var dismiss

    private var selectableTypes: [StockChangeType] {
        [.restock, .manualAdjust, .expiryWriteoff]
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("药品") {
                    LabeledContent(item.title, value: "当前 \(item.quantityText)")
                }
                Section("调整") {
                    Picker("类型", selection: $changeType) {
                        ForEach(selectableTypes, id: \.self) { type in
                            Text(type.label).tag(type)
                        }
                    }
                    HStack {
                        Text(changeType == .restock ? "入库数量" : "变动数量（可负）")
                        TextField("数量", text: $amountText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    if changeType == .restock {
                        Toggle("设置有效期", isOn: $hasExpiry)
                        if hasExpiry {
                            DatePicker("有效期", selection: $expiryDate, displayedComponents: .date)
                        }
                    }
                    TextField("备注（手动调整 / 过期作废必填）", text: $note)
                }
            }
            .navigationTitle("库存调整")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "提交中…" : "提交") {
                        Task { await submit() }
                    }
                    .disabled(isSubmitting || Double(amountText) == nil)
                }
            }
        }
    }

    private func submit() async {
        guard let amount = Double(amountText) else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        let ok = await onSubmit(
            changeType,
            amount,
            changeType == .restock && hasExpiry ? ISO8601.dayString(from: expiryDate) : nil,
            note.isEmpty ? nil : note
        )
        if ok {
            dismiss()
        }
    }
}
