package com.medontime.app.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.medontime.app.core.AppContainer
import com.medontime.app.data.model.ReminderInstanceDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * 本地提醒排程（兜底通道，与服务端投递并行、按实例 id 去重展示）：
 * - 数据来源：服务端当日 + 次日时间线（reminder_instance 已按成员时区生成，客户端不自算频次）；
 * - 每个待服实例排一条 WorkManager 一次性任务（系统省电下仍会触发，延迟可接受）；
 * - 最近一条实例额外排 AlarmManager 精确闹钟（有权限时），双通道同 id 覆盖，不重复打扰；
 * - 打卡/跳过后由 UI 层调用 cancelInstance 撤排；成员切换/退出登录 cancelAll。
 */
class ReminderScheduler(
    private val context: Context,
    private val container: AppContainer,
) {
    private val workManager: WorkManager get() = WorkManager.getInstance(context)
    private val alarmManager: AlarmManager? get() = context.getSystemService(AlarmManager::class.java)

    /** 拉取今明两日时间线并重排本地提醒。失败静默（服务端投递仍在），下次同步周期重试。 */
    suspend fun syncTimeline() {
        val store = container.sessionStore
        if (store.accessToken() == null) return
        val memberId = resolveCurrentMemberId() ?: return
        val today = LocalDate.now()
        val days = listOf(today, today.plusDays(1))
        val instances = mutableListOf<ReminderInstanceDto>()
        for (day in days) {
            val result = runCatching { container.reminderRepository.byDate(memberId, day.toString()) }
            result.onSuccess { instances += it.items }
        }
        // 同步关怀设置缓存（锁屏药名展示开关供通知层读取）。
        runCatching { container.memberRepository.careSettings(memberId) }

        val now = System.currentTimeMillis()
        val payloads = instances
            .asSequence()
            .filter { it.actionable }
            .map { it.toPayload() }
            .filter { it.triggerAtMillis > now - DUE_GRACE_MS }
            .distinctBy { it.instanceId }
            .sortedBy { it.triggerAtMillis }
            .toList()

        for (payload in payloads) {
            enqueueWork(payload, now)
        }
        payloads.firstOrNull { it.triggerAtMillis > now }?.let { scheduleExactAlarm(it) }
    }

    private suspend fun resolveCurrentMemberId(): String? {
        val store = container.sessionStore
        store.currentMemberId()?.let { return it }
        val members = runCatching { container.memberRepository.listMembers() }.getOrNull() ?: return null
        val first = members.firstOrNull() ?: return null
        store.setCurrentMemberId(first.id)
        return first.id
    }

    private fun ReminderInstanceDto.toPayload(): DosePayload {
        val trigger = snoozeUntil?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?: runCatching { Instant.parse(scheduledAtUtc).toEpochMilli() }.getOrNull()
            ?: fallbackTriggerMillis()
        return DosePayload(
            instanceId = id,
            drugName = drugNameSnapshot,
            doseAmount = doseAmount,
            doseUnit = doseUnit,
            localTime = localTime,
            triggerAtMillis = trigger,
        )
    }

    /** scheduledAtUtc 解析失败时的兜底：按实例时区的 localDate + localTime 拼本地时刻。 */
    private fun ReminderInstanceDto.fallbackTriggerMillis(): Long = runCatching {
        val zone = ZoneId.of(timezone)
        val date = LocalDate.parse(localDate)
        val time = java.time.LocalTime.parse(localTime)
        date.atTime(time).atZone(zone).toInstant().toEpochMilli()
    }.getOrDefault(System.currentTimeMillis())

    private fun enqueueWork(payload: DosePayload, now: Long) {
        val delay = (payload.triggerAtMillis - now).coerceAtLeast(0)
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(payload.toWorkData())
            .addTag(TAG_DOSE)
            .build()
        workManager.enqueueUniqueWork(workName(payload.instanceId), ExistingWorkPolicy.REPLACE, request)
    }

    private fun scheduleExactAlarm(payload: DosePayload) {
        val manager = alarmManager ?: return
        val intent = alarmIntent(payload)
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
        runCatching {
            if (canExact) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, payload.triggerAtMillis, intent)
            } else {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, payload.triggerAtMillis, intent)
            }
        }
    }

    private fun alarmIntent(payload: DosePayload): PendingIntent {
        val intent = Intent(context, ExactAlarmReceiver::class.java).apply {
            action = ExactAlarmReceiver.ACTION_DOSE_DUE
            putExtra(ExactAlarmReceiver.EXTRA_INSTANCE_ID, payload.instanceId)
            putExtra(ExactAlarmReceiver.EXTRA_DRUG_NAME, payload.drugName)
            putExtra(ExactAlarmReceiver.EXTRA_DOSE_AMOUNT, payload.doseAmount)
            putExtra(ExactAlarmReceiver.EXTRA_DOSE_UNIT, payload.doseUnit)
            putExtra(ExactAlarmReceiver.EXTRA_LOCAL_TIME, payload.localTime)
            putExtra(ExactAlarmReceiver.EXTRA_TRIGGER_AT, payload.triggerAtMillis)
        }
        return PendingIntent.getBroadcast(
            context,
            NotificationHelper.notificationId(payload.instanceId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** 打卡/跳过/暂停后撤排单条实例的本地提醒。 */
    fun cancelInstance(instanceId: String) {
        workManager.cancelUniqueWork(workName(instanceId))
        val payload = DosePayload(instanceId, "", "", "", "", 0L)
        runCatching { alarmManager?.cancel(alarmIntent(payload)) }
        NotificationHelper.cancel(context, instanceId)
    }

    /** 退出登录/切换账号时清排全部本地提醒。 */
    fun cancelAll() {
        workManager.cancelAllWorkByTag(TAG_DOSE)
    }

    companion object {
        const val TAG_DOSE = "dose_reminder"
        private const val DUE_GRACE_MS = 60_000L
        private const val PERIODIC_NAME = "dose_timeline_periodic_sync"

        fun workName(instanceId: String): String = "dose_$instanceId"

        /** 周期同步（6 小时）：吸收服务端计划变更与次日时间线生成。 */
        fun enqueuePeriodicSync(context: Context) {
            val request = PeriodicWorkRequestBuilder<ReminderSyncWorker>(6, TimeUnit.HOURS)
                .addTag(TAG_DOSE)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}

/** DosePayload ↔ WorkManager Data 互转（Worker 侧离线展示通知的唯一数据源）。 */
fun DosePayload.toWorkData(): Data = Data.Builder()
    .putString(ReminderWorker.KEY_INSTANCE_ID, instanceId)
    .putString(ReminderWorker.KEY_DRUG_NAME, drugName)
    .putString(ReminderWorker.KEY_DOSE_AMOUNT, doseAmount)
    .putString(ReminderWorker.KEY_DOSE_UNIT, doseUnit)
    .putString(ReminderWorker.KEY_LOCAL_TIME, localTime)
    .putLong(ReminderWorker.KEY_TRIGGER_AT, triggerAtMillis)
    .build()

fun Data.toDosePayload(): DosePayload? {
    val instanceId = getString(ReminderWorker.KEY_INSTANCE_ID) ?: return null
    return DosePayload(
        instanceId = instanceId,
        drugName = getString(ReminderWorker.KEY_DRUG_NAME) ?: "",
        doseAmount = getString(ReminderWorker.KEY_DOSE_AMOUNT) ?: "",
        doseUnit = getString(ReminderWorker.KEY_DOSE_UNIT) ?: "",
        localTime = getString(ReminderWorker.KEY_LOCAL_TIME) ?: "",
        triggerAtMillis = getLong(ReminderWorker.KEY_TRIGGER_AT, 0L),
    )
}
