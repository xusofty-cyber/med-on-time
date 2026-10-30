import SwiftUI

/// 设置 ViewModel：资料 / 登录设备 / 通知偏好 / 注销。
@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var nickname = ""
    @Published private(set) var sessions: [UserSessionDTO] = []
    @Published var prefs = NotificationPrefsDTO(inApp: true, sms: false, wechat: false)
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?

    private let accountService: AccountService
    private let notificationService: NotificationService

    init(
        accountService: AccountService = AppEnvironment.shared.accountService,
        notificationService: NotificationService = AppEnvironment.shared.notificationService
    ) {
        self.accountService = accountService
        self.notificationService = notificationService
    }

    func load(account: AccountDTO?) async {
        isLoading = true
        defer { isLoading = false }
        nickname = account?.nickname ?? ""
        if let list = try? await accountService.sessions() {
            sessions = list
        }
        if let loaded = try? await notificationService.getPrefs() {
            prefs = loaded
        }
    }

    func saveProfile() async {
        do {
            _ = try await accountService.updateProfile(nickname: nickname.isEmpty ? nil : nickname, timezone: nil)
            infoMessage = "资料已保存"
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "保存失败"
        }
    }

    func revokeSession(_ session: UserSessionDTO) async {
        do {
            _ = try await accountService.revokeSession(id: session.id)
            sessions.removeAll { $0.id == session.id }
        } catch {
            errorMessage = (error as? APIError)?.message ?? "退出设备失败"
        }
    }

    func savePrefs() async {
        do {
            prefs = try await notificationService.putPrefs(prefs)
            infoMessage = "通知偏好已保存"
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "保存失败"
        }
    }

    func applyCancel(reason: String?) async -> Bool {
        do {
            _ = try await accountService.cancel(reason: reason)
            return true
        } catch {
            errorMessage = (error as? APIError)?.message ?? "注销申请失败"
            return false
        }
    }
}

/// 设置页：资料 / 登录设备 / 通知渠道偏好 / 微信绑定占位 / 注销说明与申请 / 退出登录。
struct SettingsView: View {
    @StateObject private var viewModel = SettingsViewModel()
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var themeStore: ThemeStore
    @State private var showCancelConfirm = false
    @State private var cancelReason = ""
    @AppStorage(InterfaceLocale.storageKey) private var localePreference = ""
    @State private var cancelApplied = false
    @State private var wechatMessage: String?

    var body: some View {
        Form {
            profileSection
            themeSection
            languageSection
            sessionsSection
            prefsSection
            wechatSection
            cancelSection
            logoutSection
            if let error = viewModel.errorMessage {
                Section {
                    ErrorBanner(message: error)
                }
            }
            if let info = viewModel.infoMessage {
                Section {
                    Text(info)
                        .foregroundStyle(Theme.primary)
                }
            }
        }
        .navigationTitle("设置")
        .task {
            await viewModel.load(account: session.account)
        }
        .alert("申请注销账号？", isPresented: $showCancelConfirm) {
            TextField("注销原因（选填）", text: $cancelReason)
            Button("取消", role: .cancel) {}
            Button("确认申请", role: .destructive) {
                Task {
                    if await viewModel.applyCancel(reason: cancelReason.isEmpty ? nil : cancelReason) {
                        cancelApplied = true
                    }
                }
            }
        } message: {
            Text("提交后进入 30 天冷静期：冷静期内账号冻结、可登录撤销申请；期满后可识别个人信息物理删除，健康明细做不可逆匿名化归档。")
        }
    }

    private var profileSection: some View {
        Section("账号资料") {
            HStack {
                Text("昵称")
                TextField("昵称", text: $viewModel.nickname)
                    .multilineTextAlignment(.trailing)
            }
            if let phone = session.account?.phoneMasked {
                LabeledContent("手机号", value: phone)
            }
            if let account = session.account {
                LabeledContent("账号时区", value: account.timezone)
            }
            Button("保存资料") {
                Task { await viewModel.saveProfile() }
            }
        }
    }

