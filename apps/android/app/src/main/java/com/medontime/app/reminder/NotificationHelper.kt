package com.medontime.app.reminder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.medontime.app.MainActivity
import com.medontime.app.R

/** 本地提醒载荷（WorkManager / AlarmManager 传递用，保持精简以便离线展示）。 */
data class DosePayload(
    val instanceId: String,
    val drugName: String,
    val doseAmount: String,
    val doseUnit: String,
    val localTime: String,
    val triggerAtMillis: Long,
    /** 强提醒方式（调度时已按 计划覆盖 > 成员设置 解析）：none / alarm / voice */
    val strongMode: String = "none",
) {
    val doseText: String get() = "$doseAmount$doseUnit"
    val displayTime: String get() = localTime.take(5)
}

/**
 * 本地通知展示。
 * 锁屏隐私口径（定版）：care-settings.lockScreenShowDrugDetail 默认 OFF ——
 * OFF 时通知正文不出现药名/剂量（锁屏仅显示通用文案）；ON 时显示明细且锁屏走
 * VISIBILITY_PRIVATE + 通用 publicVersion 双保险。
 * 通知 id 以 instanceId 哈希生成：WorkManager 与精确闹钟双通道同发时互相覆盖去重，
 * 与服务端 reminder_instance 幂等键口径一致（同一实例至多一条可见提醒）。
 */
object NotificationHelper {
    const val CHANNEL_ID = "dose_reminders"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.notification_channel_reminders),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.notification_channel_reminders_desc)
                enableVibration(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
            }
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    fun notificationId(instanceId: String): Int = instanceId.hashCode()

    private fun contentIntent(context: Context, instanceId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("medontime://today")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_INSTANCE_ID, instanceId)
        }
        return PendingIntent.getActivity(
            context,
            notificationId(instanceId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun genericBuilder(context: Context, instanceId: String): NotificationCompat.Builder =
        NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notification_generic_title))
            .setContentText(context.getString(R.string.notification_generic_text))
            .setContentIntent(contentIntent(context, instanceId))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

    fun showDoseNotification(context: Context, payload: DosePayload, showDrugDetail: Boolean) {
        val builder = if (showDrugDetail) {
            genericBuilder(context, payload.instanceId)
                .setContentTitle("该吃药了：${payload.drugName}")
                .setContentText("${payload.displayTime} · ${payload.doseText}")
                .setStyle(
                    NotificationCompat.BigTextStyle()
                        .bigText("${payload.displayTime} 该服用 ${payload.drugName} ${payload.doseText}，点击进入今日页打卡。"),
                )
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(genericBuilder(context, payload.instanceId).build())
        } else {
            genericBuilder(context, payload.instanceId)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        }
        NotificationManagerCompat.from(context).notify(notificationId(payload.instanceId), builder.build())
    }

    fun cancel(context: Context, instanceId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(instanceId))
    }

    const val EXTRA_INSTANCE_ID = "extra_instance_id"
}
