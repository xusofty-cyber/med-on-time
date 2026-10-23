import Foundation

/// 统一业务异常（与后端 BusinessException + 信封 {code, message, traceId} 对齐）。
/// message 为服务端已脱敏的用户可读文案，可直接展示；禁止在日志中打印敏感原文。
struct APIError: Error, LocalizedError {
    let code: Int
    let message: String
    let traceId: String?

    var errorDescription: String? { message }

    var isUnauthorized: Bool { code == 401 }

    static func transport(_ status: Int) -> APIError {
        APIError(code: status, message: "请求失败（HTTP \(status)）", traceId: nil)
    }
}
