import Foundation

/// auth 域：注册 / 登录 / 验证码 / 刷新（APIClient 内部）/ 退出 / 微信绑定占位 / 重置密码。
struct AuthService {
    let api: APIClient

    func sendSmsCode(phone: String, scene: SmsScene) async throws -> OkResult {
        try await api.postPublic("auth/sms/send", body: SendSmsCodeRequest(phone: phone, scene: scene))
    }

    /// 邮箱验证码发送（60 秒重发间隔、1 小时 5 次由后端限频，message 直接透出）。
    func sendEmailCode(email: String, scene: EmailCodeScene) async throws -> OkResult {
        try await api.postPublic("auth/email/send", body: SendEmailCodeRequest(email: email, scene: scene))
    }

    func register(phone: String, password: String, code: String, nickname: String?) async throws -> AuthResultDTO {
        try await api.postPublic("auth/register", body: RegisterRequest(phone: phone, password: password, smsCode: code, nickname: nickname))
    }

    /// 邮箱注册（必验码；phone 选填仅登记不验证）。
    func registerByEmail(email: String, code: String, password: String, nickname: String?, phone: String?) async throws -> AuthResultDTO {
        try await api.postPublic("auth/register/email", body: RegisterByEmailRequest(email: email, code: code, password: password, nickname: nickname, phone: phone))
    }

    /// 密码登录：account 为手机号或邮箱（后端含 @ 按邮箱查）。
    func login(account: String, password: String) async throws -> AuthResultDTO {
        try await api.postPublic("auth/login", body: LoginRequest(account: account, password: password))
    }

    func loginByCode(phone: String, code: String) async throws -> AuthResultDTO {
        try await api.postPublic("auth/login/code", body: CodeLoginRequest(phone: phone, smsCode: code))
    }

    /// 邮箱验证码登录。
    func loginByEmailCode(email: String, code: String) async throws -> AuthResultDTO {
        try await api.postPublic("auth/login/code", body: EmailCodeLoginRequest(email: email, code: code))
    }

    func resetPassword(phone: String, code: String, newPassword: String) async throws -> OkResult {
        try await api.postPublic("auth/password/reset", body: PasswordResetRequest(phone: phone, smsCode: code, newPassword: newPassword))
    }

    /// 邮箱找回密码。
    func resetPasswordByEmail(email: String, code: String, newPassword: String) async throws -> OkResult {
        try await api.postPublic("auth/password/reset", body: EmailPasswordResetRequest(email: email, code: code, newPassword: newPassword))
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
