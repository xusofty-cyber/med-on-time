package com.medontime.app.feature.plan

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
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
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.PlanDto
import com.medontime.app.data.model.PlanStatus
import com.medontime.app.data.model.PlanType
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.data.repository.PlanRepository
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

data class PlanListUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val members: List<MemberDto> = emptyList(),
    val currentMember: MemberDto? = null,
    val plans: List<PlanDto> = emptyList(),
    val message: String? = null,
)

class PlanListViewModel(
    private val store: SessionStore,
    private val memberRepo: MemberRepository,
    private val planRepo: PlanRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(PlanListUiState())
    val state: StateFlow<PlanListUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val members = memberRepo.listMembers()
                val savedId = store.currentMemberId()
                val current = members.firstOrNull { it.id == savedId } ?: members.firstOrNull()
                if (current == null) {
                    _state.update { it.copy(loading = false, members = emptyList(), plans = emptyList()) }
                    return@launch
                }
                store.setCurrentMemberId(current.id)
                val plans = planRepo.listPlans(current.id)
                _state.update {
                    it.copy(loading = false, members = members, currentMember = current, plans = plans)
                }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "加载失败") }
            }
        }
    }

    fun selectMember(member: MemberDto) {
        viewModelScope.launch { store.setCurrentMemberId(member.id) }
        _state.update { it.copy(currentMember = member) }
        load()
    }

    private fun mutate(block: suspend () -> Unit, done: String) {
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

    fun pause(plan: PlanDto) = mutate({ planRepo.pausePlan(plan.id) }, "已暂停")
    fun resume(plan: PlanDto) = mutate({ planRepo.resumePlan(plan.id) }, "已恢复")
    fun delete(plan: PlanDto) = mutate({ planRepo.deletePlan(plan.id) }, "已删除")
}

@Composable
fun PlanListScreen(onCreatePlan: (memberId: String) -> Unit, onEditPlan: (memberId: String, planId: String) -> Unit) {
    val container = LocalAppContainer.current
    val vm: PlanListViewModel = viewModel(
        factory = viewModelFactory {
            PlanListViewModel(container.sessionStore, container.memberRepository, container.planRepository)
        },
    )
    val state by vm.state.collectAsState()
    var pendingDelete by remember { mutableStateOf<PlanDto?>(null) }

    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("用药计划", style = MaterialTheme.typography.headlineSmall)
        if (state.members.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
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
        state.currentMember?.let { member ->
            CareButton(
                text = "＋ 新建计划",
                onClick = { onCreatePlan(member.id) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        state.message?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 4.dp))
        }
        Spacer(Modifier.height(8.dp))
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorBox(state.error!!, onRetry = { vm.load() })
            state.currentMember == null -> EmptyBox("还没有成员档案，请先到「我的」里添加成员")
            state.plans.isEmpty() -> EmptyBox("该成员还没有用药计划")
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.plans, key = { it.id }) { plan ->
                    PlanCard(
                        plan = plan,
                        onEdit = { onEditPlan(plan.memberId, plan.id) },
                        onPause = { vm.pause(plan) },
                        onResume = { vm.resume(plan) },
                        onDelete = { pendingDelete = plan },
                    )
                }
            }
        }
    }

    pendingDelete?.let { plan ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除计划") },
            text = { Text("确认删除「${plan.name}」？已生成的历史打卡记录不受影响。") },
            confirmButton = {
                TextButton(onClick = { vm.delete(plan); pendingDelete = null }) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun PlanCard(
    plan: PlanDto,
    onEdit: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onDelete: () -> Unit,
) {
    val statusText = when (plan.status) {
        PlanStatus.Active -> "进行中"
        PlanStatus.Paused -> "已暂停"
        PlanStatus.Finished -> "已结束"
        PlanStatus.Stopped -> "已停止"
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(plan.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                Text(
                    if (plan.planType == PlanType.Prn) "按需(PRN)" else "常规",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                "$statusText · ${plan.startDate}${plan.endDate?.let { " 至 $it" } ?: ""}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            plan.items.forEach { item ->
                val times = item.frequencyRule.times.joinToString("、")
                Text(
                    "· ${item.drugNameSnapshot ?: ""} ${item.doseAmount}${item.doseUnit}${if (times.isNotBlank()) " · $times" else ""}",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            plan.storageLocation?.let {
                Text("存放位置：$it", style = MaterialTheme.typography.bodyMedium)
            }
            plan.additionalNote?.let {
                Text("备注：$it", style = MaterialTheme.typography.bodyMedium)
            }
            if (plan.planType == PlanType.Prn) {
                Text(
                    "按需服用：最小间隔 ${plan.prnMinIntervalMinutes ?: "—"} 分钟 · 单日上限 ${plan.prnMaxPerDay ?: "—"} 次",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                CareTextButton(text = "编辑", onClick = onEdit)
                if (plan.status == PlanStatus.Active) {
                    CareTextButton(text = "暂停", onClick = onPause)
                }
                if (plan.status == PlanStatus.Paused) {
                    CareTextButton(text = "恢复", onClick = onResume)
                }
                CareTextButton(text = "删除", onClick = onDelete)
            }
        }
    }
}
