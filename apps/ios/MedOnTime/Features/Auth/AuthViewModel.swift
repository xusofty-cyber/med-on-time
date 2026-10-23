import Combine
import Foundation

/// 登录 / 注册 / 重置密码共用 ViewModel。
/// 验证码通道：服务端经 notification 短信接口抽象下发（dev 环境为 stub），客户端流程与生产一致。
@MainActor
final class AuthViewModel: ObservableObject {
    @Published var phone = ""
    @Published var password = ""
    @Published var code = ""
    @Published var nickname = ""
    @Published var isSubmitting = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?
    @Published var codeCountdown = 0

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

    func sendCode(scene: SmsScene) async {
        guard phoneIsValid else {
            errorMessage = "请输入 11 位手机号"
            return
        }
        do {
            _ = try await authService.sendSmsCode(phone: phone, scene: scene)
            infoMessage = "验证码已发送"
            errorMessage = nil
            await startCountdown()
        } catch {
            errorMessage = (error as? APIError)?.message ?? "验证码发送失败"
        }
    }

    private func startCountdown() async {
        codeCountdown = 60
        while codeCountdown > 0 {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            codeCountdown -= 1
        }
    }

    func loginByPassword() async {
        await submit {
            let result = try await authService.login(phone: phone, password: password)
            await session.signIn(with: result)
        }
    }

    func loginByCode() async {
        await submit {
            let result = try await authService.loginByCode(phone: phone, code: code)
            await session.signIn(with: result)
        }
    }

    func register() async {
        await submit {
            let result = try await authService.register(
                phone: phone,
                password: password,
                code: code,
                nickname: nickname.isEmpty ? nil : nickname
            )
            await session.signIn(with: result)
        }
    }

    func resetPassword(newPassword: String) async -> Bool {
        var succeeded = false
        await submit {
            _ = try await authService.resetPassword(phone: phone, code: code, newPassword: newPassword)
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
