import Foundation

/// 统一配置读取（仓库红线：配置隔离，禁止深层硬编码）。
/// API 基地址优先取 Info.plist 的 `APIBaseURL`；DEBUG 构建缺失时回退本机后端，方便模拟器联调。
enum AppConfig {
    static var apiBaseURL: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           let url = URL(string: raw), url.scheme == "https" || url.scheme == "http" {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:3000/api")!
        #else
        return URL(string: "https://api.medontime.example.com/api")!
        #endif
    }
}
