import SwiftUI

/// 照护授权 ViewModel。
@MainActor
final class AuthorizationsViewModel: ObservableObject {
    @Published private(set) var authorizations: [AuthorizationDTO] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let authorizationService: AuthorizationService

    init(authorizationService: AuthorizationService = AppEnvironment.shared.authorizationService) {
        self.authorizationService = authorizationService
    }

    /// 我发出的授权（我是成员归属方）。
    func grantedByMe(accountId: String?) -> [AuthorizationDTO] {
        authorizations.filter { $0.grantedByAccountId == accountId }
    }

    /// 授权我的（我是照护人）。
    func receivedByMe(accountId: String?) -> [AuthorizationDTO] {
        authorizations.filter { $0.caregiverAccountId == accountId }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            authorizations = try await authorizationService.list()
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "授权列表加载失败"
        }
    }

    func create(memberId: String, caregiverPhone: String, level: CaregiverLevel, expiresAt: Date?) async -> Bool {
        do {
            let request = CreateAuthorizationRequest(
                memberId: memberId,
                caregiverPhone: caregiverPhone,
                level: level,
                expiresAt: expiresAt.map { ISO8601.string(from: $0) }
            )
            _ = try await authorizationService.create(request)
            await load()
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "发起授权失败"
            return false
        }
    }

    func accept(_ authorization: AuthorizationDTO) async {
        await mutate { try await authorizationService.accept(id: authorization.id) }
    }

    func reject(_ authorization: AuthorizationDTO) async {
        await mutate { try await authorizationService.reject(id: authorization.id) }
    }

    func revoke(_ authorization: AuthorizationDTO) async {
        await mutate { try await authorizationService.revoke(id: authorization.id) }
    }

    private func mutate(_ operation: () async throws -> AuthorizationDTO) async {
        do {
            let updated = try await operation()
            if let index = authorizations.firstIndex(where: { $0.id == updated.id }) {
                authorizations[index] = updated
            }
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "操作失败"
        }
    }
}

/// 照护授权页：我授权的（可撤销）/ 授权我的（可接受、拒绝）；级别 L1 仅查看 / L2 可协助 / L3 可配置，上限 5 人 / 成员。
struct AuthorizationsView: View {
    @StateObject private var viewModel = AuthorizationsViewModel()
    @EnvironmentObject private var session: AuthSession
    @State private var showCreate = false

    var body: some View {
        List {
            if let error = viewModel.errorMessage {
                Section {
                    ErrorBanner(message: error)
                }
            }
            Section("我授权的照护人") {
                let items = viewModel.grantedByMe(accountId: session.account?.id)
                if items.isEmpty {
                    Text("暂无")
                        .foregroundStyle(.secondary)
                }
                ForEach(items) { authorization in
                    AuthorizationRowView(authorization: authorization, perspective: .granted)
                        .swipeActions(edge: .trailing) {
                            if authorization.status == .active || authorization.status == .pendingAccept {
                                Button(role: .destructive) {
                                    Task { await viewModel.revoke(authorization) }
                                } label: {
                                    Label("撤销", systemImage: "xmark.circle")
                                }
                            }
                        }
                }
            }
            Section("授权我照护的") {
                let items = viewModel.receivedByMe(accountId: session.account?.id)
                if items.isEmpty {
                    Text("暂无")
                        .foregroundStyle(.secondary)
                }
                ForEach(items) { authorization in
                    AuthorizationRowView(authorization: authorization, perspective: .received)
                        .swipeActions(edge: .trailing) {
                            if authorization.status == .pendingAccept {
                                Button {
                                    Task { await viewModel.accept(authorization) }
                                } label: {
                                    Label("接受", systemImage: "checkmark.circle")
                                }
                                .tint(Theme.primary)
                                Button(role: .destructive) {
                                    Task { await viewModel.reject(authorization) }
                                } label: {
                                    Label("拒绝", systemImage: "xmark.circle")
                                }
                            }
                        }
                }
            }
        }
        .navigationTitle("照护授权")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreate) {
            CreateAuthorizationView { memberId, phone, level, expiresAt in
                await viewModel.create(memberId: memberId, caregiverPhone: phone, level: level, expiresAt: expiresAt)
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}

struct AuthorizationRowView: View {
    enum Perspective {
        case granted
        case received
    }

    let authorization: AuthorizationDTO
    let perspective: Perspective

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
                Text(authorization.status.label)
                    .font(.caption.bold())
                    .foregroundStyle(authorization.status == .active ? Theme.primary : .secondary)
            }
            Text("\(authorization.level.label)\(memberSuffix)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let expiresAt = authorization.expiresAt {
                Text("有效期至 \(expiresAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private var title: String {
        switch perspective {
        case .granted:
            return authorization.caregiverNickname ?? authorization.caregiverPhoneMasked ?? "照护人"
        case .received:
            return authorization.memberName ?? "成员"
        }
    }

    private var memberSuffix: String {
        switch perspective {
        case .granted:
            return authorization.memberName.map { " · 成员：\($0)" } ?? ""
        case .received:
            return authorization.grantorNickname.map { " · 授权人：\($0)" } ?? ""
        }
    }
}

/// 发起授权表单：选成员 + 照护人手机号 + 级别 + 可选到期时间。
struct CreateAuthorizationView: View {
    /// 返回是否创建成功。
    let onSubmit: (String, String, CaregiverLevel, Date?) async -> Bool

    @EnvironmentObject private var session: AuthSession
    @Environment(\.dismiss) private var dismiss
    @State private var memberId: String = ""
    @State private var caregiverPhone = ""
    @State private var level: CaregiverLevel = .l2
    @State private var hasExpiry = false
    @State private var expiresAt = Date()
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("成员") {
                    Picker("为哪位成员授权", selection: $memberId) {
                        ForEach(session.members.filter(\.isOwn)) { member in
                            Text(member.displayName).tag(member.id)
                        }
                    }
                }
                Section("照护人") {
                    TextField("照护人手机号（对方需已注册）", text: $caregiverPhone)
                        .keyboardType(.phonePad)
                    Picker("授权级别", selection: $level) {
                        ForEach(CaregiverLevel.allCases, id: \.self) { item in
                            Text(item.label).tag(item)
                        }
                    }
                    Toggle("设置到期时间", isOn: $hasExpiry)
                    if hasExpiry {
                        DatePicker("到期时间", selection: $expiresAt, in: Date()..., displayedComponents: .date)
                    }
                }
                Section {
                    Text("每位成员最多 5 位照护人。照护人的代打卡、代配置都会双记录，可在计划变更历史中查看。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("发起授权")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "提交中…" : "发起") {
                        Task {
                            isSubmitting = true
                            let ok = await onSubmit(memberId, caregiverPhone, level, hasExpiry ? expiresAt : nil)
                            isSubmitting = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(isSubmitting || memberId.isEmpty || caregiverPhone.count != 11)
                }
            }
            .onAppear {
                if memberId.isEmpty {
                    memberId = session.members.first(where: \.isOwn)?.id ?? ""
                }
            }
        }
    }
}
