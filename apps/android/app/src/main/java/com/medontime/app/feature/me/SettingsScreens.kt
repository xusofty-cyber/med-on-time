package com.medontime.app.feature.me

import android.app.AlarmManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.BuildConfig
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.AccountStatus
import com.medontime.app.data.model.SessionDto
import com.medontime.app.data.model.UpdateProfileRequest
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.repository.AuthRepository
import com.medontime.app.reminder.ReminderScheduler
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
    val nickname: String = "",
    val status: AccountStatus = AccountStatus.Active,
    val sessions: List<SessionDto> = emptyList(),
    val message: String? = null,
)

class SettingsViewModel(
    private val authRepo: AuthRepository,
    private val store: SessionStore,
    private val apiProvider: ApiProvider,
    private val scheduler: ReminderScheduler,
) : ViewModel() {
    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()
    val baseUrlFlow: kotlinx.coroutines.flow.Flow<String> = store.baseUrlFlow

    fun load() {
        viewModelScope.launch {
            runCatching { authRepo.me() }.onSuccess { account ->
                _state.update { it.copy(nickname = account.nickname, status = account.status) }
            }
            runCatching { authRepo.sessions() }.onSuccess { sessions ->
                _state.update { it.copy(sessions = sessions) }
            }
        }
    }

    fun saveNickname(nickname: String) {
        viewModelScope.launch {
            try {
                authRepo.updateProfile(UpdateProfileRequest(nickname = nickname))
                _state.update { it.copy(nickname = nickname, message = "昵称已保存") }
            } catch (e: ApiException) {
                _state.update { it.copy(message = "保存失败：${e.message}") }
            }
        }
    }

    fun saveBaseUrl(url: String) {
        viewModelScope.launch {
            store.setBaseUrl(url)
            apiProvider.invalidate()
            _state.update { it.copy(message = "服务器地址已更新") }
        }
    }

    fun revokeSession(session: SessionDto) {
        viewModelScope.launch {
            try {
                authRepo.deleteSession(session.id)
                _state.update { it.copy(message = "设备会话已下线") }
                load()
            } catch (e: ApiException) {
                _state.update { it.copy(message = "操作失败：${e.message}") }
            }
        }
    }

    fun cancelAccount(reason: String) {
        viewModelScope.launch {
            try {
                authRepo.cancelAccount(reason.ifBlank { null })
                _state.update { it.copy(status = AccountStatus.Cancelling, message = "注销申请已提交，进入 30 天冷静期") }
            } catch (e: ApiException) {
                _state.update { it.copy(message = "提交失败：${e.message}") }
            }
        }
    }

    fun withdrawCancel() {
        viewModelScope.launch {
            try {
                authRepo.withdrawCancel()
                _state.update { it.copy(status = AccountStatus.Active, message = "注销申请已撤销") }
            } catch (e: ApiException) {
                _state.update { it.copy(message = "撤销失败：${e.message}") }
            }
        }
    }

    fun logout() {
        scheduler.cancelAll()
        viewModelScope.launch { authRepo.logout() }
    }
}

