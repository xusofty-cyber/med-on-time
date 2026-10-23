package com.medontime.app.feature.me

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.medontime.app.data.model.AdjustStockRequest
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.StockItemDto
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.launch

class StockViewModel(
    private val memberRepo: MemberRepository,
    private val healthRepo: HealthRepository,
    private val store: SessionStore,
) : ViewModel() {
    var member: MemberDto? by mutableStateOf(null)
        private set
    var items: List<StockItemDto> by mutableStateOf(emptyList())
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
                member = current
                if (current != null) {
                    items = healthRepo.listStock(current.id).items
                }
            } catch (e: ApiException) {
                error = e.message
            } finally {
                loading = false
            }
        }
    }

    fun restock(item: StockItemDto, amount: Double, expiryDate: String?) {
        val memberId = member?.id ?: return
        viewModelScope.launch {
            try {
                healthRepo.adjustStock(
                    memberId,
                    AdjustStockRequest(
                        drugId = item.drugId,
                        changeType = "restock",
                        changeAmount = amount,
                        expiryDate = expiryDate,
                    ),
                )
                message = "补货已登记"
                load()
            } catch (e: ApiException) {
                message = "登记失败：${e.message}"
            }
        }
    }

    fun manualAdjust(item: StockItemDto, newQuantity: Double, note: String) {
        val memberId = member?.id ?: return
        val delta = newQuantity - item.stockQuantity
        if (delta == 0.0) {
            message = "数量未变化"
            return
        }
        viewModelScope.launch {
            try {
                healthRepo.adjustStock(
                    memberId,
                    AdjustStockRequest(
                        drugId = item.drugId,
                        changeType = "manual_adjust",
                        changeAmount = delta,
                        note = note.ifBlank { "App 端盘点修正" },
                    ),
                )
                message = "库存已修正"
                load()
            } catch (e: ApiException) {
                message = "修正失败：${e.message}"
            }
        }
    }
}

@Composable
fun StockScreen() {
    val container = LocalAppContainer.current
    val vm: StockViewModel = viewModel(
        factory = viewModelFactory {
            StockViewModel(container.memberRepository, container.healthRepository, container.sessionStore)
        },
    )
    var adjusting by remember { mutableStateOf<StockItemDto?>(null) }

    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("药品库存", style = MaterialTheme.typography.headlineSmall)
        vm.member?.let {
            Text("当前成员：${it.displayName}", style = MaterialTheme.typography.bodyLarge)
        }
        vm.message?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 4.dp))
        }
        when {
            vm.loading -> LoadingBox()
            vm.error != null -> ErrorBox(vm.error!!, onRetry = { vm.load() })
            vm.items.isEmpty() -> EmptyBox("暂无库存记录（打卡服药后自动扣减，补货可在此登记）")
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(vm.items, key = { it.memberMedicationId }) { item ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "${item.drug.genericName} ${item.drug.specification}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                "余量 ${trimNum(item.stockQuantity)}${item.stockUnit}" +
                                    (item.estimatedDaysLeft?.let { " · 约可服 $it 天" } ?: ""),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            item.currentBatchExpiryDate?.let {
                                Text(
                                    "到期日 $it（${expiryLabel(item)}）",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (item.expiryStatus == "expired" || item.expiryStatus == "expiring_soon") {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                )
                            }
                            item.storageLocation?.let {
                                Text("存放位置：$it", style = MaterialTheme.typography.bodyMedium)
                            }
                            if (item.alerts.isNotEmpty()) {
                                Text(
                                    "预警：${item.alerts.joinToString("、") { alertLabel(it) }}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                            CareTextButton(text = "补货 / 盘点修正", onClick = { adjusting = item })
                        }
                    }
                }
            }
        }
    }

    adjusting?.let { item ->
        StockAdjustDialog(
            item = item,
            onDismiss = { adjusting = null },
            onRestock = { amount, expiry ->
                vm.restock(item, amount, expiry)
                adjusting = null
            },
            onAdjust = { newQty, note ->
                vm.manualAdjust(item, newQty, note)
                adjusting = null
            },
        )
    }
}

@Composable
private fun StockAdjustDialog(
    item: StockItemDto,
    onDismiss: () -> Unit,
    onRestock: (Double, String?) -> Unit,
    onAdjust: (Double, String) -> Unit,
) {
    var mode by remember { mutableStateOf("restock") }
    var amount by remember { mutableStateOf("") }
    var expiry by remember { mutableStateOf("") }
    var newQty by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.drug.genericName) },
        text = {
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.FilterChip(
                        selected = mode == "restock",
                        onClick = { mode = "restock" },
                        label = { Text("补货") },
                    )
                    androidx.compose.material3.FilterChip(
                        selected = mode == "adjust",
                        onClick = { mode = "adjust" },
                        label = { Text("盘点修正") },
                    )
                }
                if (mode == "restock") {
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { amount = it },
                        label = { Text("补货数量（${item.stockUnit}）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                    OutlinedTextField(
                        value = expiry,
                        onValueChange = { expiry = it },
                        label = { Text("新批次到期日 YYYY-MM-DD（可空）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    )
                } else {
                    OutlinedTextField(
                        value = newQty,
                        onValueChange = { newQty = it },
                        label = { Text("实际余量（当前 ${trimNum(item.stockQuantity)}${item.stockUnit}）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        label = { Text("修正原因（必填）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    )
                }
                formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (mode == "restock") {
                    val value = amount.toDoubleOrNull()
                    if (value == null || value <= 0) {
                        formError = "补货数量须大于 0"
                        return@TextButton
                    }
                    if (expiry.isNotBlank() && !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(expiry)) {
                        formError = "到期日格式不正确"
                        return@TextButton
                    }
                    onRestock(value, expiry.ifBlank { null })
                } else {
                    val value = newQty.toDoubleOrNull()
                    if (value == null || value < 0) {
                        formError = "实际余量不正确"
                        return@TextButton
                    }
                    if (note.isBlank()) {
                        formError = "盘点修正须填写原因"
                        return@TextButton
                    }
                    onAdjust(value, note)
                }
            }) { Text("提交") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

private fun trimNum(v: Double): String = if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

private fun expiryLabel(item: StockItemDto): String = when (item.expiryStatus) {
    "expired" -> "已过期"
    "expiring_soon" -> "即将到期"
    "ok" -> "正常"
    else -> "未知"
}

private fun alertLabel(alert: String): String = when (alert) {
    "expired" -> "已过期"
    "expiring_soon" -> "临近到期"
    "depleted" -> "已用完"
    "low_stock" -> "余量不足"
    else -> alert
}
