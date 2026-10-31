package com.medontime.app.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import com.medontime.app.MedOnTimeApp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/**
 * 精确闹钟到点接收：与 ReminderWorker 同一实例同 id 展示，互相覆盖去重。
 * 通知展示是同步轻量操作；强提醒层走 goAsync + 唤醒锁，等语音排队完成再结束
 * （否则进程可能在 TTS 初始化完成前被杀，语音永远播不出）。
 * 锁屏展示开关以 runBlocking 读 DataStore 缓存（毫秒级）。
 */
class ExactAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DOSE_DUE) return
        val payload = DosePayload(
            instanceId = intent.getStringExtra(EXTRA_INSTANCE_ID) ?: return,
            drugName = intent.getStringExtra(EXTRA_DRUG_NAME) ?: "",
            doseAmount = intent.getStringExtra(EXTRA_DOSE_AMOUNT) ?: "",
            doseUnit = intent.getStringExtra(EXTRA_DOSE_UNIT) ?: "",
            localTime = intent.getStringExtra(EXTRA_LOCAL_TIME) ?: "",
            triggerAtMillis = intent.getLongExtra(EXTRA_TRIGGER_AT, 0L),
            strongMode = intent.getStringExtra(EXTRA_STRONG_MODE) ?: "none",
        )
        val app = context.applicationContext as? MedOnTimeApp
        val showDetail = app?.let {
            runBlocking { it.container.sessionStore.lockScreenShowDrugFlow.first() }
        } ?: false
        NotificationHelper.showDoseNotification(context, payload, showDetail)
        // 强提醒层与 Worker 通道同口径（双通道同实例去重靠 DoseAlerter 的 90 秒去重）。
        // 语音播报是异步初始化 TTS：onReceive 直接返回的话，系统随时可能杀掉进程，
        // 导致语音还没排队就没了——用 goAsync + 唤醒锁把进程保到语音排队完成为止
        // （只等排队，不等播完；goAsync 窗口约 10 秒，排队通常 1 秒内完成）。
        val pending = goAsync()
        val appScope = app?.container?.appScope
        if (appScope == null) {
            pending.finish()
            return
        }
        val powerManager = context.getSystemService(PowerManager::class.java)
        val wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MedOnTime:voice-alert")
        runCatching { wakeLock?.acquire(10_000L) }
            .onFailure { Log.w("ExactAlarmReceiver", "wake lock acquire failed", it) }
        // finish() 只在 Job 完成回调里调一次：即使 appScope 已取消、launch 块体不执行，
        // 完成回调仍会跑，goAsync 不会漏 finish。
        appScope.launch {
            // 精确闹钟链式自排：先接排下一条未来实例（离线读落盘载荷），再走强提醒呈现
            runCatching { app.container.reminderScheduler.scheduleNextExactFromStore(payload.instanceId) }
            try {
                withTimeoutOrNull(9_000L) {
                    DoseAlerter.presentStrong(context, payload, showDetail)
                }
            } finally {
                runCatching { if (wakeLock?.isHeld == true) wakeLock.release() }
            }
        }.invokeOnCompletion { pending.finish() }
    }

    companion object {
        const val ACTION_DOSE_DUE = "com.medontime.app.action.DOSE_DUE"
        const val EXTRA_INSTANCE_ID = "instance_id"
        const val EXTRA_DRUG_NAME = "drug_name"
        const val EXTRA_DOSE_AMOUNT = "dose_amount"
        const val EXTRA_DOSE_UNIT = "dose_unit"
        const val EXTRA_LOCAL_TIME = "local_time"
        const val EXTRA_TRIGGER_AT = "trigger_at"
        const val EXTRA_STRONG_MODE = "strong_mode"
    }
}

/** 开机/更新/系统时间或时区变更后恢复本地提醒排程（服务端时间线为准重新拉取）。 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED &&
            action != Intent.ACTION_TIMEZONE_CHANGED &&
            action != Intent.ACTION_TIME_CHANGED
        ) {
            return
        }
        val app = context.applicationContext as? MedOnTimeApp ?: return
        // 开机后同步拉起守护服务（BOOT_COMPLETED 在系统 FGS 后台启动豁免清单内）。
        ReminderGuardService.start(context)
        val pending = goAsync()
        app.container.appScope.launch {
            try {
                runCatching { app.container.reminderScheduler.syncTimeline() }
            } finally {
                pending.finish()
            }
        }
    }
}
