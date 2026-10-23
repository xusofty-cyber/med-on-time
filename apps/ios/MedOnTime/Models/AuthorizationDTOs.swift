import Foundation

/// 照护授权（caregiver_authorization 投影；上限 5 位照护人 / 成员，服务端校验）。
/// 代操作（代打卡 / 代配置）由服务端写 authorization_log 双记录，客户端只负责发起与状态流转。
struct AuthorizationDTO: Decodable, Identifiable {
    let id: String
    let memberId: String
    let memberName: String?
    let caregiverAccountId: String
    let caregiverNickname: String?
    let caregiverPhoneMasked: String?
    let grantedByAccountId: String
    let grantorNickname: String?
    let level: CaregiverLevel
    let status: AuthorizationStatus
    let invitedAt: Date
    let acceptedAt: Date?
    let expiresAt: Date?
}

/// 发起授权：以照护人手机号定位账号。
struct CreateAuthorizationRequest: Encodable {
    let memberId: String
    let caregiverPhone: String
    let level: CaregiverLevel
    var expiresAt: String?
}
