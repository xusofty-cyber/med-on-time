import Foundation

/// 界面语言解析（I18N.md 定版·iOS）：偏好存 UserDefaults `mot.locale`（"" = 跟随系统，
/// 或 zh-Hans / zh-Hant / en）。SwiftUI 字面量经 RootView 注入 `environment(\.locale)` 切换；
/// 非 View 层（枚举 label、ViewModel 文案）经 `L()` 从对应 .lproj 取词，保持同一口径。
enum InterfaceLocale {
    static let storageKey = "mot.locale"

    /// 当前生效语言：已保存偏好优先，否则按系统首选语言归类到三语之一。
    static var current: String {
        let saved = UserDefaults.standard.string(forKey: storageKey) ?? ""
        if !saved.isEmpty { return saved }
        let preferred = Locale.preferredLanguages.first ?? "zh-Hans"
        if preferred.hasPrefix("zh-Hant") || preferred.hasPrefix("zh-TW") || preferred.hasPrefix("zh-HK") {
            return "zh-Hant"
        }
        if preferred.hasPrefix("en") { return "en" }
        return "zh-Hans"
    }

    static var bundle: Bundle {
        if let path = Bundle.main.path(forResource: current, ofType: "lproj"),
           let bundle = Bundle(path: path) {
            return bundle
        }
        return .main
    }
}

/// 按当前界面语言取词条（键为简中文案，与 Localizable.strings 对齐；缺词回退键本身）。
func L(_ key: String) -> String {
    InterfaceLocale.bundle.localizedString(forKey: key, value: key, table: nil)
}
