package com.medontime.app.feature.me

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.CareSettingsDto
import com.medontime.app.data.model.CyclePreset
import com.medontime.app.data.model.StrongAlertMode
import com.medontime.app.data.model.NotificationPrefsDto
import com.medontime.app.data.model.UpdateCareSettingsRequest
import com.medontime.app.data.model.UpdateNotificationPrefsRequest
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.launch

class CareViewModel(
    private val memberRepo: MemberRepository,
    private val healthRepo: HealthRepository,
    private val store: SessionStore,
) : ViewModel() {
    var memberId: String? by mutableStateOf(null)
        private set
    var memberName: String by mutableStateOf("")
        private set
    var care: CareSettingsDto? by mutableStateOf(null)
        private set
    var prefs: NotificationPrefsDto? by mutableStateOf(null)
        private set
    var loading: Boolean by mutableStateOf(true)
        private set
    var error: String? by mutableStateOf(null)
        private set
    var message: String? by mutableStateOf(null)
        private set

    fun load() {
        loading = true
        error = null
        viewModelScope.launch {
            try {
                val members = memberRepo.listMembers()
                val savedId = store.currentMemberId()
                val current = members.firstOrNull { it.id == savedId } ?: members.firstOrNull()
                if (current == null) {
                    loading = false
                    return@launch
                }
                memberId = current.id
                memberName = current.displayName
                care = memberRepo.careSettings(current.id)
                prefs = healthRepo.notificationPrefs()
            } catch (e: ApiException) {
                error = e.message
            } finally {
                loading = false
            }
        }
    }

    private fun updateCare(request: UpdateCareSettingsRequest) {
        val id = memberId ?: return
        viewModelScope.launch {
            try {
                care = memberRepo.updateCareSettings(id, request)
                message = "已保存"
            } catch (e: ApiException) {
                message = "保存失败：${e.message}"
            }
        }
    }

    fun setCareMode(on: Boolean) = updateCare(UpdateCareSettingsRequest(careMode = on))
    fun setPreset(preset: CyclePreset) = updateCare(UpdateCareSettingsRequest(cyclePreset = preset))
    fun setLockScreen(on: Boolean) = updateCare(UpdateCareSettingsRequest(lockScreenShowDrugDetail = on))
    fun setStrongAlert(mode: StrongAlertMode) = updateCare(UpdateCareSettingsRequest(strongAlertMode = mode))

    private fun updatePrefs(request: UpdateNotificationPrefsRequest) {
        viewModelScope.launch {
            try {
                prefs = healthRepo.updateNotificationPrefs(request)
                message = "通知偏好已保存"
            } catch (e: ApiException) {
                message = "保存失败：${e.message}"
            }
        }
    }

    fun setInApp(on: Boolean) = updatePrefs(UpdateNotificationPrefsRequest(inApp = on))
    fun setSms(on: Boolean) = updatePrefs(UpdateNotificationPrefsRequest(sms = on))
}

@Composable
fun CareScreen() {
    val container = LocalAppContainer.current
    val vm: CareViewModel = viewModel(
        factory = viewModelFactory {
            CareViewModel(container.memberRepository, container.healthRepository, container.sessionStore)
        },
    )
    LaunchedEffect(Unit) { vm.load() }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        Text("关怀与提醒设置", style = MaterialTheme.typography.headlineSmall)
        when {
            vm.loading -> LoadingBox()
            vm.error != null -> ErrorBox(vm.error!!, onRetry = { vm.load() })
            vm.memberId == null -> EmptyBox("还没有成员档案，请先添加成员")
            else -> {
                Text(
                    "当前成员：${vm.memberName}",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(top = 8.dp),
                )
                vm.message?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 4.dp))
                }

                SectionTitle("关怀模式")
                val care = vm.care
                SwitchRow(
                    title = "关怀模式（大字号 / 高对比）",
                    subtitle = "开启后全应用切换大字样式，按钮点击区放大，适合长辈使用",
                    checked = care?.careMode ?: false,
                    onChange = { vm.setCareMode(it) },
                )

                SectionTitle("提醒周期（成员默认，可按计划覆盖）")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        CyclePreset.Standard to "标准 90/15",
                        CyclePreset.Gentle to "温和 120/30",
                        CyclePreset.Strict to "严格 60/10",
                    ).forEach { (preset, label) ->
                        FilterChip(
                            selected = care?.cyclePreset == preset,
                            onClick = { vm.setPreset(preset) },
                            label = { Text(label) },
                        )
                    }
                }
                Text(
                    "含义：到点后 ${care?.cycleWindowMinutes ?: 90} 分钟窗口内，每 ${care?.cycleIntervalMinutes ?: 15} 分钟重复提醒一次，超窗记漏服。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )

                SectionTitle("强提醒方式（弹窗打底，闹钟与语音二选一）")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        StrongAlertMode.None to "无",
                        StrongAlertMode.Alarm to "闹钟",
                        StrongAlertMode.Voice to "语音",
                    ).forEach { (mode, label) ->
                        FilterChip(
                            selected = (care?.strongAlertMode ?: StrongAlertMode.None) == mode,
                            onClick = { vm.setStrongAlert(mode) },
                            label = { Text(label) },
                        )
                    }
                }
                Text(
                    "弹窗通知始终开启；闹钟 = 全屏持续响铃到处理为止；语音 = 到点念出药名与剂量。单个计划可在其他端（Web/小程序）的计划编辑里覆盖。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )

                SectionTitle("隐私")
                SwitchRow(
                    title = "锁屏通知显示药品详情",
                    subtitle = "默认关闭：锁屏只显示「有一次用药提醒」，不出现药名与剂量",
                    checked = care?.lockScreenShowDrugDetail ?: false,
                    onChange = { vm.setLockScreen(it) },
                )

                SectionTitle("通知渠道（账号级）")
                val prefs = vm.prefs
                SwitchRow(
                    title = "站内通知",
                    subtitle = "App 内消息中心与本地提醒",
                    checked = prefs?.inApp ?: true,
                    onChange = { vm.setInApp(it) },
                )
                SwitchRow(
                    title = "短信提醒",
                    subtitle = "用户自选开启：提醒将同时以短信发送（可能产生费用，以运营商为准）",
                    checked = prefs?.sms ?: false,
                    onChange = { vm.setSms(it) },
                )
                SwitchRow(
                    title = "微信提醒",
                    subtitle = "尚未开通（占位）",
                    checked = prefs?.wechat ?: false,
                    enabled = false,
                    onChange = {},
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun SwitchRow(
    title: String,
    subtitle: String?,
    checked: Boolean,
    enabled: Boolean = true,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
