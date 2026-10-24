package com.medontime.app.reminder

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.medontime.app.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * 强提醒呈现分发（2026-10-24 定版）：弹窗通知（基础层）由 NotificationHelper 恒发；
 * 本分发只处理强提醒层——alarm 全屏闹钟 / voice 语音播报，二者互斥（单选枚举）。
 * 隐私口径与通知层一致：lockScreenShowDrugDetail 关闭时，闹钟页与语音都只用通用文案，
 * 不出现药名/剂量。
 */
object DoseAlerter {
    /** 双通道（WorkManager + 精确闹钟）同实例会各触发一次：90 秒内同实例强提醒只呈现一次。 */
    private val recent = mutableMapOf<String, Long>()

    fun presentStrong(context: Context, payload: DosePayload, showDrugDetail: Boolean) {
        if (payload.strongMode == "none") return
        val now = System.currentTimeMillis()
        synchronized(recent) {
            val last = recent[payload.instanceId] ?: 0L
            if (now - last < 90_000) return
            recent[payload.instanceId] = now
            if (recent.size > 64) recent.clear()
        }
        when (payload.strongMode) {
            "alarm" -> AlarmRingActivity.start(context, payload, showDrugDetail)
            "voice" -> VoiceAnnouncer.speakDose(context, payload, showDrugDetail)
            else -> Unit
        }
    }
}

/** 语音播报：TTS 念出服药提示 3 遍（主线程初始化，引擎异步回调后自动释放）。 */
object VoiceAnnouncer {
    fun speakDose(context: Context, payload: DosePayload, showDrugDetail: Boolean) {
        val text = if (showDrugDetail && payload.drugName.isNotBlank()) {
            "该吃药了。现在是${payload.displayTime}，请服用${payload.drugName}，${payload.doseText}。"
        } else {
            "该吃药了，请打开药准时查看本次服药安排。"
        }
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Main).launch {
            var tts: TextToSpeech? = null
            tts = TextToSpeech(appContext) { status ->
                val engine = tts
                if (status == TextToSpeech.SUCCESS && engine != null) {
                    runCatching { engine.language = Locale.CHINESE }
                    engine.setOnUtteranceProgressListener(
                        object : android.speech.tts.UtteranceProgressListener() {
                            override fun onStart(utteranceId: String?) = Unit
                            override fun onDone(utteranceId: String?) {
                                if (utteranceId == "dose-2") {
                                    engine.stop()
                                    engine.shutdown()
                                }
                            }

                            @Deprecated("deprecated in API 21")
                            override fun onError(utteranceId: String?) {
                                engine.shutdown()
                            }
                        },
                    )
                    repeat(3) { index ->
                        engine.speak(text, TextToSpeech.QUEUE_ADD, null, "dose-$index")
                    }
                } else {
                    runCatching { engine?.shutdown() }
                }
            }
        }
    }
}

/**
 * 全屏闹钟页：锁屏上弹出 + 默认闹钟铃持续响铃 + 震动，直到用户点按钮处理。
 * 「去打卡」跳 App 今日页完成打卡（打卡动作仍在主流程内落账）；「知道了」仅停铃。
 */
class AlarmRingActivity : ComponentActivity() {
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private val payloadState = mutableStateOf(
        DosePayload(
            instanceId = "",
            drugName = "",
            doseAmount = "",
            doseUnit = "",
            localTime = "",
            triggerAtMillis = 0L,
            strongMode = "alarm",
        ),
    )
    private val showDetailState = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        applyIntent(intent, forceRestartRing = true)
        setContent {
            val payload by payloadState
            val showDetail by showDetailState
            MaterialTheme {
                AlarmRingScreen(
                    payload = payload,
                    showDetail = showDetail,
                    onCheckIn = {
                        stopRinging()
                        val open = Intent(this@AlarmRingActivity, MainActivity::class.java).apply {
                            action = Intent.ACTION_VIEW
                            data = android.net.Uri.parse("medontime://today")
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            putExtra(NotificationHelper.EXTRA_INSTANCE_ID, payload.instanceId)
                        }
                        startActivity(open)
                        finish()
                    },
                    onDismiss = {
                        stopRinging()
                        finish()
                    },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyIntent(intent, forceRestartRing = false)
    }

    private fun applyIntent(intent: Intent, forceRestartRing: Boolean) {
        val nextPayload = parsePayload(intent)
        val nextShowDetail = intent.getBooleanExtra(EXTRA_SHOW_DETAIL, false)
        val changedInstance = nextPayload.instanceId != payloadState.value.instanceId
        payloadState.value = nextPayload
        showDetailState.value = nextShowDetail
        if (forceRestartRing || changedInstance || ringtone == null) {
            stopRinging()
            startRinging()
        }
    }

    private fun startRinging() {
        runCatching {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ringtone = RingtoneManager.getRingtone(this, uri)?.apply {
                audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    isLooping = true
                }
                play()
            }
        }
        runCatching {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(VibratorManager::class.java)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(VIBRATOR_SERVICE) as? Vibrator
            }
            vibrator?.vibrate(
                VibrationEffect.createWaveform(longArrayOf(0, 600, 400, 600), 0),
            )
        }
    }

