import SwiftUI
import UserNotifications

/// 关怀模式与提醒设置（成员维度）：
/// - 关怀模式：大字号（≥18pt）/ 高对比 / 点击区 ≥56，随当前成员全局生效；
/// - 提醒周期预设：标准 90/15、温和 120/30、严格 60/10（窗口 / 间隔分钟），计划级可另行覆盖；
/// - 锁屏显示药品详情：默认关闭——关闭时本地通知与锁屏不出现药名剂量。
struct CareSettingsView: View {
    @EnvironmentObject private var session: AuthSession
    @EnvironmentObject private var env: AppEnvironment
    @State private var draft = CareSettingsDTO.defaults
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var savedMessage: String?
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined

    var body: some View {
        Form {
            Section {
                Toggle("关怀模式（大字号）", isOn: $draft.careMode)
                Text("开启后本成员界面切换为大字体、高对比与更大的点击区域，适合长辈使用。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("提醒周期") {
                Picker("周期预设", selection: presetBinding) {
                    ForEach(CyclePreset.allCases, id: \.self) { preset in
                        Text(preset.label).tag(preset)
                    }
                }
                Stepper("提醒窗口 \(draft.cycleWindowMinutes) 分钟", value: $draft.cycleWindowMinutes, in: 30...240, step: 5)
                Stepper("重复间隔 \(draft.cycleIntervalMinutes) 分钟", value: $draft.cycleIntervalMinutes, in: 5...60, step: 5)
                Text("在窗口内未确认服药会按间隔重复提醒，超窗记为漏服。单个计划可在计划编辑中覆盖。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("隐私") {
                Toggle("锁屏显示药品详情", isOn: $draft.lockScreenShowDrugDetail)
                Text("默认关闭：本地通知只提示「有一条服药提醒」，药名与剂量需解锁进入 App 查看。开启后药名会出现在锁屏通知中。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("本地通知兜底") {
                HStack {
                    Text("通知权限")
                    Spacer()
                    Text(notificationStatusText)
                        .foregroundStyle(.secondary)
                }
                if notificationStatus != .authorized {
                    Button("开启通知权限") {
                        Task {
                            _ = await env.localNotifications.requestAuthorization()
                            notificationStatus = await env.localNotifications.authorizationStatus()
                        }
                    }
                }
                Text("本地通知按当日时间线在设备上排程，服务端推送不可达时仍可提醒；实际服药以 App 内打卡为准。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Section {
                    ErrorBanner(message: errorMessage)
                }
            }
            if let savedMessage {
                Section {
                    Text(savedMessage)
                        .foregroundStyle(Theme.primary)
                }
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? "保存中…" : "保存设置")
                        .frame(maxWidth: .infinity)
                }
                .disabled(isSaving)
            }
        }
        .navigationTitle("关怀模式与提醒")
        .task {
            if let settings = session.careSettings {
                draft = settings
            }
            notificationStatus = await env.localNotifications.authorizationStatus()
        }
        .onChange(of: session.careSettings) { newValue in
            if let newValue {
                draft = newValue
            }
        }
    }

    private var presetBinding: Binding<CyclePreset> {
        Binding(
            get: { draft.cyclePreset },
            set: { preset in
                draft.cyclePreset = preset
                draft.cycleWindowMinutes = preset.windowMinutes
                draft.cycleIntervalMinutes = preset.intervalMinutes
            }
        )
    }

    private var notificationStatusText: String {
        switch notificationStatus {
        case .authorized, .provisional, .ephemeral:
            return "已开启"
        case .denied:
            return "已关闭（请到系统设置开启）"
        default:
            return "未设置"
        }
    }

    private func save() async {
        isSaving = true
        savedMessage = nil
        defer { isSaving = false }
        do {
            _ = try await session.updateCareSettings(draft)
            errorMessage = nil
            savedMessage = "已保存"
        } catch {
            errorMessage = (error as? APIError)?.message ?? "保存失败"
        }
    }
}
