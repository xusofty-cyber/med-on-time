package com.medontime.app.core

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.repository.AuthRepository
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.data.repository.PlanRepository
import com.medontime.app.data.repository.ReminderRepository
import com.medontime.app.reminder.ReminderScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * 手动依赖容器（单例，随 Application 生命周期）。
 * 选型说明：AGENTS.md 技术表登记 Hilt，但本期以手动 DI 交付——依赖图简单、无代码生成，
 * 在无 Android SDK 的交付环境下可逐行核查；引入 Hilt 时只需把本容器改为 Module 绑定，仓库层签名不变。
 */
class AppContainer(context: Context) {
    val sessionStore: SessionStore = SessionStore(context.applicationContext)
    val apiProvider: ApiProvider = ApiProvider(sessionStore)

    val authRepository: AuthRepository = AuthRepository(apiProvider, sessionStore)
    val memberRepository: MemberRepository = MemberRepository(apiProvider, sessionStore)
    val planRepository: PlanRepository = PlanRepository(apiProvider)
    val reminderRepository: ReminderRepository = ReminderRepository(apiProvider)
    val healthRepository: HealthRepository = HealthRepository(apiProvider)

    val reminderScheduler: ReminderScheduler = ReminderScheduler(context.applicationContext, this)

    /** 应用级协程域（本地提醒同步等长生命周期任务）。 */
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
}

val LocalAppContainer = staticCompositionLocalOf<AppContainer> {
    error("AppContainer 未提供（应在 MainActivity 中注入）")
}
