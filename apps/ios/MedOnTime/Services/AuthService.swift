import Foundation

/// auth 域：注册 / 登录 / 验证码 / 刷新（APIClient 内部）/ 退出 / 微信绑定占位 / 重置密码。
struct AuthService {
    let api: APIClient

    func sendSmsCode(phone: String, scene: SmsScene) async throws -> OkResult {
        try await api.postPublic("auth/sms/send", body: SendSmsCodeRequest(phone: phone, scene: scene))
    }

    func register(phone: String, password: String, code: String, nickname: String?) async throws -> AuthResultDTO {
        try await api.postPublic("auth/register", body: RegisterRequest(phone: phone, password: password, smsCode: code, nickname: nickname))
    }

    func login(phone: String, password: String) async throws -> AuthResultDTO {
        try await api.postPublic("auth/login", body: LoginRequest(phone: phone, password: password))
    }

    func loginByCode(phone: String, code: String) async throws -> AuthResultDTO {
        try await api.postPublic("auth/login/code", body: CodeLoginRequest(phone: phone, smsCode: code))
    }

    func resetPassword(phone: String, code: String, newPassword: String) async throws -> OkResult {
        try await api.postPublic("auth/password/reset", body: PasswordResetRequest(phone: phone, smsCode: code, newPassword: newPassword))
    }

    func logout() async throws -> OkResult {
        try await api.post("auth/logout")
    }

    func me() async throws -> AccountDTO {
        try await api.get("auth/me")
    }

    /// 占位：未接真实微信前服务端返回未开通，UI 展示其 message。
    func bindWechat() async throws -> WechatBindResultDTO {
        try await api.post("auth/bind/wechat", body: EmptyBody())
    }
}

/// 空 JSON 对象请求体（{}）。
struct EmptyBody: Encodable {}
