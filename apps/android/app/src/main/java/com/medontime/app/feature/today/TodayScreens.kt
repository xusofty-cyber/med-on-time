package com.medontime.app.feature.today

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.medontime.app.ui.theme.AppTheme
import com.medontime.app.ui.theme.LocalAppTheme
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.ReminderDayDto
import com.medontime.app.data.model.ReminderInstanceDto
import com.medontime.app.data.model.ReminderInstanceStatus
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.data.repository.ReminderRepository
import com.medontime.app.reminder.ReminderScheduler
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.displayTime
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class TodayUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val members: List<MemberDto> = emptyList(),
    val currentMember: MemberDto? = null,
    val day: ReminderDayDto? = null,
    /** 正在提交动作的实例 id（防重复点击）。 */
    val actingId: String? = null,
    val message: String? = null,
)

class TodayViewModel(
    private val store: SessionStore,
    private val memberRepo: MemberRepository,
    private val reminderRepo: ReminderRepository,
    private val scheduler: ReminderScheduler,
) : ViewModel() {
    private val _state = MutableStateFlow(TodayUiState())
    val state: StateFlow<TodayUiState> = _state.asStateFlow()

    /** 打卡幂等键：同一实例在一次操作意图内复用，防连点/重试产生重复提交。 */
    private val requestIds = mutableMapOf<String, String>()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val members = memberRepo.listMembers()
                val savedId = store.currentMemberId()
                val current = members.firstOrNull { it.id == savedId } ?: members.firstOrNull()
                if (current == null) {
                    _state.update { it.copy(loading = false, members = emptyList(), currentMember = null, day = null) }
                    return@launch
                }
                store.setCurrentMemberId(current.id)
                runCatching { memberRepo.careSettings(current.id) }
                val day = reminderRepo.today(current.id)
                _state.update {
                    it.copy(loading = false, members = members, currentMember = current, day = day)
                }
                runCatching { scheduler.syncTimeline() }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "加载失败") }
            }
        }
    }

    fun selectMember(member: MemberDto) {
        if (member.id == _state.value.currentMember?.id) return
        _state.update { it.copy(currentMember = member) }
        viewModelScope.launch {
            scheduler.cancelAll()
            store.setCurrentMemberId(member.id)
            load()
        }
    }

    private fun act(instance: ReminderInstanceDto, block: suspend () -> Unit, doneMessage: String) {
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = instance.id, message = null) }
        viewModelScope.launch {
            try {
                block()
                scheduler.cancelInstance(instance.id)
                val memberId = _state.value.currentMember?.id
                val day = memberId?.let { reminderRepo.today(it) }
                _state.update { it.copy(actingId = null, day = day, message = doneMessage) }
                runCatching { scheduler.syncTimeline() }
            } catch (e: ApiException) {
                _state.update { it.copy(actingId = null, message = "操作失败：${e.message}") }
            } catch (e: Exception) {
                _state.update { it.copy(actingId = null, message = e.message ?: "操作失败") }
            }
        }
    }

    fun checkin(instance: ReminderInstanceDto) {
        val requestId = requestIds.getOrPut(instance.id) { UUID.randomUUID().toString() }
        act(instance, { reminderRepo.checkin(instance.id, requestId) }, "已打卡")
        requestIds.remove(instance.id)
    }

    fun snooze(instance: ReminderInstanceDto) {
        act(instance, { reminderRepo.snooze(instance.id, null) }, "已按提醒周期顺延")
    }

    fun skip(instance: ReminderInstanceDto) {
        val requestId = UUID.randomUUID().toString()
        act(instance, { reminderRepo.skip(instance.id, null, requestId) }, "已跳过本次")
    }
}