@Composable
fun SettingsScreen() {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val vm: SettingsViewModel = viewModel(
        factory = viewModelFactory {
            SettingsViewModel(
                container.authRepository,
                container.sessionStore,
                container.apiProvider,
                container.reminderScheduler,
            )
        },
    )
    val state by vm.state.collectAsState()
    val baseUrl by vm.baseUrlFlow.collectAsState(initial = "")
    var nickname by remember { mutableStateOf("") }
    var baseUrlInput by remember { mutableStateOf("") }
    var showCancel by remember { mutableStateOf(false) }
    var showLogout by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        vm.load()
    }
    LaunchedEffect(state.nickname) { if (nickname.isBlank()) nickname = state.nickname }
    LaunchedEffect(baseUrl) { if (baseUrlInput.isBlank()) baseUrlInput = baseUrl }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        Text("设置", style = MaterialTheme.typography.headlineSmall)
        state.message?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 6.dp))
        }

        SectionTitle("个人资料")
        OutlinedTextField(
            value = nickname,
            onValueChange = { nickname = it },
            label = { Text("昵称") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        CareTextButton(text = "保存昵称", onClick = { vm.saveNickname(nickname.trim()) })

        SectionTitle("服务器地址")
        OutlinedTextField(
            value = baseUrlInput,
            onValueChange = { baseUrlInput = it },
            label = { Text("API 基地址（以 / 结尾）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            "默认 ${BuildConfig.DEFAULT_API_BASE_URL}（模拟器访问本机后端）；真机请改为服务器地址或局域网地址。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        CareTextButton(text = "保存服务器地址", onClick = { vm.saveBaseUrl(baseUrlInput.trim()) })

        SectionTitle("提醒权限")
        val alarmManager = remember { context.getSystemService(AlarmManager::class.java) }
        val exactGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            alarmManager?.canScheduleExactAlarms() == true
        Text(
            if (exactGranted) "精确闹钟：已授权，本地提醒可准时触发" else "精确闹钟：未授权，提醒可能被系统省电延迟",
            style = MaterialTheme.typography.bodyLarge,
        )
        if (!exactGranted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            CareTextButton(text = "去系统设置授权精确闹钟", onClick = {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
                runCatching { context.startActivity(intent) }
            })
        }
        CareTextButton(text = "打开系统通知设置", onClick = {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
            runCatching { context.startActivity(intent) }
        })

        SectionTitle("登录设备")
        if (state.sessions.isEmpty()) {
            Text("暂无设备记录", style = MaterialTheme.typography.bodyMedium)
        }
        state.sessions.forEach { session ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "${session.deviceName ?: "未知设备"}（${session.platform ?: ""}）${if (session.current) " · 本机" else ""}",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        "登录于 ${session.createdAt?.replace('T', ' ')?.take(16) ?: ""}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!session.current) {
                    CareTextButton(text = "下线", onClick = { vm.revokeSession(session) })
                }
            }
        }

        SectionTitle("账号注销")
        Text(
            "申请注销后进入 30 天冷静期：期间可撤销；期满后可识别个人信息物理删除、健康明细不可逆匿名化归档（需求定版口径）。当前状态：${accountStatusLabel(state.status.name)}",
            style = MaterialTheme.typography.bodyLarge,
        )
        if (state.status == AccountStatus.Cancelling) {
            CareButton(text = "撤销注销申请", onClick = { vm.withdrawCancel() }, modifier = Modifier.padding(top = 8.dp))
        } else {
            CareTextButton(text = "申请注销账号", onClick = { showCancel = true })
        }

        Spacer(Modifier.height(16.dp))
        CareButton(
            text = "退出登录",
            onClick = { showLogout = true },
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            "版本 ${BuildConfig.VERSION_NAME}（${BuildConfig.VERSION_CODE}）",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
        Spacer(Modifier.height(24.dp))
    }

    if (showCancel) {
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCancel = false },
            title = { Text("申请注销") },
            text = {
                Column {
                    Text("提交后进入 30 天冷静期，期内登录可撤销。冷静期满账号与个人信息按定版口径处理。")
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        label = { Text("注销原因（可选）") },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.cancelAccount(reason); showCancel = false }) { Text("确认申请") }
            },
            dismissButton = { TextButton(onClick = { showCancel = false }) { Text("取消") } },
        )
    }
    if (showLogout) {
        AlertDialog(
            onDismissRequest = { showLogout = false },
            title = { Text("退出登录") },
            text = { Text("退出后本地提醒将停止（服务端提醒不受影响）。确认退出？") },
            confirmButton = {
                TextButton(onClick = { vm.logout(); showLogout = false }) { Text("退出") }
            },
            dismissButton = { TextButton(onClick = { showLogout = false }) { Text("取消") } },
        )
    }
}
