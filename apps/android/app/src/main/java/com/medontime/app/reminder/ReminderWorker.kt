package com.medontime.app.reminder

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.medontime.app.MedOnTimeApp
import kotlinx.coroutines.flow.first

/**
 * 到点 Worker：从 inputData 载荷直接展示本地通知（完全离线可用），
 * 展示后顺带触发一次时间线同步（吸收服务端最新状态，如已在其他端打卡则下次同步会撤排）。
 */
class ReminderWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val payload = inputData.toDosePayload() ?: return Result.failure()
        val app = applicationContext as? MedOnTimeApp ?: return Result.failure()
        val showDetail = app.container.sessionStore.lockScreenShowDrugFlow.first()
        NotificationHelper.showDoseNotification(applicationContext, payload, showDetail)
        runCatching { app.container.reminderScheduler.syncTimeline() }
        return Result.success()
    }

    companion object {
        const val KEY_INSTANCE_ID = "instance_id"
        const val KEY_DRUG_NAME = "drug_name"
        const val KEY_DOSE_AMOUNT = "dose_amount"
        const val KEY_DOSE_UNIT = "dose_unit"
        const val KEY_LOCAL_TIME = "local_time"
        const val KEY_TRIGGER_AT = "trigger_at"
    }
}

/** 周期 Worker：仅做时间线同步（拉今明两日实例并重排本地提醒）。 */
class ReminderSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? MedOnTimeApp ?: return Result.failure()
        runCatching { app.container.reminderScheduler.syncTimeline() }
        return Result.success()
    }
}