@Composable
fun TodayScreen() {
    val container = LocalAppContainer.current
    val vm: TodayViewModel = viewModel(
        factory = viewModelFactory {
            TodayViewModel(
                container.sessionStore,
                container.memberRepository,
                container.reminderRepository,
                container.reminderScheduler,
            )
        },
    )
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("今日提醒", style = MaterialTheme.typography.headlineSmall)
        if (state.members.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.members.forEach { member ->
                    FilterChip(
                        selected = member.id == state.currentMember?.id,
                        onClick = { vm.selectMember(member) },
                        label = { Text(member.displayName) },
                    )
                }
            }
        }
        state.message?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 4.dp))
        }
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorBox(state.error!!, onRetry = { vm.load() })
            state.currentMember == null -> EmptyBox("还没有成员档案，请先到「我的」里添加成员")
            state.day == null || state.day!!.items.isEmpty() ->
                EmptyBox("今天没有待服药提醒。可在「计划」里为${state.currentMember?.displayName ?: "成员"}添加用药计划。")
            else -> {
                val day = state.day!!
                Text(
                    "${day.date} · 共 ${day.items.size} 次",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(day.items, key = { it.id }) { instance ->
                        DoseCard(
                            instance = instance,
                            acting = state.actingId == instance.id,
                            onCheckin = { vm.checkin(instance) },
                            onSnooze = { vm.snooze(instance) },
                            onSkip = { vm.skip(instance) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DoseCard(
    instance: ReminderInstanceDto,
    acting: Boolean,
    onCheckin: () -> Unit,
    onSnooze: () -> Unit,
    onSkip: () -> Unit,
) {
    val statusText = when (instance.status) {
        ReminderInstanceStatus.Taken -> "已服用"
        ReminderInstanceStatus.Skipped -> "已跳过"
        ReminderInstanceStatus.Missed -> "已漏服"
        ReminderInstanceStatus.Snoozed -> "已顺延（${instance.snoozeCount} 次）"
        ReminderInstanceStatus.Cancelled -> "已取消"
        else -> "待服用"
    }
    val containerColor = when (instance.status) {
        ReminderInstanceStatus.Taken -> MaterialTheme.colorScheme.primaryContainer
        ReminderInstanceStatus.Missed -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.surface
    }
    // 状态三重表达（颜色 + 图标 + 文字）：卡片底色与文字之外，状态旁再配一个图标。
    val statusIcon: ImageVector
    val statusIconTint: Color
    when (instance.status) {
        ReminderInstanceStatus.Taken -> {
            statusIcon = Icons.Filled.CheckCircle
            statusIconTint = MaterialTheme.colorScheme.primary
        }
        ReminderInstanceStatus.Missed -> {
            statusIcon = Icons.Filled.Error
            statusIconTint = MaterialTheme.colorScheme.error
        }
        ReminderInstanceStatus.Snoozed -> {
            statusIcon = Icons.Filled.Schedule
            statusIconTint = MaterialTheme.colorScheme.secondary
        }
        ReminderInstanceStatus.Skipped -> {
            statusIcon = Icons.Filled.Cancel
            statusIconTint = MaterialTheme.colorScheme.onSurfaceVariant
        }
        else -> {
            statusIcon = Icons.Filled.HourglassEmpty
            statusIconTint = MaterialTheme.colorScheme.onSurfaceVariant
        }
    }
    // 主题 A 今日提醒大卡片：内边距 24dp + 柔和阴影；主题 0 保持 16dp / 2dp 不变。
    val appTheme = LocalAppTheme.current
    val cardPadding = if (appTheme == AppTheme.Warm) 24.dp else 16.dp
    val cardElevation = if (appTheme == AppTheme.Warm) 4.dp else 2.dp
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        elevation = CardDefaults.cardElevation(defaultElevation = cardElevation),
    ) {
        Column(modifier = Modifier.padding(cardPadding)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(displayTime(instance.localTime), style = MaterialTheme.typography.headlineSmall)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = statusIcon,
                        contentDescription = null,
                        tint = statusIconTint,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(statusText, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(instance.drugNameSnapshot, style = MaterialTheme.typography.titleLarge)
            Text(
                "剂量 ${instance.doseAmount}${instance.doseUnit}",
                style = MaterialTheme.typography.bodyLarge,
            )
            instance.intake?.takenAt?.let {
                Text("服药时间 ${it.replace('T', ' ').take(16)}", style = MaterialTheme.typography.bodyMedium)
            }
            if (instance.actionable || instance.status == ReminderInstanceStatus.Missed) {
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CareButton(
                        text = if (instance.status == ReminderInstanceStatus.Missed) "补打卡" else "已服用",
                        onClick = onCheckin,
                        enabled = !acting,
                        modifier = Modifier.weight(1f),
                        icon = Icons.Filled.Check,
                    )
                    if (instance.actionable) {
                        CareTextButton(text = "稍后", onClick = onSnooze, modifier = Modifier.weight(0.6f), icon = Icons.Filled.Schedule)
                        CareTextButton(text = "跳过", onClick = onSkip, modifier = Modifier.weight(0.6f), icon = Icons.Filled.Close)
                    }
                }
            }
        }
    }
}
