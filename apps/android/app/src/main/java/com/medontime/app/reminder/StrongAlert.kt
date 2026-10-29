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
import android.speech.tts.UtteranceProgressListener
import android.util.Log
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.resume

/**
 * 强提醒呈现分发（2026-10-24 定版）：弹窗通知（基础层）由 NotificationHelper 恒发；
 * 本分发只处理强提醒层——alarm 全屏闹钟 / voice 语音播报，二者互斥（单选枚举）。
 * 隐私口径与通知层一致：lockScreenShowDrugDetail 关闭时，闹钟页与语音都只用通用文案，
 * 不出现药名/剂量。
 */

/**
 * 语音播报诊断结果（设置页“试听语音”与后台播报共用同一判定口径）。
 *
 * - initOk：TTS 引擎初始化成功
 * - languageResult：setLanguage 返回值（LANG_AVAILABLE 等；初始化失败或
 *   setLanguage 抛异常时为 Int.MIN_VALUE）
 * - speakResults：每次 speak() 的返回值（SUCCESS / ERROR）
 * - enginePackage：当前默认 TTS 引擎包名
 */
data class VoiceDiagnosis(
    val initOk: Boolean,
    val languageResult: Int,
    val speakResults: List<Int>,
    val enginePackage: String?,
) {
    val ok: Boolean
        get() = initOk &&
            // setLanguage 返回 0/1/2 均为成功（LANG_AVAILABLE / LANG_COUNTRY_AVAILABLE /
            // LANG_COUNTRY_VAR_AVAILABLE），只有负值才是失败；旧代码要求恰好等于 0，
            // 在返回 1/2 的引擎上会把成功的语音误判为失败。
            languageResult >= 0 &&
            speakResults.isNotEmpty() &&
            speakResults.all { it == TextToSpeech.SUCCESS }

    fun describe(): String = when {
        !initOk -> "播报失败：语音引擎初始化失败（请检查系统设置 → 文字转语音）"
        languageResult == TextToSpeech.LANG_MISSING_DATA -> "播报失败：缺少中文语音数据（系统设置 → 文字转语音 → 安装语音数据）"
        languageResult == TextToSpeech.LANG_NOT_SUPPORTED -> "播报失败：当前语音引擎不支持中文"
        languageResult == Int.MIN_VALUE -> "播报失败：语音语言设置异常（请检查系统文字转语音设置）"
        languageResult < 0 -> "播报失败：语音语言设置失败（返回码 $languageResult）"
        speakResults.isEmpty() -> "播报失败：未能提交播报请求"
        speakResults.any { it != TextToSpeech.SUCCESS } -> "播报失败：语音引擎拒绝播报（speak 返回 ${speakResults.joinToString()}）"
        else -> "播报成功：语音引擎正常（${enginePackage ?: "未知引擎"}）"
    }
}

object VoiceAnnouncer {
    private const val TAG = "VoiceAnnouncer"
    private const val INIT_TIMEOUT_MS = 8_000L

    private fun buildText(payload: DosePayload, showDrugDetail: Boolean): String =
        if (showDrugDetail && payload.drugName.isNotBlank()) {
            "该吃药了。现在是${payload.displayTime}，请服用${payload.drugName}，${payload.doseText}。"
        } else {
            "该吃药了，请打开药准时查看本次服药安排。"
        }

    /**
     * 创建并等待一个 TTS 实例初始化完成。[enginePackage] 为 null 时用系统默认引擎，
     * 否则按包名指定引擎。返回 (initStatus, instance)；超时按 ERROR 处理。
     * [onCreated] 在实例创建后立即回调（供调用方登记取消清理）；失败实例由调用方 shutdown。
     */
    private suspend fun initEngine(
        context: Context,
        enginePackage: String?,
        onCreated: (TextToSpeech?) -> Unit,
    ): Pair<Int, TextToSpeech?> {
        var instance: TextToSpeech? = null
        val status = withTimeoutOrNull(INIT_TIMEOUT_MS) {
            suspendCancellableCoroutine<Int> { cont ->
                // 取消时释放已创建的引擎，避免每次取消泄漏一个 TTS 服务绑定。
                cont.invokeOnCancellation { runCatching { instance?.shutdown() } }
                val listener = TextToSpeech.OnInitListener { s ->
                    if (cont.isActive) cont.resume(s)
                }
                instance = if (enginePackage == null) {
                    TextToSpeech(context.applicationContext, listener)
                } else {
                    TextToSpeech(context.applicationContext, listener, enginePackage)
                }
                onCreated(instance)
            }
        } ?: TextToSpeech.ERROR
        return status to instance
    }

