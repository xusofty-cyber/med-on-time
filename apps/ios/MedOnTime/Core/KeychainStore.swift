import Foundation
import Security

/// Token 的 Keychain 封装：access / refresh token 只存 Keychain，禁止落 UserDefaults / 明文文件。
final class KeychainStore {
    enum Key: String, CaseIterable {
        case accessToken
        case refreshToken
    }

    private let service = "com.medontime.app.tokens"

    func save(_ value: String, for key: Key) {
        guard let data = value.data(using: .utf8) else { return }
        SecItemDelete(baseQuery(for: key) as CFDictionary)
        var attributes = baseQuery(for: key)
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
    }

    func read(_ key: Key) -> String? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    func delete(_ key: Key) {
        SecItemDelete(baseQuery(for: key) as CFDictionary)
    }

    func clearAll() {
        Key.allCases.forEach { delete($0) }
    }

    private func baseQuery(for key: Key) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
    }
}
