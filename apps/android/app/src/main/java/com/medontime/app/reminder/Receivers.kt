package com.medontime.app.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.medontime.app.MedOnTimeApp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * 精确闹钟到点接收：与 ReminderWorker 同一实例同 id 展示，互相覆盖去重。
 * 接收器内只做通知展示（轻量），锁屏展示开关以 runBlocking 读 DataStore 缓存（毫秒级）。
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
        // 强提醒层与 Worker 通道同口径（双通道同实例去重靠同一通知 id + 闹钟页 singleInstance）
        DoseAlerter.presentStrong(context, payload, showDetail)
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
