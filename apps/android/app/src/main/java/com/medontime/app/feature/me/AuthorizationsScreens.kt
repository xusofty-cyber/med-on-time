package com.medontime.app.feature.me

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.model.AuthorizationDto
import com.medontime.app.data.model.AuthorizationStatus
import com.medontime.app.data.model.CaregiverLevel
import com.medontime.app.data.model.CreateAuthorizationRequest
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthorizationsUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val members: List<MemberDto> = emptyList(),
    val granted: List<AuthorizationDto> = emptyList(),
    val received: List<AuthorizationDto> = emptyList(),
    val message: String? = null,
)

class AuthorizationsViewModel(private val repo: MemberRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthorizationsUiState())
    val state: StateFlow<AuthorizationsUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val members = repo.listMembers()
                val granted = repo.listAuthorizations("granted")
                val received = repo.listAuthorizations("received")
                _state.update {
                    it.copy(loading = false, members = members, granted = granted, received = received)
                }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    private fun act(block: suspend () -> Unit, done: String) {
        viewModelScope.launch {
            try {
                block()
                _state.update { it.copy(message = done) }
                load()
            } catch (e: ApiException) {
                _state.update { it.copy(message = "操作失败：${e.message}") }
            }
        }
    }

    fun invite(request: CreateAuthorizationRequest) = act({ repo.createAuthorization(request) }, "邀请已发送")
    fun accept(item: AuthorizationDto) = act({ repo.acceptAuthorization(item.id) }, "已接受授权")
    fun reject(item: AuthorizationDto) = act({ repo.rejectAuthorization(item.id) }, "已拒绝")
    fun revoke(item: AuthorizationDto) = act({ repo.revokeAuthorization(item.id, null) }, "已撤销")
}

@Composable
fun AuthorizationsScreen() {
    val container = LocalAppContainer.current
    val vm: AuthorizationsViewModel = viewModel(
        factory = viewModelFactory { AuthorizationsViewModel(container.memberRepository) },
    )
    val state by vm.state.collectAsState()
    var showInvite by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("照护授权", style = MaterialTheme.typography.headlineSmall)
        Text(
            "L1 仅查看 / L2 可协助打卡 / L3 可配置计划；每位成员最多 5 位照护人。代操作都会双记录留痕。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        CareButton(text = "＋ 邀请照护人", onClick = { showInvite = true }, modifier = Modifier.fillMaxWidth())
        state.message?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 4.dp))
        }
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorBox(state.error!!, onRetry = { vm.load() })
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { SectionTitle("授权给我的（我是照护人）") }
                if (state.received.isEmpty()) {
                    item { Text("暂无", style = MaterialTheme.typography.bodyMedium) }
                }
                items(state.received, key = { "r-${it.id}" }) { item ->
                    AuthorizationCard(
                        item = item,
                        memberName = item.memberDisplayName,
                        counterpart = item.caregiverNickname,
                        isReceived = true,
                        onAccept = { vm.accept(item) },
                        onReject = { vm.reject(item) },
                        onRevoke = { vm.revoke(item) },
                    )
                }
                item { SectionTitle("我授权出去的") }
                if (state.granted.isEmpty()) {
                    item { Text("暂无", style = MaterialTheme.typography.bodyMedium) }
                }
                items(state.granted, key = { "g-${it.id}" }) { item ->
                    AuthorizationCard(
                        item = item,
                        memberName = state.members.firstOrNull { it.id == item.memberId }?.displayName,
                        counterpart = item.caregiverNickname,
                        isReceived = false,
                        onAccept = { vm.accept(item) },
                        onReject = { vm.reject(item) },
                        onRevoke = { vm.revoke(item) },
                    )
                }
            }
        }
    }

    if (showInvite) {
        InviteDialog(
            members = state.members,
            onDismiss = { showInvite = false },
            onSubmit = { req ->
                vm.invite(req)
                showInvite = false
            },
        )
    }
}

@Composable
private fun AuthorizationCard(
    item: AuthorizationDto,
    memberName: String?,
    counterpart: String?,
    isReceived: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onRevoke: () -> Unit,
) {
    val statusLabel = when (item.status) {
        AuthorizationStatus.PendingAccept -> "待接受"
        AuthorizationStatus.Active -> "生效中"
        AuthorizationStatus.Suspended -> "已暂停"
        AuthorizationStatus.Revoked -> "已撤销"
        AuthorizationStatus.Expired -> "已过期"
        AuthorizationStatus.Rejected -> "已拒绝"
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "成员：${memberName ?: item.memberId.take(8)} · 级别 ${item.level.name} · $statusLabel",
                style = MaterialTheme.typography.bodyLarge,
            )
            counterpart?.let { Text("照护人：$it", style = MaterialTheme.typography.bodyMedium) }
            item.expiresAt?.let {
                Text("到期：${it.replace('T', ' ').take(16)}", style = MaterialTheme.typography.bodyMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (isReceived && item.status == AuthorizationStatus.PendingAccept) {
                    CareTextButton(text = "接受", onClick = onAccept)
                    CareTextButton(text = "拒绝", onClick = onReject)
                }
                if (item.status == AuthorizationStatus.Active || item.status == AuthorizationStatus.PendingAccept) {
                    CareTextButton(text = "撤销", onClick = onRevoke)
                }
            }
        }
    }
}

@Composable
private fun InviteDialog(
    members: List<MemberDto>,
    onDismiss: () -> Unit,
    onSubmit: (CreateAuthorizationRequest) -> Unit,
) {
    var member by remember { mutableStateOf(members.firstOrNull()) }
    var phone by remember { mutableStateOf("") }
    var level by remember { mutableStateOf(CaregiverLevel.L2) }
    var formError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("邀请照护人") },
        text = {
            Column {
                Text("选择成员", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    members.forEach { m ->
                        FilterChip(
                            selected = member?.id == m.id,
                            onClick = { member = m },
                            label = { Text(m.displayName) },
                        )
                    }
                }
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it.filter { c -> c.isDigit() }.take(11) },
                    label = { Text("照护人注册手机号") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                Text("授权级别", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CaregiverLevel.entries.forEach { lv ->
                        FilterChip(
                            selected = level == lv,
                            onClick = { level = lv },
                            label = { Text("${lv.name} ${levelLabel(lv)}") },
                        )
                    }
                }
                formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val m = member
                if (m == null) {
                    formError = "请先选择成员"
                    return@TextButton
                }
                if (!Regex("^1[3-9]\\d{9}$").matches(phone)) {
                    formError = "手机号格式不正确"
                    return@TextButton
                }
                onSubmit(CreateAuthorizationRequest(memberId = m.id, caregiverPhone = phone, level = level))
            }) { Text("发送邀请") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

fun levelLabel(level: CaregiverLevel): String = when (level) {
    CaregiverLevel.L1 -> "仅查看"
    CaregiverLevel.L2 -> "可协助"
    CaregiverLevel.L3 -> "可配置"
}
