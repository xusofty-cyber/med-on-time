import UIKit
import UserNotifications

/// 仅承担通知中心委托注册与通知动作分类注册；业务逻辑都在 SwiftUI / Service 层。
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = LocalNotificationDelegate.shared
        LocalNotificationManager.registerCategories()
        return true
    }
}