    /** 已安装的 TTS 引擎包名（依赖 manifest 的 queries 声明才查得到，见 AndroidManifest）。 */
    @Suppress("DEPRECATION")
    private fun installedEnginePackages(context: Context): List<String> {
        val intent = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
        val services = runCatching {
            context.packageManager.queryIntentServices(intent, 0)
        }.getOrDefault(emptyList())
        return services.map { it.serviceInfo.packageName }.distinct()
    }

    /**
     * 初始化 TTS 并排队播报 [texts]（每条一次 speak 调用），返回诊断。
     *
     * 播报是异步的：speak() 返回 SUCCESS 只代表已排队，系统 TTS 服务随后播放；
     * 本函数不等到播完，只等到“已排队”就返回。最后一条语句播完时 onDone 关闭引擎；
     * 若 onDone 迟迟不来（引擎异常），实例随进程结束而释放，与旧实现一致。
     * 调用方可从任何线程调用：内部自行切到 Main（TTS 回调走主线程）。
     */
    private suspend fun enqueue(context: Context, texts: List<String>): VoiceDiagnosis {
        return withContext(Dispatchers.Main) {
            var engine: TextToSpeech? = null
            try {
                var (initStatus, tts) = initEngine(context, null) { engine = it }
                var failedDefaultPkg: String? = null
                if (initStatus != TextToSpeech.SUCCESS) {
                    // 默认引擎初始化失败：逐个尝试其他已装引擎兜底（部分国产 ROM 的默认
                    // 引擎绑定不稳定，但同机其他引擎可用）。最多试 3 个，避免长时间无声等待。
                    failedDefaultPkg = tts?.defaultEngine
                    runCatching { tts?.shutdown() }
                    engine = null
                    tts = null
                    val candidates = installedEnginePackages(context)
                        .filter { it != failedDefaultPkg }
                        .take(3)
                    for (pkg in candidates) {
                        val (status, instance) = initEngine(context, pkg) { engine = it }
                        if (status == TextToSpeech.SUCCESS && instance != null) {
                            initStatus = status
                            tts = instance
                            break
                        }
                        Log.w(TAG, "TTS init fallback failed: engine=$pkg status=$status")
                        runCatching { instance?.shutdown() }
                        engine = null
                    }
                }
                if (initStatus != TextToSpeech.SUCCESS || tts == null) {
                    Log.w(TAG, "TTS init failed: status=$initStatus")
                    return@withContext VoiceDiagnosis(false, Int.MIN_VALUE, emptyList(), failedDefaultPkg)
                }
                val activeTts = tts
                // setLanguage 抛异常时用独立哨兵值，避免与 LANG_MISSING_DATA（-1）撞车误报。
                val langResult = runCatching { activeTts.setLanguage(Locale.CHINESE) }
                    .getOrDefault(Int.MIN_VALUE)
                if (langResult < 0) {
                    Log.w(TAG, "TTS setLanguage failed: result=$langResult")
                    runCatching { activeTts.shutdown() }
                    return@withContext VoiceDiagnosis(true, langResult, emptyList(), activeTts.defaultEngine)
                }
                activeTts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit
                    override fun onDone(utteranceId: String?) {
                        if (utteranceId == "dose-last") runCatching { activeTts.shutdown() }
                    }

                    @Deprecated("deprecated in API 21")
                    override fun onError(utteranceId: String?) {
                        runCatching { activeTts.shutdown() }
                    }
                })
                val results = texts.mapIndexed { index, text ->
                    val utteranceId = if (index == texts.lastIndex) "dose-last" else "dose-$index"
                    runCatching { activeTts.speak(text, TextToSpeech.QUEUE_ADD, null, utteranceId) }
                        .getOrDefault(TextToSpeech.ERROR)
                }
                VoiceDiagnosis(true, langResult, results, activeTts.defaultEngine)
            } catch (e: CancellationException) {
                // 协程取消必须重抛（否则外层超时/取消会被吞成普通失败）；取消前释放引擎。
                runCatching { engine?.shutdown() }
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "TTS enqueue failed", e)
                VoiceDiagnosis(false, Int.MIN_VALUE, emptyList(), null)
            }
        }
    }

    /**
     * 后台播报：把提醒念 3 遍。返回 true 仅代表 TTS 已成功排队（不代表已播完），
     * 调用方据此决定是否记去重；返回 false 时调用方不得记去重，以便另一通道重试。
     */
    suspend fun speakDose(context: Context, payload: DosePayload, showDrugDetail: Boolean): Boolean {
        val text = buildText(payload, showDrugDetail)
        val diagnosis = enqueue(context, List(3) { text })
        if (!diagnosis.ok) Log.w(TAG, "speakDose failed: ${diagnosis.describe()}")
        return diagnosis.ok
    }

    /** 前台试听：念一句测试语，返回完整诊断（供设置页展示真实状态）。 */
    suspend fun testSpeak(context: Context): VoiceDiagnosis {
        return enqueue(context, listOf("这是药准时语音播报测试。该吃药了，请按时服药。"))
    }
}

