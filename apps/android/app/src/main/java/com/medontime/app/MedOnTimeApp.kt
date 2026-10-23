package com.medontime.app

import android.app.Application
import com.medontime.app.core.AppContainer
import com.medontime.app.reminder.NotificationHelper
import com.medontime.app.reminder.ReminderScheduler
import kotlinx.coroutines.launch

class MedOnTimeApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        NotificationHelper.createChannels(this)
        // 冷启动：已登录则后台同步当日时间线并重排本地提醒兜底（不阻塞 UI）。
        container.appScope.launch {
            val loggedIn = container.sessionStore.accessToken() != null
            if (loggedIn) {
                runCatching { container.reminderScheduler.syncTimeline() }
            }
            // 周期同步（每 6 小时拉取时间线，覆盖服务端计划变更）。
            ReminderScheduler.enqueuePeriodicSync(this@MedOnTimeApp)
        }
    }
}
