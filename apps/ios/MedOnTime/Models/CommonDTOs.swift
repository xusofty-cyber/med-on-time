import Foundation

/// 响应信封 {code, message, traceId, data}（API_CONTRACT 通用约定）。
struct APIEnvelope<T: Decodable>: Decodable {
    let code: Int
    let message: String
    let traceId: String
    let data: T
}

/// 分页响应 data={items, total, page, pageSize}。
struct PageResult<T: Decodable>: Decodable {
    let items: [T]
    let total: Int
    let page: Int
    let pageSize: Int
}

/// 只回 {ok: true} 的接口（退出登录、标记已读、删除等）。
struct OkResult: Decodable {
    let ok: Bool
}