    /// 界面主题：只列主题 0（现行绿白）与主题 A（暖阳关怀）；主题 B 仅 Admin / PC Web 可用，移动端不提供。
    private var themeSection: some View {
        Section {
            ForEach(AppTheme.allCases, id: \.self) { option in
                Button {
                    themeStore.setTheme(option)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.label)
                                .foregroundStyle(.primary)
                            Text(option.description)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if themeStore.theme == option {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Theme.primary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        } header: {
            Text("界面主题")
        } footer: {
            Text("主题 B（临床极简）仅 Admin 与 PC Web 可用，移动端不提供。切换后立即生效，保存在本机。")
        }
    }

    private var languageSection: some View {
        Section("界面语言") {
            Picker("界面语言", selection: $localePreference) {
                Text("跟随系统").tag("")
                Text("简体中文").tag("zh-Hans")
                Text("繁體中文").tag("zh-Hant")
                Text("English").tag("en")
            }
        }
    }

    private var sessionsSection: some View {
        Section("登录设备") {
            if viewModel.sessions.isEmpty {
                Text("暂无设备记录")
                    .foregroundStyle(.secondary)
            }
            ForEach(viewModel.sessions) { device in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(device.deviceName ?? device.userAgent ?? "未知设备")
                            .font(.headline)
                        Text(deviceMeta(device))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if device.current == true {
                        Text("本机")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.primary)
                    } else {
                        Button("退出") {
                            Task { await viewModel.revokeSession(device) }
                        }
                        .foregroundStyle(Theme.danger)
                    }
                }
            }
        }
    }

    private var prefsSection: some View {
        Section {
            Toggle("站内通知", isOn: $viewModel.prefs.inApp)
            Toggle("短信通知", isOn: $viewModel.prefs.sms)
            Toggle("微信通知（未开通）", isOn: $viewModel.prefs.wechat)
                .disabled(true)
            Button("保存通知偏好") {
                Task { await viewModel.savePrefs() }
            }
        } header: {
            Text("通知渠道")
        } footer: {
            Text("短信为可选开启的常规提醒渠道；微信通道尚未开通，开启状态仅作意向登记。")
        }
    }

    private var wechatSection: some View {
        Section("第三方绑定") {
            Button("绑定微信") {
                Task {
                    do {
                        let result = try await env.authService.bindWechat()
                        wechatMessage = result.message ?? (result.ok ? "已绑定" : "微信绑定尚未开通")
                    } catch {
                        wechatMessage = (error as? APIError)?.message ?? "绑定失败"
                    }
                }
            }
            if let wechatMessage {
                Text(wechatMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var cancelSection: some View {
        Section {
            if cancelApplied || session.account?.status == .cancelling {
                Text("已提交注销申请，账号处于 30 天冷静期。如需撤销，请在冷静期内联系客服或重新登录处理。")
                    .font(.footnote)
                    .foregroundStyle(Theme.danger)
            } else {
                Button("申请注销账号", role: .destructive) {
                    showCancelConfirm = true
                }
            }
        } header: {
            Text("账号注销")
        } footer: {
            Text("注销口径：申请后 30 天冷静期；期满后可识别个人信息物理删除，健康明细不可逆匿名化归档，审计记录依法保留。")
        }
    }

    private var logoutSection: some View {
        Section {
            Button("退出登录", role: .destructive) {
                Task { await session.logout() }
            }
        }
    }

    private func deviceMeta(_ device: UserSessionDTO) -> String {
        var parts: [String] = []
        if let ip = device.ipAddress {
            parts.append(ip)
        }
        if let last = device.lastActiveAt ?? device.createdAt {
            parts.append("最近活跃 \(last.formatted(date: .abbreviated, time: .shortened))")
        }
        return parts.joined(separator: " · ")
    }
}
