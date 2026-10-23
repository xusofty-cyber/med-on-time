import SwiftUI

/// 成员新建 / 编辑（成员上限 10 / 账号由服务端校验）。
struct MemberEditView: View {
    let member: MemberDTO?

    @State private var displayName = ""
    @State private var relationship: MemberRelationship = .otherFamily
    @State private var gender = ""
    @State private var hasBirthDate = false
    @State private var birthDate = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?
    @EnvironmentObject private var session: AuthSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("成员信息") {
                    TextField("显示名（如：爸爸）", text: $displayName)
                    Picker("与我的关系", selection: $relationship) {
                        ForEach(MemberRelationship.allCases, id: \.self) { item in
                            Text(item.label).tag(item)
                        }
                    }
                    Picker("性别", selection: $gender) {
                        Text("未填写").tag("")
                        Text("男").tag("male")
                        Text("女").tag("female")
                    }
                    Toggle("填写生日", isOn: $hasBirthDate)
                    if hasBirthDate {
                        DatePicker("生日", selection: $birthDate, in: ...Date(), displayedComponents: .date)
                    }
                }
                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }
            }
            .navigationTitle(member == nil ? "添加成员" : "编辑成员")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "保存中…" : "保存") {
                        Task { await save() }
                    }
                    .disabled(isSaving || displayName.isEmpty)
                }
            }
            .onAppear { populate() }
        }
    }

    private func populate() {
        guard let member else { return }
        displayName = member.displayName
        relationship = member.relationship
        gender = member.gender ?? ""
        if let birth = member.birthDate, let date = parseDay(birth) {
            hasBirthDate = true
            birthDate = date
        }
    }

    private func parseDay(_ string: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(string.prefix(10)))
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let service = AppEnvironment.shared.memberService
        do {
            if let member {
                let request = UpdateMemberRequest(
                    displayName: displayName,
                    relationship: relationship,
                    gender: gender.isEmpty ? nil : gender,
                    birthDate: hasBirthDate ? ISO8601.dayString(from: birthDate) : nil,
                    timezone: nil
                )
                _ = try await service.update(memberId: member.id, request)
            } else {
                let request = CreateMemberRequest(
                    displayName: displayName,
                    relationship: relationship,
                    gender: gender.isEmpty ? nil : gender,
                    birthDate: hasBirthDate ? ISO8601.dayString(from: birthDate) : nil,
                    timezone: TimeZone.current.identifier
                )
                _ = try await service.create(request)
            }
            await session.reloadMembers()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.message ?? "保存失败"
        }
    }
}
