package com.medontime.app.feature.me

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.AccountDto
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.repository.AuthRepository
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.launch

class MeHomeViewModel(
    private val authRepo: AuthRepository,
    private val memberRepo: MemberRepository,
    private val healthRepo: HealthRepository,
    private val store: SessionStore,
) : ViewModel() {
    var account: AccountDto? by mutableStateOf(null)
        private set
    var members: List<MemberDto> by mutableStateOf(emptyList())
        private set
    var currentMember: MemberDto? by mutableStateOf(null)
        private set
    var unread: Int by mutableStateOf(0)
        private set
    var loading: Boolean by mutableStateOf(true)
        private set

    fun load() {
        loading = true
        viewModelScope.launch {
            account = runCatching { authRepo.me() }.getOrNull()
            members = runCatching { memberRepo.listMembers() }.getOrDefault(emptyList())
            val savedId = store.currentMemberId()
            currentMember = members.firstOrNull { it.id == savedId } ?: members.firstOrNull()
            currentMember?.let { store.setCurrentMemberId(it.id) }
            unread = runCatching { healthRepo.listNotifications(1).unread }.getOrDefault(0)
            loading = false
        }
    }
}

@Composable
fun MeHomeScreen(
    onMembers: () -> Unit,
    onCare: () -> Unit,
    onAuthorizations: () -> Unit,
    onNotifications: () -> Unit,
    onEhr: () -> Unit,
    onStock: () -> Unit,
    onSettings: () -> Unit,
) {
    val container = LocalAppContainer.current
    val vm: MeHomeViewModel = viewModel(
        factory = viewModelFactory {
            MeHomeViewModel(
                container.authRepository,
                container.memberRepository,
                container.healthRepository,
                container.sessionStore,
            )
        },
    )
    LaunchedEffect(Unit) { vm.load() }

    if (vm.loading) {
        LoadingBox()
        return
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("我的", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(vm.account?.nickname ?: "未命名用户", style = MaterialTheme.typography.titleLarge)
                Text(
                    "当前成员：${vm.currentMember?.displayName ?: "未设置"} · 共 ${vm.members.size} 位成员",
                    style = MaterialTheme.typography.bodyLarge,
                )
                vm.account?.let {
                    Text(
                        "账号状态：${accountStatusLabel(it.status.name)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        MeEntry("成员管理", "添加/编辑家庭成员、切换当前成员", onMembers)
        MeEntry("关怀与提醒设置", "关怀模式大字、提醒周期、锁屏显示、通知渠道", onCare)
        MeEntry("照护授权", "邀请家人代管、处理收到的授权", onAuthorizations)
        MeEntry("消息中心", if (vm.unread > 0) "${vm.unread} 条未读提醒记录" else "提醒投递记录", onNotifications)
        MeEntry("健康档案", "过敏档案、服药后不适、紧急联系人、病历摘要", onEhr)
        MeEntry("药品库存", "余量与到期预警、补货登记", onStock)
        MeEntry("设置", "服务器地址、登录设备、账号注销说明、退出登录", onSettings)
    }
}

@Composable
private fun MeEntry(title: String, subtitle: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable(onClick = onClick),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text("›", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

fun accountStatusLabel(name: String): String = when (name) {
    "Active" -> "正常"
    "Frozen" -> "已冻结"
    "Cancelling" -> "注销冷静期中"
    "Cancelled" -> "已注销"
    else -> name
}
