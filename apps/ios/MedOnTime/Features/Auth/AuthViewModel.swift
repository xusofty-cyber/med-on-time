import Combine
import Foundation

/// 登录 / 注册 / 重置密码共用 ViewModel。
/// 验证码通道：邮箱为唯一可用通道（默认）；短信通道暂未开通——个人拿不到腾讯云短信签名/模板
/// （需企业认证），网关暂缓上线。短信入口保留但发码/提交一律拦截提示并切回邮箱 tab，不调接口。
@MainActor
final class AuthViewModel: ObservableObject {
    /// 验证码接收通道：默认邮箱。
    enum CodeChannel: String, CaseIterable {
        case phone = "手机号"
        case email = "邮箱"
    }

    @Published var phone = ""
    /// 密码登录账号：手机号或邮箱（后端含 @ 按邮箱查，与 Web 端同口径）。
    @Published var account = ""
    @Published var email = ""
    @Published var password = ""
    /// 短信验证码（通道暂未开通，字段保留待网关接通）。
    @Published var code = ""
    @Published var emailCode = ""
    /// 邮箱注册时选填手机号（仅登记不验证）。
    @Published var emailPhone = ""
    @Published var nickname = ""
    @Published var isSubmitting = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?
    @Published var codeCountdown = 0
    @Published var emailCountdown = 0
    @Published var codeChannel: CodeChannel = .email

    private let authService: AuthService
    private let session: AuthSession

    init(
        authService: AuthService = AppEnvironment.shared.authService,
        session: AuthSession = AppEnvironment.shared.session
    ) {
        self.authService = authService
        self.session = session
    }

    var phoneIsValid: Bool {
        phone.count == 11 && phone.allSatisfy(\.isNumber)
    }

    static func isEmailValid(_ value: String) -> Bool {
        value.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil
    }

    var emailIsValid: Bool {
        Self.isEmailValid(email)
    }

    /// 密码登录账号：11 位手机号或邮箱均可。
    var accountIsValid: Bool {
        (account.count == 11 && account.allSatisfy(\.isNumber)) || Self.isEmailValid(account)
    }

    static func isPasswordValid(_ pwd: String) -> Bool {
        guard pwd.count >= 8, pwd.count <= 64 else { return false }
        let hasLetter = pwd.contains(where: { $0.isLetter })
        let hasDigit = pwd.contains(where: { $0.isNumber })
        return hasLetter && hasDigit
    }

    var passwordIsValid: Bool {
        Self.isPasswordValid(password)
    }

    /// 短信通道暂未开通：不调接口，提示并切回邮箱通道。
    func smsUnavailable() {
        errorMessage = "短信通道暂未开通，请使用邮箱验证码"
        codeChannel = .email
    }

    /// 短信发码入口（保留）：直接走诚实拦截，不调后端接口。
    func sendCode(scene: SmsScene) async {
        smsUnavailable()
    }

    /// 邮箱发码：成功后提示并起 60 秒重发倒计时（与 Web 端 EmailCodeButton 同口径；后端限频 message 直接透出）。
    func sendEmailCode(scene: EmailCodeScene) async {
        guard emailIsValid else {
            errorMessage = "请输入正确的邮箱地址"
            return
        }
        guard emailCountdown <= 0 else { return }
        do {
            _ = try await authService.sendEmailCode(email: email, scene: scene)
            infoMessage = "验证码已发送，请注意查收邮件"
            errorMessage = nil
            await startCountdown(\.emailCountdown)
        } catch {
            errorMessage = (error as? APIError)?.message ?? "验证码发送失败"
        }
    }

    private func startCountdown(_ keyPath: ReferenceWritableKeyPath<AuthViewModel, Int>) async {
        self[keyPath: keyPath] = 60
        while self[keyPath: keyPath] > 0 && !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { break }
            self[keyPath: keyPath] -= 1
        }
    }

    func loginByPassword() async {
        await submit {
            let result = try await authService.login(account: account, password: password)
            await session.signIn(with: result)
        }
    }

    func loginByCode() async {
        if codeChannel == .phone {
            smsUnavailable()
            return
        }
        await submit {
            let result = try await authService.loginByEmailCode(email: email, code: emailCode)
            await session.signIn(with: result)
        }
    }

    func register() async {
        if codeChannel == .phone {
            smsUnavailable()
            return
        }
        await submit {
            let result = try await authService.registerByEmail(
                email: email,
                code: emailCode,
                password: password,
                nickname: nickname.isEmpty ? nil : nickname,
                phone: emailPhone.isEmpty ? nil : emailPhone
            )
            await session.signIn(with: result)
        }
    }

    func resetPassword(newPassword: String) async -> Bool {
        if codeChannel == .phone {
            smsUnavailable()
            return false
        }
        var succeeded = false
        await submit {
            _ = try await authService.resetPasswordByEmail(email: email, code: emailCode, newPassword: newPassword)
            succeeded = true
        }
        return succeeded
    }

    private func submit(_ operation: () async throws -> Void) async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await operation()
        } catch {
            errorMessage = (error as? APIError)?.message ?? "操作失败，请稍后重试"
        }
    }
}
