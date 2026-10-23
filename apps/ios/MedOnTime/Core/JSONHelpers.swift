import Foundation

/// ISO 8601 时间工具：后端时间统一 ISO 8601 UTC（带毫秒的小数秒与不带小数秒两种形态都出现）。
enum ISO8601 {
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func string(from date: Date) -> String {
        withFractionalSeconds.string(from: date)
    }

    static func date(from string: String) -> Date? {
        withFractionalSeconds.date(from: string) ?? standard.date(from: string)
    }

    /// yyyy-MM-dd（成员本地墙钟日期口径，如 startDate / birthDate / localDate）。
    static func dayString(from date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// yyyy-MM（依从月历查询口径）。
    static func monthString(from date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: date)
    }

    /// "HH:mm"（frequency_rule.times 口径）。
    static func timeString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// 把 "HH:mm" 还原成今天该时刻的 Date（仅供时间选择器回显）。
    static func date(fromTimeString string: String) -> Date {
        let parts = string.split(separator: ":").compactMap { Int($0) }
        var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        components.hour = parts.count > 0 ? parts[0] : 8
        components.minute = parts.count > 1 ? parts[1] : 0
        return Calendar.current.date(from: components) ?? Date()
    }
}

/// 全端统一的 JSON 编解码器工厂。
enum JSONCoding {
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { rawDecoder in
            let container = try rawDecoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = ISO8601.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "无法解析的时间格式: \(raw)")
        }
        return decoder
    }

    static func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, rawEncoder in
            var container = rawEncoder.singleValueContainer()
            try container.encode(ISO8601.string(from: date))
        }
        return encoder
    }
}

extension KeyedDecodingContainer {
    /// Prisma Decimal 在 JSON 中可能是 number，也可能是 string，两种都接受（与 Web 端 types 的 number | string 口径一致）。
    func decodeFlexibleDouble(forKey key: Key) throws -> Double {
        if let value = try? decode(Double.self, forKey: key) {
            return value
        }
        if let raw = try? decode(String.self, forKey: key), let value = Double(raw) {
            return value
        }
        throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "期望 number 或 numeric string")
    }

    func decodeFlexibleDoubleIfPresent(forKey key: Key) throws -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key), let unwrapped = value {
            return unwrapped
        }
        if let raw = try? decodeIfPresent(String.self, forKey: key), let string = raw {
            return Double(string)
        }
        return nil
    }
}

/// 剂量展示：整数不带小数尾巴（2 片 / 0.5 片）。
enum DoseFormatter {
    static func string(amount: Double, unit: String) -> String {
        let number: String
        if amount.truncatingRemainder(dividingBy: 1) == 0 {
            number = String(Int(amount))
        } else {
            number = String(amount)
        }
        return number + unit
    }
}
