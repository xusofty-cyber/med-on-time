import Foundation

/// 账号（user_account 的用户端投影；手机号只回掩码，原文不下发）。
struct AccountDTO: Decodable {
    let id: String
    let nickname: String
    let phoneMasked: String?
    let status: AccountStatus
    let timezone: String
    let registeredAt: Date?
    let lastLoginAt: Date?
    let cancelApplyAt: Date?
}

/// 登录 / 注册 / 刷新共用的鉴权结果（access 2h + refresh 30d）。
struct AuthResultDTO: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int?
    let account: AccountDTO?
}

/// 登录设备会话（user_session 投影）。
struct UserSessionDTO: Decodable, Identifiable {
    let id: String
    let deviceName: String?
    let userAgent: String?
    let ipAddress: String?
    let createdAt: Date?
    let lastActiveAt: Date?
    let current: Bool?
}

/// 分页包装 {items, total}（契约 2026-10-23 定版；page/pageSize 缺省时服务端不返回）。
struct PagedDTO<T: Decodable>: Decodable {
    let items: [T]
    let total: Int
}

/// 微信绑定占位结果（未接真实微信前服务端返回未开通说明）。
struct WechatBindResultDTO: Decodable {
    let ok: Bool
    let message: String?
}

// MARK: - 请求体

/// 短信验证码场景：register / login / reset（与 Web 端 sendSmsCode 口径一致）。
enum SmsScene: String, Encodable {
    case register
    case login
    case reset
}

/// 邮箱验证码场景：register / login / reset（后端 CodeScene；'reset' 由后端归一为 reset_password）。
enum EmailCodeScene: String, Encodable {
    case register
    case login
    case reset
}

struct SendSmsCodeRequest: Encodable {
    let phone: String
    let scene: SmsScene
}

/// 邮箱验证码发送（POST /auth/email/send；与 Web 端 sendEmailCode 同口径）。
struct SendEmailCodeRequest: Encodable {
    let email: String
    let scene: EmailCodeScene
}

struct RegisterRequest: Encodable {
    let phone: String
    let password: String
    let smsCode: String
    let registerChannel: String
    let nickname: String?

    init(phone: String, password: String, smsCode: String, registerChannel: String = "ios", nickname: String? = nil) {
        self.phone = phone
        self.password = password
        self.smsCode = smsCode
        self.registerChannel = registerChannel
        self.nickname = nickname
    }
}

/// 邮箱注册（POST /auth/register/email；code 必验，phone 选填仅登记不验证）。
struct RegisterByEmailRequest: Encodable {
    let email: String
    let code: String
    let password: String
    let registerChannel: String
    let nickname: String?
    let phone: String?

    init(email: String, code: String, password: String, registerChannel: String = "ios", nickname: String? = nil, phone: String? = nil) {
        self.email = email
        self.code = code
        self.password = password
        self.registerChannel = registerChannel
        self.nickname = nickname
        self.phone = phone
    }
}

/// 密码登录（POST /auth/login）：account 为手机号或邮箱，后端含 @ 按邮箱查（与 Web 端同口径）。
struct LoginRequest: Encodable {
    let account: String
    let password: String
}

struct CodeLoginRequest: Encodable {
    let phone: String
    let smsCode: String

    init(phone: String, smsCode: String) {
        self.phone = phone
        self.smsCode = smsCode
    }
}

/// 邮箱验证码登录（POST /auth/login/code，{email, code}）。
struct EmailCodeLoginRequest: Encodable {
    let email: String
    let code: String
}

struct RefreshRequest: Encodable {
    let refreshToken: String
}

struct PasswordResetRequest: Encodable {
    let phone: String
    let smsCode: String
    let newPassword: String

    init(phone: String, smsCode: String, newPassword: String) {
        self.phone = phone
        self.smsCode = smsCode
        self.newPassword = newPassword
    }
}

/// 邮箱找回（POST /auth/password/reset，{email, code, newPassword}）。
struct EmailPasswordResetRequest: Encodable {
    let email: String
    let code: String
    let newPassword: String
}

struct UpdateProfileRequest: Encodable {
    var nickname: String?
    var timezone: String?
}

struct CancelAccountRequest: Encodable {
    let reason: String?
}