    private fun stopRinging() {
        runCatching { ringtone?.stop() }
        runCatching { vibrator?.cancel() }
        ringtone = null
        vibrator = null
    }

    override fun onDestroy() {
        stopRinging()
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_INSTANCE_ID = "alarm_instance_id"
        private const val EXTRA_DRUG_NAME = "alarm_drug_name"
        private const val EXTRA_DOSE_AMOUNT = "alarm_dose_amount"
        private const val EXTRA_DOSE_UNIT = "alarm_dose_unit"
        private const val EXTRA_LOCAL_TIME = "alarm_local_time"
        private const val EXTRA_SHOW_DETAIL = "alarm_show_detail"

        private fun parsePayload(intent: Intent): DosePayload = DosePayload(
            instanceId = intent.getStringExtra(EXTRA_INSTANCE_ID) ?: "",
            drugName = intent.getStringExtra(EXTRA_DRUG_NAME) ?: "",
            doseAmount = intent.getStringExtra(EXTRA_DOSE_AMOUNT) ?: "",
            doseUnit = intent.getStringExtra(EXTRA_DOSE_UNIT) ?: "",
            localTime = intent.getStringExtra(EXTRA_LOCAL_TIME) ?: "",
            triggerAtMillis = 0L,
            strongMode = "alarm",
        )

        fun buildIntent(context: Context, payload: DosePayload, showDrugDetail: Boolean): Intent =
            Intent(context, AlarmRingActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_INSTANCE_ID, payload.instanceId)
                putExtra(EXTRA_DRUG_NAME, payload.drugName)
                putExtra(EXTRA_DOSE_AMOUNT, payload.doseAmount)
                putExtra(EXTRA_DOSE_UNIT, payload.doseUnit)
                putExtra(EXTRA_LOCAL_TIME, payload.localTime)
                putExtra(EXTRA_SHOW_DETAIL, showDrugDetail)
            }

        fun pendingIntent(context: Context, payload: DosePayload, showDrugDetail: Boolean): PendingIntent =
            PendingIntent.getActivity(
                context,
                NotificationHelper.notificationId(payload.instanceId),
                buildIntent(context, payload, showDrugDetail),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        fun start(context: Context, payload: DosePayload, showDrugDetail: Boolean) {
            runCatching {
                context.startActivity(buildIntent(context, payload, showDrugDetail))
            }
        }
    }
}

@Composable
private fun AlarmRingScreen(
    payload: DosePayload,
    showDetail: Boolean,
    onCheckIn: () -> Unit,
    onDismiss: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B6B4F))
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "⏰ 该吃药了",
            color = Color.White,
            fontSize = 40.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Text(
            text = payload.displayTime,
            color = Color.White,
            fontSize = 32.sp,
            textAlign = TextAlign.Center,
        )
        if (showDetail && payload.drugName.isNotBlank()) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = "${payload.drugName} · ${payload.doseText}",
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(48.dp))
        Button(
            onClick = onCheckIn,
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp),
        ) {
            Text(text = "去打卡", fontSize = 22.sp)
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(
            onClick = onDismiss,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            Text(text = "知道了", fontSize = 20.sp, color = Color.White)
        }
    }
}
