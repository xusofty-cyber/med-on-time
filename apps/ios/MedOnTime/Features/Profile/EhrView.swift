import SwiftUI

/// 健康档案 ViewModel：过敏 / 不适记录 / 紧急联系人 / 病历四组数据。
@MainActor
final class EhrViewModel: ObservableObject {
    @Published private(set) var allergies: [AllergyDTO] = []
    @Published private(set) var adverseRecords: [AdverseRecordDTO] = []
    @Published private(set) var contacts: [EmergencyContactDTO] = []
    @Published private(set) var medicalRecords: [MedicalRecordDTO] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let ehrService: EhrService

    init(ehrService: EhrService = AppEnvironment.shared.ehrService) {
        self.ehrService = ehrService
    }

    func load(memberId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let allergiesResult = ehrService.getAllergies(memberId: memberId)
            async let adverseResult = ehrService.listAdverseRecords(memberId: memberId)
            async let contactsResult = ehrService.listContacts(memberId: memberId)
            async let recordsResult = ehrService.listMedicalRecords(memberId: memberId)
            allergies = try await allergiesResult
            adverseRecords = try await adverseResult
            contacts = try await contactsResult
            medicalRecords = try await recordsResult
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "健康档案加载失败"
        }
    }

    func saveAllergies(memberId: String, items: [AllergyDTO]) async -> Bool {
        do {
            allergies = try await ehrService.putAllergies(memberId: memberId, items: items)
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "过敏档案保存失败"
            return false
        }
    }

    func addAdverseRecord(memberId: String, request: AdverseRecordCreateRequest) async -> Bool {
        do {
            let created = try await ehrService.createAdverseRecord(memberId: memberId, request)
            adverseRecords.insert(created, at: 0)
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "不适记录保存失败"
            return false
        }
    }

    func addContact(memberId: String, request: EmergencyContactCreateRequest) async -> Bool {
        do {
            let created = try await ehrService.createContact(memberId: memberId, request)
            contacts.append(created)
            contacts.sort { $0.priority < $1.priority }
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "联系人保存失败"
            return false
        }
    }

    func removeContact(memberId: String, contact: EmergencyContactDTO) async {
        do {
            _ = try await ehrService.removeContact(memberId: memberId, contactId: contact.id)
            contacts.removeAll { $0.id == contact.id }
        } catch {
            errorMessage = (error as? APIError)?.message ?? "联系人删除失败"
        }
    }

    func addMedicalRecord(memberId: String, request: MedicalRecordCreateRequest) async -> Bool {
        do {
            let created = try await ehrService.createMedicalRecord(memberId: memberId, request)
            medicalRecords = [created]
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "病历保存失败"
            return false
        }
    }
}

/// 健康档案页：过敏档案（命中药品时强警告口径由服务端校验）、服药后不适、紧急联系人（上限由服务端配置，默认 3）、病历文本。
struct EhrView: View {
    @StateObject private var viewModel = EhrViewModel()
    @EnvironmentObject private var session: AuthSession
    @State private var showAllergyForm = false
    @State private var showAdverseForm = false
    @State private var showContactForm = false
    @State private var showRecordForm = false

    var body: some View {
        Group {
            if session.currentMember == nil {
                EmptyStateView(title: "暂无成员", systemImage: "person.crop.circle", description: nil)
            } else {
                List {
                    if let error = viewModel.errorMessage {
                        Section {
                            ErrorBanner(message: error)
                        }
                    }
                    allergySection
                    adverseSection
                    contactsSection
                    recordsSection
                }
            }
        }
        .navigationTitle("健康档案")
        .task(id: session.currentMember?.id) {
            await reload()
        }
        .refreshable { await reload() }
        .sheet(isPresented: $showAllergyForm) {
            AllergyFormView { allergy in
                guard let memberId = session.currentMember?.id else { return false }
                return await viewModel.saveAllergies(memberId: memberId, items: viewModel.allergies + [allergy])
            }
        }
        .sheet(isPresented: $showAdverseForm) {
            AdverseRecordFormView { request in
                guard let memberId = session.currentMember?.id else { return false }
                return await viewModel.addAdverseRecord(memberId: memberId, request: request)
            }
        }
        .sheet(isPresented: $showContactForm) {
            EmergencyContactFormView { request in
                guard let memberId = session.currentMember?.id else { return false }
                return await viewModel.addContact(memberId: memberId, request: request)
            }
        }
        .sheet(isPresented: $showRecordForm) {
            MedicalRecordFormView { request in
                guard let memberId = session.currentMember?.id else { return false }
                return await viewModel.addMedicalRecord(memberId: memberId, request: request)
            }
        }
    }

