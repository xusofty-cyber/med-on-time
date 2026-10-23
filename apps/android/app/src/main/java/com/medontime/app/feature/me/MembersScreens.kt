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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.CreateMemberRequest
import com.medontime.app.data.model.Gender
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.MemberRelationship
import com.medontime.app.data.model.UpdateMemberRequest
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MembersUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val members: List<MemberDto> = emptyList(),
    val currentMemberId: String? = null,
    val message: String? = null,
)

class MembersViewModel(
    private val repo: MemberRepository,
    private val store: SessionStore,
) : ViewModel() {
    private val _state = MutableStateFlow(MembersUiState())
    val state: StateFlow<MembersUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val members = repo.listMembers()
                _state.update {
                    it.copy(loading = false, members = members, currentMemberId = store.currentMemberId())
                }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun setCurrent(member: MemberDto) {
        viewModelScope.launch {
            store.setCurrentMemberId(member.id)
            _state.update { it.copy(currentMemberId = member.id, message = "已切换为 ${member.displayName}") }
            // 主题/通知缓存跟随新成员刷新
            runCatching { repo.careSettings(member.id) }
        }
    }

    fun create(request: CreateMemberRequest) {
        viewModelScope.launch {
            try {
                repo.createMember(request)
                _state.update { it.copy(message = "成员已添加") }
                load()
            } catch (e: ApiException) {
                _state.update { it.copy(message = "添加失败：${e.message}") }
            }
        }
    }

    fun update(member: MemberDto, request: UpdateMemberRequest) {
        viewModelScope.launch {
            try {
                repo.updateMember(member.id, request)
                _state.update { it.copy(message = "已保存") }
                load()
            } catch (e: ApiException) {
                _state.update { it.copy(message = "保存失败：${e.message}") }
            }
        }
    }

    fun delete(member: MemberDto) {
        viewModelScope.launch {
            try {
                repo.deleteMember(member.id)
                _state.update { it.copy(message = "已删除") }
                load()
            } catch (e: ApiException) {
                _state.update { it.copy(message = "删除失败：${e.message}") }
            }
        }
    }
}

@Composable
fun MembersScreen() {
    val container = LocalAppContainer.current
    val vm: MembersViewModel = viewModel(
        factory = viewModelFactory { MembersViewModel(container.memberRepository, container.sessionStore) },
    )
    val state by vm.state.collectAsState()
    var editing by remember { mutableStateOf<MemberDto?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<MemberDto?>(null) }

    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("成员管理", style = MaterialTheme.typography.headlineSmall)
        Text(
            "每账号最多 10 位成员。照护人只能看到被授权成员的数据（服务端隔离）。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        CareButton(
            text = "＋ 添加成员",
            onClick = { showCreate = true },
            enabled = state.members.size < 10,
            modifier = Modifier.fillMaxWidth(),
        )
        state.message?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 4.dp))
        }
        Spacer(Modifier.height(8.dp))
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorBox(state.error!!, onRetry = { vm.load() })
            state.members.isEmpty() -> EmptyBox("还没有成员，点击上方按钮添加")
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.members, key = { it.id }) { member ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(member.displayName, style = MaterialTheme.typography.titleLarge)
                                if (member.id == state.currentMemberId) {
                                    Text("当前成员", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                                }
                            }
                            Text(
                                "${relationshipLabel(member.relationship)} · ${member.timezone}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                if (member.id != state.currentMemberId) {
                                    CareTextButton(text = "设为当前", onClick = { vm.setCurrent(member) })
                                }
                                CareTextButton(text = "编辑", onClick = { editing = member })
                                CareTextButton(text = "删除", onClick = { pendingDelete = member })
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreate) {
        MemberFormDialog(
            initial = null,
            onDismiss = { showCreate = false },
            onSubmit = { req ->
                vm.create(req.first)
                showCreate = false
            },
        )
    }
    editing?.let { member ->
        MemberFormDialog(
            initial = member,
            onDismiss = { editing = null },
            onSubmit = { pair ->
                vm.update(member, pair.second)
                editing = null
            },
        )
    }
    pendingDelete?.let { member ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除成员") },
            text = { Text("确认删除成员「${member.displayName}」？其计划与记录将按服务端规则处理。") },
            confirmButton = { TextButton(onClick = { vm.delete(member); pendingDelete = null }) { Text("删除") } },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun MemberFormDialog(
    initial: MemberDto?,
    onDismiss: () -> Unit,
    onSubmit: (Pair<CreateMemberRequest, UpdateMemberRequest>) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.displayName ?: "") }
    var relationship by remember { mutableStateOf(initial?.relationship ?: MemberRelationship.Self) }
    var gender by remember { mutableStateOf(initial?.gender) }
    var birthDate by remember { mutableStateOf(initial?.birthDate ?: "") }
    var timezone by remember { mutableStateOf(initial?.timezone ?: "Asia/Shanghai") }
    var formError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "添加成员" else "编辑成员") },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("显示名（如：爸爸、王奶奶）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("与账号关系", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    MemberRelationship.entries.take(5).forEach { rel ->
                        androidx.compose.material3.FilterChip(
                            selected = relationship == rel,
                            onClick = { relationship = rel },
                            label = { Text(relationshipLabel(rel)) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    MemberRelationship.entries.drop(5).forEach { rel ->
                        androidx.compose.material3.FilterChip(
                            selected = relationship == rel,
                            onClick = { relationship = rel },
                            label = { Text(relationshipLabel(rel)) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    listOf<Gender?>(null, Gender.Male, Gender.Female).forEach { g ->
                        androidx.compose.material3.FilterChip(
                            selected = gender == g,
                            onClick = { gender = g },
                            label = { Text(genderLabel(g)) },
                        )
                    }
                }
                OutlinedTextField(
                    value = birthDate,
                    onValueChange = { birthDate = it },
                    label = { Text("出生日期 YYYY-MM-DD（可空）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = timezone,
                    onValueChange = { timezone = it },
                    label = { Text("时区（如 Asia/Shanghai）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (name.isBlank()) {
                    formError = "显示名不能为空"
                    return@TextButton
                }
                if (birthDate.isNotBlank() && !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(birthDate)) {
                    formError = "出生日期格式不正确"
                    return@TextButton
                }
                onSubmit(
                    CreateMemberRequest(
                        displayName = name.trim(),
                        relationship = relationship,
                        gender = gender,
                        birthDate = birthDate.ifBlank { null },
                        timezone = timezone.ifBlank { null },
                    ) to UpdateMemberRequest(
                        displayName = name.trim(),
                        relationship = relationship,
                        gender = gender,
                        birthDate = birthDate.ifBlank { null },
                        timezone = timezone.ifBlank { null },
                    ),
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

fun relationshipLabel(rel: MemberRelationship): String = when (rel) {
    MemberRelationship.Self -> "本人"
    MemberRelationship.Father -> "父亲"
    MemberRelationship.Mother -> "母亲"
    MemberRelationship.Spouse -> "配偶"
    MemberRelationship.Child -> "子女"
    MemberRelationship.Grandparent -> "祖辈"
    MemberRelationship.OtherFamily -> "其他家人"
    MemberRelationship.Employer -> "雇主"
    MemberRelationship.Other -> "其他"
}

fun genderLabel(gender: Gender?): String = when (gender) {
    Gender.Male -> "男"
    Gender.Female -> "女"
    Gender.Unknown -> "不填"
    null -> "不填"
}
