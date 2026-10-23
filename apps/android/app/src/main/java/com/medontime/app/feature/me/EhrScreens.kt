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
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.AdverseRecordDto
import com.medontime.app.data.model.AllergyDto
import com.medontime.app.data.model.CreateAdverseRecordRequest
import com.medontime.app.data.model.CreateEmergencyContactRequest
import com.medontime.app.data.model.EmergencyContactDto
import com.medontime.app.data.model.MedicalRecordDto
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.Severity
import com.medontime.app.data.model.UpsertMedicalRecordRequest
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.launch
import java.time.Instant

/** 服药后不适症状标签字典（DB 注释口径，system_config 可扩展）。 */
val SYMPTOM_TAGS: List<Pair<String, String>> = listOf(
    "dizzy" to "头晕",
    "nausea" to "恶心",
    "rash" to "皮疹",
    "palpitation" to "心悸",
    "stomachache" to "胃痛",
    "sleepiness" to "嗜睡",
    "other" to "其他",
)

class EhrViewModel(
    private val memberRepo: MemberRepository,
    private val healthRepo: HealthRepository,
    private val store: SessionStore,
) : ViewModel() {
    var member: MemberDto? by mutableStateOf(null)
        private set
    var allergies: List<AllergyDto> by mutableStateOf(emptyList())
        private set
    var adverse: List<AdverseRecordDto> by mutableStateOf(emptyList())
        private set
    var contacts: List<EmergencyContactDto> by mutableStateOf(emptyList())
        private set
    var medical: MedicalRecordDto? by mutableStateOf(null)
        private set
    var loading: Boolean by mutableStateOf(true)
        private set
    var message: String? by mutableStateOf(null)
        private set

    fun load() {
        loading = true
        viewModelScope.launch {
            val members = runCatching { memberRepo.listMembers() }.getOrDefault(emptyList())
            val savedId = store.currentMemberId()
            val current = members.firstOrNull { it.id == savedId } ?: members.firstOrNull()
            member = current
            if (current != null) {
                allergies = runCatching { healthRepo.allergies(current.id) }.getOrDefault(emptyList())
                adverse = runCatching { healthRepo.adverseRecords(current.id).items }.getOrDefault(emptyList())
                contacts = runCatching { healthRepo.emergencyContacts(current.id) }.getOrDefault(emptyList())
                medical = runCatching { healthRepo.medicalRecord(current.id) }.getOrNull()
            }
            loading = false
        }
    }

    private fun done(text: String) {
        message = text
        load()
    }

    fun saveAllergies(items: List<AllergyDto>) {
        val id = member?.id ?: return
        viewModelScope.launch {
            try {
                healthRepo.putAllergies(id, items)
                done("过敏档案已保存")
            } catch (e: ApiException) {
                message = "保存失败：${e.message}"
            }
        }
    }

    fun addAdverse(tags: List<String>, description: String, severity: Severity) {
        val id = member?.id ?: return
        viewModelScope.launch {
            try {
                healthRepo.createAdverse(
                    id,
                    CreateAdverseRecordRequest(
                        symptomTags = tags,
                        description = description.ifBlank { null },
                        severity = severity,
                        occurredAt = Instant.now().toString(),
                    ),
                )
                done("不适记录已添加")
            } catch (e: ApiException) {
                message = "添加失败：${e.message}"
            }
        }
    }

    fun addContact(name: String, phone: String, relationship: String) {
        val id = member?.id ?: return
        viewModelScope.launch {
            try {
                healthRepo.createEmergencyContact(
                    id,
                    CreateEmergencyContactRequest(contactName = name, phone = phone, relationship = relationship),
                )
                done("紧急联系人已添加")
            } catch (e: ApiException) {
                message = "添加失败：${e.message}"
            }
        }
    }

    fun deleteContact(contact: EmergencyContactDto) {
        val id = member?.id ?: return
        viewModelScope.launch {
            try {
                healthRepo.deleteEmergencyContact(id, contact.id)
                done("已删除")
            } catch (e: ApiException) {
                message = "删除失败：${e.message}"
            }
        }
    }

    fun saveMedical(request: UpsertMedicalRecordRequest) {
        val id = member?.id ?: return
        viewModelScope.launch {
            try {
                healthRepo.upsertMedicalRecord(id, request)
                done("病历摘要已保存（服务端加密存储）")
            } catch (e: ApiException) {
                message = "保存失败：${e.message}"
            }
        }
    }
}

