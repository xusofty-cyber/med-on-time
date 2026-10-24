# apps/android —— Android 客户端（Kotlin + Jetpack Compose）

原生强提醒用户端。技术选型与冻结口径一致：Kotlin + Jetpack Compose + Retrofit/OkHttp +
kotlinx.serialization + DataStore + WorkManager + AlarmManager，调同一套 `/api` 接口
（契约见 `docs/dev/API_CONTRACT.md`，枚举与 `packages/shared` 逐值对齐）。

> **构建与验证实况**：工程源码已在 GitHub Actions（`.github/workflows/release.yml`）跑通 Gradle assembleRelease 构建并通过编译验证；已落地 `AlarmRingActivity` 全屏响铃闹钟与 `VoiceAnnouncer` TTS 语音强提醒呈现层。真机运行时联调待安排。

## 打开与构建

1. Android Studio 打开 `apps/android/`（或命令行 `./gradlew :app:assembleDebug`，
   需本机 Android SDK 34 + JDK 17；wrapper 指向 Gradle 8.7、AGP 8.5.2、Kotlin 2.0.20）。
2. 包名 `com.medontime.app`（仓库此前无既有包名约定，按此落地）。

## 运行配置

- API 基地址：生产基地址为 `https://mot.ulife.vip/api`（本地模拟器调试可使用
  `http://10.0.2.2:3000/api`），运行时可在 App「我的 → 设置 →
  服务器地址」修改，存 DataStore，`ApiProvider` 检测变化后自动重建 Retrofit。
- 登录态：access token（2h）由 OkHttp Interceptor 注入；401 时 Authenticator 用
  refresh token（30d）换新并重放请求，刷新失败自动清会话回登录页。

## 结构

```
settings.gradle.kts / build.gradle.kts / gradle.properties
app/
  build.gradle.kts（Compose BOM 2024.09、Retrofit 2.11、WorkManager 2.9、DataStore 1.1）
  src/main/AndroidManifest.xml（通知/精确闹钟/开机权限；深链 medontime://today）
  src/main/java/com/medontime/app/
    MedOnTimeApp.kt / MainActivity.kt
    core/        ApiResult.kt（信封解包/异常）· AppContainer.kt（手动 DI）
    data/model/  Enums.kt（与 shared 逐值对齐）· Dto.kt（全域 DTO）
    data/local/  SessionStore.kt（DataStore：token/当前成员/基地址/关怀与锁屏缓存）
    data/remote/ ApiProvider.kt · Auth.kt（Bearer 注入 + 401 refresh 重放）
                 api/ 六个接口文件覆盖 auth/account/member/authorization/drug/plan/
                      reminder/checkin/adherence/stock/ehr/notification/content
    data/repository/ 五个仓库（Auth/Member/Plan/Reminder/Health）
    reminder/    NotificationHelper（锁屏隐私口径）· ReminderScheduler（WorkManager +
                 精确闹钟双通道、同实例 id 去重）· ReminderWorker / SyncWorker · Receivers
    ui/theme/    Theme.kt（医嘱绿；关怀模式大字 ≥18sp + 高对比 ≥7:1 配色）
    ui/nav/      AppNav.kt（登录图 + 四 tab + 子页；today 深链）
    ui/components/ Common.kt（按钮点击区关怀模式 ≥56dp 等）
    feature/     auth（登录/注册/找回）· today（打卡/稍后/跳过）·
                 plan（列表/编辑含药品搜索+阶段+PRN+存放位置·药品详情）·
                 adherence（汇总+月历）· me（成员/关怀/授权/消息/健康档案/库存/设置）
```

## 本地提醒兜底口径

- 数据源为服务端今明两日 `reminder_instance` 时间线，客户端不自算频次（时区/幂等在服务端）。
- 每实例一条 WorkManager 一次性任务 + 最近一条加排精确闹钟（需用户在系统设置授权
  `SCHEDULE_EXACT_ALARM`，未授权自动降级）；双通道以实例 id 为通知 id，重复触发互相覆盖。
- 锁屏是否显示药名由成员 care-settings `lockScreenShowDrugDetail` 控制，**默认关闭**：
  关闭时锁屏仅显示「有一次用药提醒」；开启时明细通知在锁屏走 PRIVATE + 通用 publicVersion。
- 通知点击深链直达今日页；打卡/跳过后撤排对应实例；开机/更新后 BootReceiver 重排。

## 选型说明与已知缺口

- **未用 Hilt / Room**：AGENTS.md 技术表登记 Hilt，本期以手动 DI（AppContainer）交付，
  依赖图简单、无代码生成，便于无 SDK 环境核查；仓库层签名与 Hilt Module 绑定兼容，后续可平滑替换。
  本地缓存仅会话级 DataStore（时间线每次从服务端拉取），未引入 Room 离线库。
- token 明文存应用私有 DataStore（MVP 取舍）；生产化前建议迁移 Keystore 加密存储。
- 自建药品：API 层已就绪（`DrugApi.createCustom`），编辑页暂未提供入口（平台库搜索优先）。
- PRN 服用记录：契约未定义客户端 PRN 打卡端点，计划页仅维护 PRN 参数，未做服用登记入口。
- 精确闹钟、通知权限均需用户在系统侧授权，设置页提供状态与跳转入口。
