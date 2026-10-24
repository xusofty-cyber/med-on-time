import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case put = "PUT"
    case delete = "DELETE"
}

/// 刷新单飞协调器：多个并发请求同时 401 时，只发一次 /auth/refresh（与 Web 端 refreshInFlight 口径一致）。
actor RefreshCoordinator {
    private var inFlight: Task<Bool, Never>?

    func refresh(using operation: @Sendable @escaping () async -> Bool) async -> Bool {
        if let task = inFlight {
            return await task.value
        }
        let task = Task { await operation() }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }
}

/// 统一请求封装：信封 {code, message, traceId, data} 解包、Bearer 注入、
/// 401 时用 refresh token 单飞刷新并重放一次，刷新失败则清 token 并回调会话过期。
final class APIClient {
    let baseURL: URL

    private let urlSession: URLSession
    private let tokenStore: KeychainStore
    private let refreshCoordinator = RefreshCoordinator()
    private let decoder = JSONCoding.makeDecoder()
    private let encoder = JSONCoding.makeEncoder()

    /// 会话彻底失效（刷新失败）时的回调，由 AppEnvironment 接到 AuthSession。
    var onSessionExpired: (@Sendable () -> Void)?

    init(baseURL: URL, tokenStore: KeychainStore, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenStore = tokenStore
        self.urlSession = urlSession
    }

    // MARK: - 类型化便捷方法（path 相对 baseURL，不带前导斜杠）

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await perform(method: .get, path: path, query: query, body: nil, authenticated: true, retryOn401: true)
    }

    func post<T: Decodable>(_ path: String) async throws -> T {
        try await perform(method: .post, path: path, query: [], body: nil, authenticated: true, retryOn401: true)
    }

    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await perform(method: .post, path: path, query: [], body: encoder.encode(body), authenticated: true, retryOn401: true)
    }

    /// 未登录接口（注册 / 登录 / 验证码 / 重置密码）：不注入 Bearer、不走刷新重放。
    func postPublic<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await perform(method: .post, path: path, query: [], body: encoder.encode(body), authenticated: false, retryOn401: false)
    }

    func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await perform(method: .patch, path: path, query: [], body: encoder.encode(body), authenticated: true, retryOn401: true)
    }

    func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await perform(method: .put, path: path, query: [], body: encoder.encode(body), authenticated: true, retryOn401: true)
    }

    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await perform(method: .delete, path: path, query: [], body: nil, authenticated: true, retryOn401: true)
    }

    // MARK: - 核心执行

    private struct EnvelopeHeader: Decodable {
        let code: Int
        let message: String
        let traceId: String
    }

    private func perform<T: Decodable>(
        method: HTTPMethod,
        path: String,
        query: [URLQueryItem],
        body: Data?,
        authenticated: Bool,
        retryOn401: Bool
    ) async throws -> T {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError(code: -1, message: "无效的请求地址", traceId: nil)
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else {
            throw APIError(code: -1, message: "无效的请求地址", traceId: nil)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token = tokenStore.read(.accessToken) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await urlSession.data(for: request)
        let httpStatus = (response as? HTTPURLResponse)?.statusCode ?? 0

        // 先只解信封头：401 时 data 形状可能与 T 不符，不能直接按 T 解。
        guard let header = try? decoder.decode(EnvelopeHeader.self, from: data) else {
            if httpStatus == 401, authenticated, retryOn401 {
                return try await refreshAndReplay(method: method, path: path, query: query, body: body)
            }
            throw APIError.transport(httpStatus)
        }

        if (httpStatus == 401 || header.code == 401 || header.code == 40100), authenticated, retryOn401 {
            return try await refreshAndReplay(method: method, path: path, query: query, body: body)
        }
        guard header.code == 0 || header.code == 200 else {
            throw APIError(code: header.code, message: header.message.isEmpty ? "请求失败" : header.message, traceId: header.traceId)
        }
        do {
            return try decoder.decode(APIEnvelope<T>.self, from: data).data
        } catch {
            throw APIError(code: -2, message: "响应解析失败", traceId: header.traceId)
        }
    }

    private func refreshAndReplay<T: Decodable>(
        method: HTTPMethod,
        path: String,
        query: [URLQueryItem],
        body: Data?
    ) async throws -> T {
        let refreshed = await refreshCoordinator.refresh { [weak self] in
            guard let self else { return false }
            return await self.performRefresh()
        }
        guard refreshed else {
            tokenStore.clearAll()
            onSessionExpired?()
            throw APIError(code: 401, message: "登录已过期，请重新登录", traceId: nil)
        }
        return try await perform(method: method, path: path, query: query, body: body, authenticated: true, retryOn401: false)
    }

    /// POST /auth/refresh（refresh 存 user_session 可吊销；轮换后新旧 token 一并落 Keychain）。
    private func performRefresh() async -> Bool {
        guard let refreshToken = tokenStore.read(.refreshToken) else { return false }
        let url = baseURL.appendingPathComponent("auth/refresh")
        var request = URLRequest(url: url)
        request.httpMethod = HTTPMethod.post.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? encoder.encode(RefreshRequest(refreshToken: refreshToken))
        guard let (data, _) = try? await urlSession.data(for: request),
              let envelope = try? decoder.decode(APIEnvelope<AuthResultDTO>.self, from: data),
              envelope.code == 0 || envelope.code == 200 else {
            return false
        }
        tokenStore.save(envelope.data.accessToken, for: .accessToken)
        tokenStore.save(envelope.data.refreshToken, for: .refreshToken)
        return true
    }
}