@Composable
fun EhrScreen() {
    val container = LocalAppContainer.current
    val vm: EhrViewModel = viewModel(
        factory = viewModelFactory {
            EhrViewModel(container.memberRepository, container.healthRepository, container.sessionStore)
        },
    )
    LaunchedEffect(Unit) { vm.load() }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        Text("健康档案", style = MaterialTheme.typography.headlineSmall)
        when {
            vm.loading -> LoadingBox()
            vm.member == null -> EmptyBox("还没有成员档案，请先添加成员")
            else -> {
                Text(
                    "当前成员：${vm.member!!.displayName}",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(top = 4.dp),
                )
                vm.message?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 4.dp))
                }
                AllergySection(vm)
                AdverseSection(vm)
                ContactsSection(vm)
                MedicalSection(vm)
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun AllergySection(vm: EhrViewModel) {
    var draft by remember(vm.allergies) { mutableStateOf(vm.allergies) }
    var newName by remember { mutableStateOf("") }
    var newSeverity by remember { mutableStateOf(Severity.Moderate) }

    SectionTitle("过敏档案")
    if (draft.isEmpty()) {
        Text("暂无过敏记录", style = MaterialTheme.typography.bodyMedium)
    }
    draft.forEachIndexed { index, allergy ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(allergy.allergen, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "程度：${severityLabel(allergy.severity)} ${allergy.reaction ?: ""}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                CareTextButton(text = "移除", onClick = { draft = draft.filterIndexed { i, _ -> i != index } })
            }
        }
    }
    OutlinedTextField(
        value = newName,
        onValueChange = { newName = it },
        label = { Text("新增过敏原（如：青霉素）") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
        Severity.entries.forEach { sev ->
            FilterChip(
                selected = newSeverity == sev,
                onClick = { newSeverity = sev },
                label = { Text(severityLabel(sev)) },
            )
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CareTextButton(
            text = "加入列表",
            onClick = {
                if (newName.isNotBlank()) {
                    draft = draft + AllergyDto(allergen = newName.trim(), severity = newSeverity)
                    newName = ""
                }
            },
        )
        CareButton(text = "保存过敏档案", onClick = { vm.saveAllergies(draft) })
    }
    Text(
        "过敏档案为全量保存：列表即该成员的完整档案（命中在用药品时服务端强警告）。",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun AdverseSection(vm: EhrViewModel) {
    var tags by remember { mutableStateOf<Set<String>>(emptySet()) }
    var description by remember { mutableStateOf("") }
    var severity by remember { mutableStateOf(Severity.Mild) }

    SectionTitle("服药后不适记录")
    if (vm.adverse.isEmpty()) {
        Text("暂无记录", style = MaterialTheme.typography.bodyMedium)
    }
    vm.adverse.take(10).forEach { record ->
        val tagText = record.symptomTags.joinToString("、") { tag -> SYMPTOM_TAGS.firstOrNull { it.first == tag }?.second ?: tag }
        Text(
            "${record.occurredAt.replace('T', ' ').take(16)} · $tagText · ${severityLabel(record.severity)} ${record.description ?: ""}",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(vertical = 2.dp),
        )
    }
    Text("记录一次不适", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
        SYMPTOM_TAGS.take(4).forEach { (value, label) ->
            FilterChip(
                selected = value in tags,
                onClick = { tags = if (value in tags) tags - value else tags + value },
                label = { Text(label) },
            )
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SYMPTOM_TAGS.drop(4).forEach { (value, label) ->
            FilterChip(
                selected = value in tags,
                onClick = { tags = if (value in tags) tags - value else tags + value },
                label = { Text(label) },
            )
        }
        Severity.entries.forEach { sev ->
            FilterChip(
                selected = severity == sev,
                onClick = { severity = sev },
                label = { Text(severityLabel(sev)) },
            )
        }
    }
    OutlinedTextField(
        value = description,
        onValueChange = { description = it },
        label = { Text("描述（可选）") },
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
    )
    CareButton(
        text = "提交不适记录",
        onClick = {
            vm.addAdverse(tags.toList(), description, severity)
            tags = emptySet()
            description = ""
        },
        modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun ContactsSection(vm: EhrViewModel) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }

    SectionTitle("紧急联系人（最多 3 位）")
    vm.contacts.forEach { contact ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("${contact.contactName}（${contact.relationship}）", style = MaterialTheme.typography.bodyLarge)
                    Text(contact.phone ?: "", style = MaterialTheme.typography.bodyMedium)
                }
                CareTextButton(text = "删除", onClick = { vm.deleteContact(contact) })
            }
        }
    }
    OutlinedTextField(
        value = name,
        onValueChange = { name = it },
        label = { Text("姓名") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
    )
    OutlinedTextField(
        value = phone,
        onValueChange = { phone = it },
        label = { Text("电话") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
    )
    OutlinedTextField(
        value = relationship,
        onValueChange = { relationship = it },
        label = { Text("关系（如：长女、社区医生）") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
    )
    CareButton(
        text = "添加联系人",
        onClick = {
            if (name.isNotBlank() && phone.isNotBlank() && relationship.isNotBlank()) {
                vm.addContact(name.trim(), phone.trim(), relationship.trim())
                name = ""; phone = ""; relationship = ""
            }
        },
        modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun MedicalSection(vm: EhrViewModel) {
    var bloodType by remember(vm.medical) { mutableStateOf(vm.medical?.bloodType ?: "") }
    var height by remember(vm.medical) { mutableStateOf(vm.medical?.heightCm?.toString() ?: "") }
    var weight by remember(vm.medical) { mutableStateOf(vm.medical?.weightKg?.toString() ?: "") }
    var hospital by remember(vm.medical) { mutableStateOf(vm.medical?.primaryHospital ?: "") }
    var summary by remember(vm.medical) { mutableStateOf(vm.medical?.summary ?: "") }

    SectionTitle("病历摘要（一人一份，正文加密存储）")
    OutlinedTextField(
        value = bloodType,
        onValueChange = { bloodType = it },
        label = { Text("血型（A/B/AB/O/unknown）") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
        OutlinedTextField(
            value = height,
            onValueChange = { height = it },
            label = { Text("身高 cm") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = weight,
            onValueChange = { weight = it },
            label = { Text("体重 kg") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
    }
    OutlinedTextField(
        value = hospital,
        onValueChange = { hospital = it },
        label = { Text("常去医院") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
    )
    OutlinedTextField(
        value = summary,
        onValueChange = { summary = it },
        label = { Text("病情摘要") },
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        minLines = 3,
    )
    CareButton(
        text = "保存病历摘要",
        onClick = {
            vm.saveMedical(
                UpsertMedicalRecordRequest(
                    bloodType = bloodType.ifBlank { null },
                    heightCm = height.toDoubleOrNull(),
                    weightKg = weight.toDoubleOrNull(),
                    primaryHospital = hospital.ifBlank { null },
                    summary = summary.ifBlank { null },
                ),
            )
        },
        modifier = Modifier.padding(top = 8.dp),
    )
}

fun severityLabel(severity: Severity?): String = when (severity) {
    Severity.Mild -> "轻微"
    Severity.Moderate -> "中等"
    Severity.Severe -> "严重"
    null -> "未标注"
}
