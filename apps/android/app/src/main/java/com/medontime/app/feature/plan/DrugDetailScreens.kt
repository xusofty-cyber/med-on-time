package com.medontime.app.feature.plan

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.medontime.app.data.model.DrugDto
import com.medontime.app.data.model.DrugInteractionsDto
import com.medontime.app.data.repository.PlanRepository
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

class DrugDetailViewModel(private val repo: PlanRepository) : ViewModel() {
    var drug: DrugDto? by mutableStateOf(null)
        private set
    var interactions: DrugInteractionsDto? by mutableStateOf(null)
        private set
    var error: String? by mutableStateOf(null)
        private set
    var loading: Boolean by mutableStateOf(true)
        private set

    fun load(drugId: String) {
        loading = true
        error = null
        viewModelScope.launch {
            try {
                drug = repo.drugDetail(drugId)
                interactions = runCatching { repo.drugInteractions(drugId) }.getOrNull()
            } catch (e: ApiException) {
                error = e.message
            } catch (e: Exception) {
                error = e.message ?: "加载失败"
            } finally {
                loading = false
            }
        }
    }
}

@Composable
fun DrugDetailScreen(drugId: String) {
    val container = LocalAppContainer.current
    val vm: DrugDetailViewModel = viewModel(factory = viewModelFactory { DrugDetailViewModel(container.planRepository) })
    LaunchedEffect(drugId) { vm.load(drugId) }

    when {
        vm.loading -> LoadingBox()
        vm.error != null -> ErrorBox(vm.error!!, onRetry = { vm.load(drugId) })
        vm.drug == null -> ErrorBox("药品不存在")
        else -> {
            val drug = vm.drug!!
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            ) {
                Text(drug.genericName, style = MaterialTheme.typography.headlineSmall)
                drug.brandName?.let { Text("商品名：$it", style = MaterialTheme.typography.bodyLarge) }
                Text(
                    "${drug.specification} · ${drug.unit}",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                drug.manufacturer?.let { Text("生产企业：$it", style = MaterialTheme.typography.bodyMedium) }
                drug.approvalNumber?.let { Text("批准文号：$it", style = MaterialTheme.typography.bodyMedium) }
                if (drug.sourceType == "user_custom") {
                    Text(
                        "自建药品（未经平台核验，仅供记录）",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                LabelSection("适应症", drug.efficacy)
                LabelSection("用法用量", usageTextOf(drug))
                LabelSection("禁忌", drug.contraindications)
                LabelSection("不良反应", drug.adverseReactions)
                LabelSection("贮藏", drug.storageCondition)

                SectionTitle("药物相互作用（说明书原文）")
                val inter = vm.interactions
                if (inter?.labelInteractionEntries?.isNotEmpty() == true) {
                    inter.labelInteractionEntries.forEach { entry ->
                        Text("· $entry", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(vertical = 2.dp))
                    }
                } else {
                    Text(inter?.labelInteractionsText ?: drug.interactions ?: "说明书未载明", style = MaterialTheme.typography.bodyLarge)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    inter?.oncHighPriorityCheck?.note ?: "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun LabelSection(title: String, body: String?) {
    if (body.isNullOrBlank()) return
    SectionTitle(title)
    Text(body, style = MaterialTheme.typography.bodyLarge)
}

/** usage_default 为 JsonB：优先取 text 字段，否则整体转字符串展示。 */
private fun usageTextOf(drug: DrugDto): String? {
    val el = drug.usageDefault ?: return null
    if (el is JsonObject) {
        el["text"]?.jsonPrimitive?.content?.let { return it }
    }
    return el.toString().trim('"')
}
