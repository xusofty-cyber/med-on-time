import Combine
import Foundation

/// 登录会话与当前成员状态（全 App 唯一数据源）。
/// token 本体只存 Keychain；这里只持有账号 / 成员 / 关怀设置的内存投影。
@MainActor
final class AuthSession: ObservableObject {
    enum State {
        case loading
        case signedOut
        case signedIn
    }

    @Published private(set) var state: State = .loading
    @Published private(set) var account: AccountDTO?
    @Published private(set) var members: [MemberDTO] = []
    @Published private(set) var currentMember: MemberDTO?
    @Published private(set) var careSettings: CareSettingsDTO?

    private let api: APIClient
    private let tokenStore: KeychainStore
    private let memberIdDefaultsKey = "mot.currentMemberId"

    private var authService: AuthService { AuthService(api: api) }
    private var memberService: MemberService { MemberService(api: api) }

    init(api: APIClient, tokenStore: KeychainStore) {
        self.api = api
        self.tokenStore = tokenStore
    }

    var isSignedIn: Bool { state == .signedIn }

    /// 冷启动：有 token 则拉 /auth/me 恢复会话；失败回登录态。
    func bootstrap() async {
        guard tokenStore.read(.accessToken) != nil else {
            state = .signedOut
            return
        }
        do {
            account = try await authService.me()
            state = .signedIn
            await reloadMembers()
        } catch {
            state = .signedOut
        }
    }

    func signIn(with result: AuthResultDTO) async {
        tokenStore.save(result.accessToken, for: .accessToken)
        tokenStore.save(result.refreshToken, for: .refreshToken)
        account = result.account
        state = .signedIn
        await reloadMembers()
        if account == nil {
            account = try? await authService.me()
        }
    }

    func logout() async {
        _ = try? await authService.logout()
        clearLocalSession()
    }

    /// APIClient 刷新失败回调：清本地会话回登录页。
    func handleSessionExpired() {
        clearLocalSession()
    }

    private func clearLocalSession() {
        tokenStore.clearAll()
        account = nil
        members = []
        currentMember = nil
        careSettings = nil
        state = .signedOut
        AppEnvironment.shared.localNotifications.cancelAllReminderNotifications()
    }

    // MARK: - 成员

    func reloadMembers() async {
        guard let list = try? await memberService.list() else { return }
        members = list
        let savedId = UserDefaults.standard.string(forKey: memberIdDefaultsKey)
        let target = list.first(where: { $0.id == savedId }) ?? list.first
        await selectMember(target, persist: false)
    }

    func selectMember(_ member: MemberDTO?, persist: Bool = true) async {
        currentMember = member
        if persist, let member {
            UserDefaults.standard.set(member.id, forKey: memberIdDefaultsKey)
        }
        guard let member else {
            careSettings = nil
            return
        }
        let settings = try? await memberService.getCareSettings(memberId: member.id)
        if currentMember?.id == member.id {
            careSettings = settings
        }
    }

    func refreshCareSettings() async {
        guard let member = currentMember else { return }
        careSettings = try? await memberService.getCareSettings(memberId: member.id)
    }

    @discardableResult
    func updateCareSettings(_ settings: CareSettingsDTO) async throws -> CareSettingsDTO {
        guard let member = currentMember else {
            throw APIError(code: -1, message: "请先选择成员", traceId: nil)
        }
        let saved = try await memberService.putCareSettings(memberId: member.id, settings)
        careSettings = saved
        return saved
    }
}