/**
 * 强提醒分发（弹窗恒为基础层，此处只处理 alarm / voice 两路）。
 *
 * 去重只记成功：语音排队失败时不记，精确闹钟与 WorkManager 两路仍可重试；
 * 失败原因记在 [lastVoiceError]，供设置页试听排查参考。
 */
object DoseAlerter {
    private const val TAG = "DoseAlerter"

    /** 双通道（WorkManager + 精确闹钟）同实例会各触发一次：90 秒内同实例强提醒只呈现一次。 */
    private val recent = mutableMapOf<String, Long>()
    private const val DEDUP_WINDOW_MS = 90_000L

    @Volatile
    var lastVoiceError: String? = null
        private set

    /** 前台试听成功后清除后台失败记录（避免旧报错一直挂着）。 */
    fun clearVoiceError() {
        lastVoiceError = null
    }

    /**
     * 返回 true 表示强提醒已实际发出（闹钟已拉起，或语音已成功排队）。
     * mode 为 none 或 90 秒内已发出过时返回 false。
     *
     * 去重是原子的：检查与占位在同一个 synchronized 块内完成，另一通道不会在
     * 本通道 TTS 初始化挂起期间同时通过检查；语音失败、闹钟拉起抛异常或方式
     * 未知时释放占位，以便另一通道重试。
     */
    suspend fun presentStrong(context: Context, payload: DosePayload, showDetail: Boolean): Boolean {
        val mode = payload.strongMode
        if (mode == "none") return false
        val now = System.currentTimeMillis()
        val claimed = synchronized(recent) {
            val last = recent[payload.instanceId]
            if (last != null && now - last < DEDUP_WINDOW_MS) {
                false
            } else {
                recent[payload.instanceId] = now
                true
            }
        }
        if (!claimed) return false
        return when (mode) {
            "alarm" -> {
                // 直接拉起是 best-effort：后台启动可能被系统静默拦截（不抛异常），
                // 此时通知上的全屏 intent 仍是可靠通道；只有抛异常才算失败。
                val started = AlarmRingActivity.start(context, payload, showDetail)
                if (started) {
                    markPresented(payload.instanceId)
                    true
                } else {
                    releaseClaim(payload.instanceId)
                    false
                }
            }
            "voice" -> {
                val ok = try {
                    VoiceAnnouncer.speakDose(context, payload, showDetail)
                } catch (e: CancellationException) {
                    // 取消必须重抛：runCatching 会把它吞成普通失败，导致被取消的
                    // 提醒任务报成功；占位照常释放。
                    releaseClaim(payload.instanceId)
                    throw e
                } catch (e: Exception) {
                    false
                }
                if (ok) {
                    lastVoiceError = null
                    markPresented(payload.instanceId)
                } else {
                    Log.w(TAG, "voice present failed for ${payload.instanceId}, claim released")
                    lastVoiceError = "语音播报失败：请到设置页点“试听语音”查看原因"
                    releaseClaim(payload.instanceId)
                }
                ok
            }
            else -> {
                releaseClaim(payload.instanceId)
                false
            }
        }
    }

    /** 成功时刻记去重（而非尝试开始时刻）；超 64 条时淘汰最旧的，而非全清。 */
    private fun markPresented(instanceId: String) {
        synchronized(recent) {
            recent[instanceId] = System.currentTimeMillis()
            if (recent.size > 64) {
                recent.entries.minByOrNull { it.value }?.let { recent.remove(it.key) }
            }
        }
    }

    private fun releaseClaim(instanceId: String) {
        synchronized(recent) { recent.remove(instanceId) }
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

        /** 直接拉起闹钟页；返回 false 仅代表 startActivity 抛了异常（后台静默拦截不抛异常，无法从返回值区分）。 */
        fun start(context: Context, payload: DosePayload, showDrugDetail: Boolean): Boolean {
            return runCatching {
                context.startActivity(buildIntent(context, payload, showDrugDetail))
            }.isSuccess
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
