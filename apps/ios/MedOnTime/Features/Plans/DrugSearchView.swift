import SwiftUI

/// 药品搜索 ViewModel（trgm 模糊搜索，输入防抖）。
@MainActor
final class DrugSearchViewModel: ObservableObject {
    @Published var query = ""
    @Published private(set) var results: [DrugDTO] = []
    @Published private(set) var isSearching = false
    @Published var errorMessage: String?

    private let drugService: DrugService

    init(drugService: DrugService = AppEnvironment.shared.drugService) {
        self.drugService = drugService
    }

    func search() async {
        let keyword = query.trimmingCharacters(in: .whitespaces)
        guard !keyword.isEmpty else {
            results = []
            return
        }
        try? await Task.sleep(nanoseconds: 300_000_000)
        if Task.isCancelled { return }
        isSearching = true
        defer { isSearching = false }
        do {
            let page = try await drugService.search(query: keyword)
            if !Task.isCancelled {
                results = page.items
                errorMessage = nil
            }
        } catch {
            if !Task.isCancelled {
                errorMessage = (error as? APIError)?.message ?? "搜索失败"
            }
        }
    }
}

/// 药品搜索页：点选回填计划明细；查不到可走自建药品。
struct DrugSearchView: View {
    let memberId: String
    let onSelect: (DrugDTO) -> Void

    @StateObject private var viewModel = DrugSearchViewModel()
    @State private var showCustomForm = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error)
                        .foregroundStyle(Theme.danger)
                }
                ForEach(viewModel.results) { drug in
                    Button {
                        onSelect(drug)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(drug.displayName)
                                .font(.headline)
                                .foregroundStyle(.primary)
                            Text("\(drug.specification) · \(drug.dosageForm.label)\(drug.manufacturer.map { " · \($0)" } ?? "")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if viewModel.isSearching {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                }
            }
            .navigationTitle("搜索药品")
            .searchable(text: $viewModel.query, prompt: "输入药品名 / 通用名")
            .task(id: viewModel.query) {
                await viewModel.search()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("自建药品") { showCustomForm = true }
                }
            }
            .sheet(isPresented: $showCustomForm) {
                CustomDrugFormView(memberId: memberId) { drug in
                    onSelect(drug)
                    dismiss()
                }
            }
        }
    }
}

/// 自建药品表单（平台药品库查不到时用；创建后按 user_custom 来源进入成员药品范围）。
struct CustomDrugFormView: View {
    let memberId: String
    let onCreated: (DrugDTO) -> Void

    @State private var genericName = ""
    @State private var brandName = ""
    @State private var manufacturer = ""
    @State private var dosageForm: DosageForm = .tablet
    @State private var specification = ""
    @State private var unit = "片"
    @State private var isSaving = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("药品信息") {
                    TextField("通用名（必填）", text: $genericName)
                    TextField("商品名（选填）", text: $brandName)
                    TextField("生产企业（选填）", text: $manufacturer)
                    Picker("剂型", selection: $dosageForm) {
                        ForEach(DosageForm.allCases, id: \.self) { form in
                            Text(form.label).tag(form)
                        }
                    }
                    TextField("规格（必填，如 5mg）", text: $specification)
                    TextField("最小单位（如 片 / 粒 / ml）", text: $unit)
                }
                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }
            }
            .navigationTitle("自建药品")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "保存中…" : "保存") {
                        Task { await save() }
                    }
                    .disabled(isSaving || genericName.isEmpty || specification.isEmpty || unit.isEmpty)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let request = CustomDrugRequest(
            genericName: genericName,
            brandName: brandName.isEmpty ? nil : brandName,
            manufacturer: manufacturer.isEmpty ? nil : manufacturer,
            dosageForm: dosageForm,
            specification: specification,
            unit: unit
        )
        do {
            let drug = try await AppEnvironment.shared.drugService.createCustom(memberId: memberId, request)
            onCreated(drug)
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.message ?? "保存失败"
        }
    }
}
