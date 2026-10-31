package com.medontime.app.reminder

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.medontime.app.MedOnTimeApp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONArray

/**
 * 提醒守护前台服务（2026-10-31 真机反馈修复）：
 * 背景——纯 AlarmManager/WorkManager 链路在国产 ROM 上 App 被划掉/回收后会被厂商
 * 省电冻结（闹钟不响、接收器不唤醒），真机实测「进程不在时收不到任何通知」。
 * 前台服务是安卓官方为此类「用户可感知的持续任务」提供的保活手段：进程常驻后
 * 精确闹钟、WorkManager、TTS 语音都回到可靠状态；常驻通知同时也是用户可见的
 * 「守护中」凭证，可随时点开进今日页。
 *
 * 口径：
 * - 仅登录后运行；未登录/已登出立即自停（onStartCommand 内复核 token）。
 * - 常驻通知走独立低重要性通道（无声、不震动），正文只报下一剂时间；
 *   药名仅在用户开启「锁屏显示服药明细」时出现（与到点通知同一隐私口径）。
 * - startForeground 必须在 onStartCommand 同步完成（系统 5 秒红线），
 *   token 复核与时间线同步一律异步进行；先挂通知再复核，未登录则 stopSelf。
 */
class ReminderGuardService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.createChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 先同步挂上常驻通知（startForegroundService 的 5 秒红线），内容取落盘载荷（离线可用）。
        startForegroundCompat(buildGuardNotification())
        running = true
        val app = applicationContext as? MedOnTimeApp
        if (app == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        app.container.appScope.launch {
            val token = runCatching { app.container.sessionStore.accessToken() }.getOrNull()
            if (token == null) {
                stopSelf()
                return@launch
            }
            // 每次（重）启动顺带同步一次时间线：服务被系统重启/被杀拉回时自愈排程。
            runCatching { app.container.reminderScheduler.syncTimeline() }
            refreshNotification()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(GUARD_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(GUARD_NOTIFICATION_ID, notification)
        }
    }

    /** 依据落盘载荷重建常驻通知（下一剂时间/药名口径与隐私开关一致）。 */
    private fun buildGuardNotification(): Notification {
        val app = applicationContext as? MedOnTimeApp
        var nextText: String? = null
        if (app != null) {
            val (payloadsJson, showDetail) = runBlocking {
                val json = runCatching { app.container.sessionStore.scheduledPayloads() }.getOrNull()
                val detail = runCatching { app.container.sessionStore.lockScreenShowDrugFlow.first() }
                    .getOrDefault(false)
                json to detail
            }
            nextText = nextDoseText(payloadsJson, showDetail)
        }
        return NotificationHelper.buildGuardNotification(this, nextText)
    }

    private fun nextDoseText(payloadsJson: String?, showDetail: Boolean): String? {
        if (payloadsJson.isNullOrBlank()) return null
        return runCatching {
            val arr = JSONArray(payloadsJson)
            val now = System.currentTimeMillis()
            var best: org.json.JSONObject? = null
            var bestAt = Long.MAX_VALUE
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val at = o.optLong("at", 0L)
                if (at > now && at < bestAt) {
                    bestAt = at
                    best = o
                }
            }
            val next = best ?: return null
            val time = next.optString("time").take(5)
            if (showDetail) {
                val drug = next.optString("drug")
                if (drug.isNotBlank()) "下一剂 $time · $drug" else "下一剂 $time"
            } else {
                "下一剂 $time"
            }
        }.getOrNull()
    }

    private fun refreshNotification() {
        val manager = getSystemService(android.app.NotificationManager::class.java)
        runCatching { manager?.notify(GUARD_NOTIFICATION_ID, buildGuardNotification()) }
            .onFailure { Log.w(TAG, "guard notification refresh failed", it) }
    }

    companion object {
        private const val TAG = "ReminderGuardService"
        const val GUARD_NOTIFICATION_ID = 991001

        @Volatile
        var running: Boolean = false
            private set

        /** 幂等启动：已登录语境下调用（App 冷启动/登录成功进主界面/开机）。 */
        fun start(context: Context) {
            val intent = Intent(context, ReminderGuardService::class.java)
            runCatching { ContextCompat.startForegroundService(context, intent) }
                .onFailure { Log.w(TAG, "start guard service failed", it) }
        }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, ReminderGuardService::class.java)) }
            running = false
        }

        /** 排程变化后刷新常驻通知内容（服务在跑时才有意义，未跑时启动即取最新）。 */
        fun refresh(context: Context) {
            if (running) start(context)
        }
    }
}