    private var allergySection: some View {
        Section {
            ForEach(viewModel.allergies) { allergy in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(allergy.allergen)
                            .font(.headline)
                        if let severity = allergy.severity {
                            Text(severity.label)
                                .font(.caption.bold())
                                .foregroundStyle(severity == .severe ? Theme.danger : .secondary)
                        }
                    }
                    if let reaction = allergy.reaction, !reaction.isEmpty {
                        Text("反应：\(reaction)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await deleteAllergy(allergy) }
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                }
            }
            Button {
                showAllergyForm = true
            } label: {
                Label("添加过敏记录", systemImage: "plus.circle")
            }
        } header: {
            Text("过敏档案")
        } footer: {
            Text("计划用药命中过敏原时系统会强警告并要求确认。")
        }
    }

    private var adverseSection: some View {
        Section("服药后不适记录") {
            ForEach(viewModel.adverseRecords) { record in
                VStack(alignment: .leading, spacing: 3) {
                    Text(record.symptomTags.map { SymptomTag.label(for: $0) }.joined(separator: "、"))
                        .font(.headline)
                    if let description = record.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Text("\(record.severity.label) · \(record.occurredAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Button {
                showAdverseForm = true
            } label: {
                Label("记录一次不适", systemImage: "plus.circle")
            }
        }
    }

    private var contactsSection: some View {
        Section("紧急联系人") {
            ForEach(viewModel.contacts) { contact in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(contact.contactName)
                            .font(.headline)
                        Text("优先级 \(contact.priority)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("\(contact.relationship) · \(contact.displayPhone)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task {
                            if let memberId = session.currentMember?.id {
                                await viewModel.removeContact(memberId: memberId, contact: contact)
                            }
                        }
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                }
            }
            Button {
                showContactForm = true
            } label: {
                Label("添加紧急联系人", systemImage: "plus.circle")
            }
        }
    }

    private var recordsSection: some View {
        Section("病历与健康信息") {
            ForEach(viewModel.medicalRecords) { record in
                VStack(alignment: .leading, spacing: 4) {
                    if let hospital = record.primaryHospital, !hospital.isEmpty {
                        Text("主诊机构：\(hospital)")
                            .font(.headline)
                    }
                    if let summary = record.summary, !summary.isEmpty {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(4)
                    }
                    HStack(spacing: 12) {
                        if let blood = record.bloodType, !blood.isEmpty {
                            Text("血型：\(blood)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if let h = record.heightCm {
                            Text(String(format: "身高：%.0fcm", h))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if let w = record.weightKg {
                            Text(String(format: "体重：%.1fkg", w))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let date = record.recordDate {
                        Text("更新于：\(date)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                showRecordForm = true
            } label: {
                Label(viewModel.medicalRecords.isEmpty ? "添加病历档案" : "编辑病历档案", systemImage: "pencil.circle")
            }
        }
    }

    private func reload() async {
        guard let memberId = session.currentMember?.id else { return }
        await viewModel.load(memberId: memberId)
    }

    private func deleteAllergy(_ allergy: AllergyDTO) async {
        guard let memberId = session.currentMember?.id else { return }
        let remaining = viewModel.allergies.filter { $0.id != allergy.id }
        _ = await viewModel.saveAllergies(memberId: memberId, items: remaining)
    }
}

/// 过敏记录表单。
struct AllergyFormView: View {
    let onSubmit: (AllergyDTO) async -> Bool

    @State private var allergen = ""
    @State private var allergenType: AllergenType = .other
    @State private var severity: Severity = .mild
    @State private var reaction = ""
    @State private var isSubmitting = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                TextField("过敏原名称（如：青霉素）", text: $allergen)
                Picker("类型", selection: $allergenType) {
                    ForEach(AllergenType.allCases, id: \.self) { type in
                        Text(type.label).tag(type)
                    }
                }
                Picker("严重程度", selection: $severity) {
                    ForEach(Severity.allCases, id: \.self) { item in
                        Text(item.label).tag(item)
                    }
                }
                TextField("过敏反应（选填）", text: $reaction)
            }
            .navigationTitle("添加过敏记录")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "保存中…" : "保存") {
                        Task {
                            isSubmitting = true
                            let ok = await onSubmit(AllergyDTO(
                                id: nil,
                                allergen: allergen,
                                allergenType: allergenType,
                                severity: severity,
                                reaction: reaction.isEmpty ? nil : reaction,
                                note: nil
                            ))
                            isSubmitting = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(isSubmitting || allergen.isEmpty)
                }
            }
        }
    }
}

/// 不适记录表单（症状标签多选）。
struct AdverseRecordFormView: View {
    let onSubmit: (AdverseRecordCreateRequest) async -> Bool

    @State private var selectedTags: Set<String> = []
    @State private var severity: Severity = .mild
    @State private var description = ""
    @State private var occurredAt = Date()
    @State private var isSubmitting = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("症状（可多选）") {
                    ForEach(SymptomTag.all) { tag in
                        Button {
                            if selectedTags.contains(tag.key) {
                                selectedTags.remove(tag.key)
                            } else {
                                selectedTags.insert(tag.key)
                            }
                        } label: {
                            HStack {
                                Text(tag.label)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedTags.contains(tag.key) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Theme.primary)
                                }
                            }
                        }
                    }
                }
                Section("详情") {
                    Picker("严重程度", selection: $severity) {
                        ForEach(Severity.allCases, id: \.self) { item in
                            Text(item.label).tag(item)
                        }
                    }
                    DatePicker("发生时间", selection: $occurredAt)
                    TextField("描述（选填）", text: $description, axis: .vertical)
                }
            }
            .navigationTitle("记录不适")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "保存中…" : "保存") {
                        Task {
                            isSubmitting = true
                            let ok = await onSubmit(AdverseRecordCreateRequest(
                                symptomTags: Array(selectedTags),
                                description: description.isEmpty ? nil : description,
                                severity: severity,
                                occurredAt: ISO8601.string(from: occurredAt),
                                planItemId: nil
                            ))
                            isSubmitting = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(isSubmitting || selectedTags.isEmpty)
                }
            }
        }
    }
}

