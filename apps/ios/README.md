# apps/ios —— MedOnTime iOS 客户端（Swift + SwiftUI）

冻结选型：Swift + SwiftUI（技术架构 V1.5），URLSession 调同一套后端 `/api`，本地通知兜底。
接口逐条对应 `docs/dev/API_CONTRACT.md`「用户端接口」；枚举与 `packages/shared/src/enums.ts` 同名同值
（`Models/SharedEnums.swift`）；DTO 字段与 Prisma camelCase 对齐（参照 Web 端 `apps/web/src/lib/types.ts` 同形）。

## 打开工程（需要 macOS + Xcode 15+）

本仓库以 **XcodeGen 的 `project.yml`** 提供工程定义（未手写 project.pbxproj，避免引用漂移）：

```bash
brew install xcodegen        # 一次性
cd apps/ios
xcodegen generate            # 生成 MedOnTime.xcodeproj（生成物勿提交）
open MedOnTime.xcodeproj
```

部署目标 iOS 16.0，Swift 5，Bundle ID `com.medontime.app`（占位，上线前替换为正式 ID 并配置签名团队）。

## 目录结构

```
project.yml                  XcodeGen 工程定义
MedOnTime/
  App/                       @main 入口、AppDelegate（通知委托注册）、依赖容器 AppEnvironment、根视图/四 Tab
  Core/                      AppConfig（API 基地址）、APIClient（信封解包/Bearer/401 单飞刷新重放）、
                             APIError、JSONHelpers（ISO8601/Decimal 兼容）、KeychainStore（token）、
                             AuthSession（会话+当前成员+关怀设置）、DeepLinkRouter（通知点击直达）
  Models/                    SharedEnums（与 packages/shared 对齐）+ 各域 Codable DTO
  Services/                  auth/account/member/authorization/drug/plan/reminder/checkin/
                             adherence/stock/ehr/notification 共 11 个域端点（路径与契约逐条对应）
  Notifications/             LocalNotificationManager：按服务端当日时间线排程本地通知兜底
  DesignSystem/              Theme（医嘱绿 #0B6B4F、关怀模式环境值、56pt 点击区、空态/错误横幅组件）
  Features/
    Auth/                    登录（密码/验证码）/ 注册 / 重置密码
    Today/                   今日提醒：打卡（clientRequestId 幂等）/ 稍后（cycle 顺延）/ 跳过
    Plans/                   计划列表（暂停/恢复/删除/变更史）、计划编辑（药品搜索、自建药品、
                             疗程阶段、PRN、周期覆盖、存放位置/附加备注）
    Adherence/               依从汇总（周/月）+ 月历热力
    Profile/                 我的：成员切换/管理、关怀设置、照护授权、消息通知、库存、健康档案、设置/注销
```

## Info.plist 与权限口径

- `MedOnTime/Resources/Info.plist` 为手写全量 plist（project.yml 中 `GENERATE_INFOPLIST_FILE=NO`）。
  自定义键 `APIBaseURL`：生产 API 基地址为 `https://mot.ulife.vip/api`；
  DEBUG 构建取不到合法值时代码回退 `http://localhost:3000/api` 便于模拟器联调。
- **通知权限**：本地/远程通知授权走运行时 `UNUserNotificationCenter.requestAuthorization`，
  iOS 不需要 Info.plist 用途说明字符串；授权状态在「关怀模式与提醒设置」页可见并可引导开启。
- **后台模式**：本地通知排程不依赖后台模式，未声明 `UIBackgroundModes`；
  APNs 远程推送的后台刷新如后续需要再单独评估开启。
- **Entitlements**：`MedOnTime.entitlements` 仅 `aps-environment=development`（APNs 通道 app_push 用），
  上线改 production 并确认描述文件含 Push 能力。

## 关键口径

- **鉴权**：access 2h + refresh 30d；401 时单飞刷新并重放一次，刷新失败清 Keychain 并回登录页（与 Web 端同口径）。
  token 只存 Keychain（`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`），不落 UserDefaults/文件。
- **锁屏隐私**：本地通知正文是否含药名/剂量受成员关怀设置 `lockScreenShowDrugDetail` 控制，**默认不含**。
  通知动作（已服用/稍后）一律先进 App 走统一 API 与幂等，不在通知扩展里直接写数据。
- **关怀模式**：成员维度设置，全局大字号（dynamicTypeSize .accessibility1）+ 点击区 ≥56pt，随成员切换生效。
- **时间**：展示优先用 reminder_instance 的成员本地墙钟快照（localDate/localTime/timezone），
  排程触发用 scheduledAtUtc + 成员时区组装 Calendar 触发器，避免设备时区变化错位。
- **病历正文**：只经手传输，不落本地缓存（服务端字段加密存储）。

## 验证与构建实况

**构建与编译验证实况**：工程配置与源码已在 GitHub Actions（`.github/workflows/release.yml`）跑通 Release 构建与类型核验（XcodeGen 规范自洽）；本地强提醒结合 UNNotificationSound 与前台语音播报实现。macOS 物理设备运行时端到端联调待后续排期。
