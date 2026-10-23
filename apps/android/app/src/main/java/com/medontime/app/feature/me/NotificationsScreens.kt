package com.medontime.app.feature.me

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.model.NotificationDto
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.displayTime
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.launch

class NotificationsViewModel(private val repo: HealthRepository) : ViewModel() {
    var items: List<NotificationDto> by mutableStateOf(emptyList())
        private set
    var unread: Int by mutableStateOf(0)
        private set
    var loading: Boolean by mutableStateOf(true)
        private set
    var page: Int by mutableStateOf(1)
        private set
    var total: Int by mutableStateOf(0)
        private set

    fun load(reset: Boolean = true) {
        loading = true
        viewModelScope.launch {
            val targetPage = if (reset) 1 else page + 1
            runCatching { repo.listNotifications(targetPage) }.onSuccess { result ->
                items = if (reset) result.items else items + result.items
                unread = result.unread
                total = result.total
                page = result.page
            }
            loading = false
        }
    }

    fun markRead(item: NotificationDto) {
        if (item.read) return
        items = items.map { if (it.id == item.id) it.copy(read = true) else it }
        unread = (unread - 1).coerceAtLeast(0)
        viewModelScope.launch { runCatching { repo.markNotificationRead(item.id) } }
    }
}

@Composable
fun NotificationsScreen() {
    val container = LocalAppContainer.current
    val vm: NotificationsViewModel = viewModel(
        factory = viewModelFactory { NotificationsViewModel(container.healthRepository) },
    )
    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("消息中心", style = MaterialTheme.typography.headlineSmall)
        Text(
            if (vm.unread > 0) "${vm.unread} 条未读" else "全部已读",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        when {
            vm.loading && vm.items.isEmpty() -> LoadingBox()
            vm.items.isEmpty() -> EmptyBox("暂无消息")
            else -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(vm.items, key = { it.id }) { item ->
                        NotificationCard(item) { vm.markRead(item) }
                    }
                    if (vm.items.size < vm.total) {
                        item {
                            CareTextButton(
                                text = "加载更多",
                                onClick = { vm.load(reset = false) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(item: NotificationDto, onClick: () -> Unit) {
    val inst = item.instance
    val title = if (inst != null) {
        "${inst.drugNameSnapshot} ${inst.doseAmount}${inst.doseUnit}"
    } else {
        "用药提醒"
    }
    val resultLabel = when (item.result) {
        "success" -> "已送达"
        "failed" -> "发送失败"
        "suppressed_dnd" -> "免打扰抑制"
        "suppressed_dedup" -> "去重抑制"
        else -> item.result
    }
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (item.read) {
                MaterialTheme.colorScheme.surface
            } else {
                MaterialTheme.colorScheme.primaryContainer
            },
        ),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (item.read) FontWeight.Normal else FontWeight.Bold,
                )
                if (!item.read) {
                    Text("未读", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                }
            }
            if (inst != null) {
                Text(
                    "${inst.localDate} ${displayTime(inst.localTime)} · 状态 ${inst.status}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Text(
                "渠道 ${channelLabel(item.channel)} · $resultLabel · ${item.createdAt.replace('T', ' ').take(16)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

fun channelLabel(channel: String): String = when (channel) {
    "app_push" -> "App 推送"
    "in_app" -> "站内"
    "sms" -> "短信"
    "wechat_subscribe" -> "微信"
    "voice_call" -> "语音电话"
    "pc_popup" -> "桌面弹窗"
    else -> channel
}