/// 紧急联系人表单。
struct EmergencyContactFormView: View {
    let onSubmit: (EmergencyContactCreateRequest) async -> Bool

    @State private var contactName = ""
    @State private var phone = ""
    @State private var relationship = ""
    @State private var priority = 1
    @State private var note = ""
    @State private var isSubmitting = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                TextField("姓名", text: $contactName)
                TextField("电话", text: $phone)
                    .keyboardType(.phonePad)
                TextField("关系（如：长女 / 邻居 / 社区医生）", text: $relationship)
                Stepper("优先级 \(priority)（1 最高）", value: $priority, in: 1...3)
                TextField("备注（选填）", text: $note)
            }
            .navigationTitle("添加紧急联系人")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "保存中…" : "保存") {
                        Task {
                            isSubmitting = true
                            let ok = await onSubmit(EmergencyContactCreateRequest(
                                contactName: contactName,
                                phone: phone,
                                relationship: relationship,
                                priority: priority,
                                note: note.isEmpty ? nil : note
                            ))
                            isSubmitting = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(isSubmitting || contactName.isEmpty || phone.isEmpty || relationship.isEmpty)
                }
            }
        }
    }
}

/// 病历添加/修改表单（正文在服务端字段加密存储）。
struct MedicalRecordFormView: View {
    let onSubmit: (MedicalRecordCreateRequest) async -> Bool

    @State private var hospital = ""
    @State private var bloodType = ""
    @State private var heightText = ""
    @State private var weightText = ""
    @State private var content = ""
    @State private var isSubmitting = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("基本医疗指标") {
                    TextField("主诊医院/机构（选填）", text: $hospital)
                    TextField("血型（选填，如 A/B/AB/O）", text: $bloodType)
                    TextField("身高 cm（选填）", text: $heightText)
                        .keyboardType(.decimalPad)
                    TextField("体重 kg（选填）", text: $weightText)
                        .keyboardType(.decimalPad)
                }
                Section("病历与健康摘要") {
                    TextField("病历、既往病史与健康摘要", text: $content, axis: .vertical)
                        .lineLimit(6...12)
                }
            }
            .navigationTitle("病历档案")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "保存中…" : "保存") {
                        Task {
                            isSubmitting = true
                            let ok = await onSubmit(MedicalRecordCreateRequest(
                                bloodType: bloodType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : bloodType,
                                heightCm: Double(heightText),
                                weightKg: Double(weightText),
                                primaryHospital: hospital.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : hospital,
                                summary: content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : content
                            ))
                            isSubmitting = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }
}
