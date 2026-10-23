package com.medontime.app.feature.plan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.model.CourseType
import com.medontime.app.data.model.DrugDto
import com.medontime.app.data.model.FrequencyRule
import com.medontime.app.data.model.FrequencyType
import com.medontime.app.data.model.MealRelation
import com.medontime.app.data.model.PlanDto
import com.medontime.app.data.model.PlanHistoryDto
import com.medontime.app.data.model.PlanItemInput
import com.medontime.app.data.model.PlanItemPatchInput
import com.medontime.app.data.model.PlanPhaseInput
import com.medontime.app.data.model.PlanPhasePatchInput
import com.medontime.app.data.model.PlanType
import com.medontime.app.data.model.CreatePlanRequest
import com.medontime.app.data.model.UpdatePlanRequest
import com.medontime.app.data.repository.PlanRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class PlanItemForm(
    val key: Long,
    val itemId: String? = null,
    val drug: DrugDto? = null,
    val doseAmount: String = "1",
    val doseUnit: String = "片",
    val frequencyType: FrequencyType = FrequencyType.Daily,
    val timesText: String = "08:00",
    val weekdays: Set<Int> = (1..7).toSet(),
    val intervalDays: String = "2",
    val cycleDays: String = "7",
    val onDays: String = "5",
    val mealRelation: MealRelation = MealRelation.None,
    val courseType: CourseType = CourseType.LongTerm,
    val courseDays: String = "",
)

data class PlanPhaseForm(
    val key: Long,
    val phaseId: String? = null,
    val targetItemKey: Long? = null,
    val stageNo: String = "1",
    val durationDays: String = "7",
    val dailyDoseAmount: String = "1",
    val dailyDoseUnit: String = "片",
    val isFinalStop: Boolean = false,
    val note: String = "",
)

data class PlanEditUiState(
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val isEdit: Boolean = false,
    val name: String = "",
    val planType: PlanType = PlanType.Scheduled,
    val startDate: String = LocalDate.now().toString(),
    val endDate: String = "",
    val note: String = "",
    val storageLocation: String = "",
    val additionalNote: String = "",
    val prnMinInterval: String = "240",
    val prnMaxPerDay: String = "3",
    val items: List<PlanItemForm> = listOf(PlanItemForm(key = 1L)),
    val phases: List<PlanPhaseForm> = emptyList(),
    val searching: Boolean = false,
    val searchResults: List<DrugDto> = emptyList(),
    val history: List<PlanHistoryDto> = emptyList(),
)

class PlanEditViewModel(private val repo: PlanRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlanEditUiState())
    val state: StateFlow<PlanEditUiState> = _state.asStateFlow()
    private var nextKey = 100L
    private var editingPlanId: String? = null

    fun initForEdit(planId: String?) {
        if (planId == null) return
        if (editingPlanId == planId) return
        editingPlanId = planId
        _state.update { it.copy(loading = true, isEdit = true) }
        viewModelScope.launch {
            try {
                val plan = repo.getPlan(planId)
                _state.update { s -> s.copy(loading = false, isEdit = true).applyPlan(plan) }
                runCatching { repo.planHistory(planId) }.onSuccess { page ->
                    _state.update { it.copy(history = page.items) }
                }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    private fun PlanEditUiState.applyPlan(plan: PlanDto): PlanEditUiState {
        val itemForms = plan.items.mapIndexed { idx, item ->
            PlanItemForm(
                key = 1000L + idx,
                itemId = item.id,
                drug = DrugDto(
                    id = item.drugId,
                    genericName = item.drugNameSnapshot ?: "",
                    specification = "",
                    unit = item.doseUnit,
                ),
                doseAmount = trimNumber(item.doseAmount),
                doseUnit = item.doseUnit,
                frequencyType = item.frequencyType,
                timesText = item.frequencyRule.times.joinToString(",").ifBlank { "08:00" },
                weekdays = item.frequencyRule.weekdays.toSet().ifEmpty { (1..7).toSet() },
                intervalDays = (item.frequencyRule.intervalDays ?: 2).toString(),
                cycleDays = (item.frequencyRule.cycleDays ?: 7).toString(),
                onDays = (item.frequencyRule.onDays ?: 5).toString(),
                mealRelation = item.mealRelation,
                courseType = item.courseType,
                courseDays = item.courseDays?.toString() ?: "",
            )
        }
        nextKey = 2000L
        val itemKeyById = itemForms.associateBy({ it.itemId }, { it.key })
        val phaseForms = plan.phases.mapIndexed { idx, phase ->
            PlanPhaseForm(
                key = 3000L + idx,
                phaseId = phase.id,
                targetItemKey = phase.planItemId?.let { itemKeyById[it] },
                stageNo = phase.stageNo.toString(),
                durationDays = phase.durationDays.toString(),
                dailyDoseAmount = trimNumber(phase.dailyDoseAmount),
                dailyDoseUnit = phase.dailyDoseUnit,
                isFinalStop = phase.isFinalStop,
                note = phase.note ?: "",
            )
        }
        return copy(
            name = plan.name,
            planType = plan.planType,
            startDate = plan.startDate,
            endDate = plan.endDate ?: "",
            note = plan.note ?: "",
            storageLocation = plan.storageLocation ?: "",
            additionalNote = plan.additionalNote ?: "",
            prnMinInterval = plan.prnMinIntervalMinutes?.toString() ?: "240",
            prnMaxPerDay = plan.prnMaxPerDay?.toString() ?: "3",
            items = itemForms.ifEmpty { listOf(PlanItemForm(key = 1L)) },
            phases = phaseForms,
        )
    }

    fun update(transform: (PlanEditUiState) -> PlanEditUiState) = _state.update(transform)

    fun updateItem(key: Long, transform: (PlanItemForm) -> PlanItemForm) {
        _state.update { s -> s.copy(items = s.items.map { if (it.key == key) transform(it) else it }) }
    }

    fun addItem() {
        val key = ++nextKey
        _state.update { it.copy(items = it.items + PlanItemForm(key = key)) }
    }

    fun removeItem(key: Long) {
        _state.update { s ->
            if (s.items.size <= 1) s else s.copy(items = s.items.filterNot { it.key == key })
        }
    }

    fun updatePhase(key: Long, transform: (PlanPhaseForm) -> PlanPhaseForm) {
        _state.update { s -> s.copy(phases = s.phases.map { if (it.key == key) transform(it) else it }) }
    }

    fun addPhase() {
        val key = ++nextKey
        val nextStage = (_state.value.phases.size + 1).toString()
        _state.update { it.copy(phases = it.phases + PlanPhaseForm(key = key, stageNo = nextStage)) }
    }

    fun removePhase(key: Long) {
        _state.update { it.copy(phases = it.phases.filterNot { ph -> ph.key == key }) }
    }

    fun searchDrugs(query: String) {
        if (query.isBlank()) return
        _state.update { it.copy(searching = true) }
        viewModelScope.launch {
            runCatching { repo.searchDrugs(query) }
                .onSuccess { page -> _state.update { it.copy(searching = false, searchResults = page.items) } }
                .onFailure { _state.update { it.copy(searching = false, searchResults = emptyList()) } }
        }
    }

    fun save(memberId: String, planId: String?) {
        val s = _state.value
        val validationError = validate(s)
        if (validationError != null) {
            _state.update { it.copy(error = validationError) }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                if (planId == null) {
                    repo.createPlan(memberId, s.toCreateRequest())
                } else {
                    repo.updatePlan(planId, s.toUpdateRequest())
                }
                _state.update { it.copy(saving = false, saved = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(saving = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "保存失败") }
            }
        }
    }

    private fun validate(s: PlanEditUiState): String? {
        if (s.name.isBlank()) return "请填写计划名称"
        if (!DATE_REGEX.matches(s.startDate)) return "开始日期格式应为 YYYY-MM-DD"
        if (s.endDate.isNotBlank() && !DATE_REGEX.matches(s.endDate)) return "结束日期格式应为 YYYY-MM-DD"
        if (s.items.isEmpty()) return "至少添加一种药品"
        for (item in s.items) {
            if (item.drug == null) return "有药品明细尚未选择药品"
            if ((item.doseAmount.toDoubleOrNull() ?: 0.0) <= 0) return "剂量须大于 0"
            if (item.frequencyType != FrequencyType.OnDemand) {
                val times = parseTimes(item.timesText)
                if (times.isEmpty()) return "请填写服药时刻（如 08:00,20:00）"
                if (times.any { !TIME_REGEX.matches(it) }) return "服药时刻格式不正确：${item.timesText}"
            }
            if (item.courseType == CourseType.FixedDays && (item.courseDays.toIntOrNull() ?: 0) <= 0) {
                return "固定天数疗程须填写疗程天数"
            }
        }
        if (s.planType == PlanType.Prn) {
            if ((s.prnMinInterval.toIntOrNull() ?: 0) <= 0) return "PRN 须填写最小间隔（分钟）"
            if ((s.prnMaxPerDay.toIntOrNull() ?: 0) <= 0) return "PRN 须填写单日上限（次）"
        }
        for (phase in s.phases) {
            if ((phase.stageNo.toIntOrNull() ?: 0) <= 0) return "阶段序号须为正整数"
            if ((phase.durationDays.toIntOrNull() ?: 0) <= 0) return "阶段时长须大于 0"
            if ((phase.dailyDoseAmount.toDoubleOrNull() ?: 0.0) <= 0) return "阶段每日剂量须大于 0"
        }
        return null
    }

    private fun PlanItemForm.rule(): FrequencyRule = when (frequencyType) {
        FrequencyType.Daily, FrequencyType.TimesPerDay -> FrequencyRule(times = parseTimes(timesText))
        FrequencyType.Weekly -> FrequencyRule(times = parseTimes(timesText), weekdays = weekdays.sorted())
        FrequencyType.IntervalDays -> FrequencyRule(
            times = parseTimes(timesText),
            intervalDays = intervalDays.toIntOrNull() ?: 2,
        )
        FrequencyType.CourseCycle -> FrequencyRule(
            times = parseTimes(timesText),
            cycleDays = cycleDays.toIntOrNull() ?: 7,
            onDays = onDays.toIntOrNull() ?: 5,
        )
        FrequencyType.OnDemand -> FrequencyRule()
    }

    private fun PlanEditUiState.toCreateRequest(): CreatePlanRequest = CreatePlanRequest(
        name = name.trim(),
        planType = planType,
        startDate = startDate,
        endDate = endDate.ifBlank { null },
        note = note.ifBlank { null },
        storageLocation = storageLocation.ifBlank { null },
        additionalNote = additionalNote.ifBlank { null },
        prnMinIntervalMinutes = if (planType == PlanType.Prn) prnMinInterval.toIntOrNull() else null,
        prnMaxPerDay = if (planType == PlanType.Prn) prnMaxPerDay.toIntOrNull() else null,
        items = items.mapIndexed { idx, form ->
            PlanItemInput(
                drugId = form.drug!!.id,
                doseAmount = form.doseAmount.toDouble(),
                doseUnit = form.doseUnit,
                frequencyType = form.frequencyType,
                frequencyRule = form.rule(),
                mealRelation = form.mealRelation,
                courseType = form.courseType,
                courseDays = if (form.courseType == CourseType.FixedDays) form.courseDays.toIntOrNull() else null,
                sortOrder = idx,
            )
        },
        phases = if (planType == PlanType.Scheduled && phases.isNotEmpty()) {
            phases.map { phase ->
                PlanPhaseInput(
                    planItemIndex = phase.targetItemKey?.let { key -> items.indexOfFirst { it.key == key } }?.takeIf { it >= 0 },
                    stageNo = phase.stageNo.toInt(),
                    durationDays = phase.durationDays.toInt(),
                    dailyDoseAmount = phase.dailyDoseAmount.toDouble(),
                    dailyDoseUnit = phase.dailyDoseUnit,
                    isFinalStop = phase.isFinalStop,
                    note = phase.note.ifBlank { null },
                )
            }
        } else {
            null
        },
    )

    private fun PlanEditUiState.toUpdateRequest(): UpdatePlanRequest = UpdatePlanRequest(
        name = name.trim(),
        planType = planType,
        startDate = startDate,
        endDate = endDate.ifBlank { null },
        note = note.ifBlank { null },
        storageLocation = storageLocation.ifBlank { null },
        additionalNote = additionalNote.ifBlank { null },
        prnMinIntervalMinutes = if (planType == PlanType.Prn) prnMinInterval.toIntOrNull() else null,
        prnMaxPerDay = if (planType == PlanType.Prn) prnMaxPerDay.toIntOrNull() else null,
        items = items.mapIndexed { idx, form ->
            PlanItemPatchInput(
                id = form.itemId,
                drugId = form.drug?.id,
                doseAmount = form.doseAmount.toDoubleOrNull(),
                doseUnit = form.doseUnit,
                frequencyType = form.frequencyType,
                frequencyRule = form.rule(),
                mealRelation = form.mealRelation,
                courseType = form.courseType,
                courseDays = if (form.courseType == CourseType.FixedDays) form.courseDays.toIntOrNull() else null,
                sortOrder = idx,
            )
        },
        phases = phases.map { phase ->
            val targetItemId = phase.targetItemKey?.let { key -> items.firstOrNull { it.key == key }?.itemId }
            PlanPhasePatchInput(
                id = phase.phaseId,
                planItemId = targetItemId,
                stageNo = phase.stageNo.toIntOrNull(),
                durationDays = phase.durationDays.toIntOrNull(),
                dailyDoseAmount = phase.dailyDoseAmount.toDoubleOrNull(),
                dailyDoseUnit = phase.dailyDoseUnit,
                isFinalStop = phase.isFinalStop,
                note = phase.note.ifBlank { null },
            )
        },
    )

    companion object {
        val DATE_REGEX = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        val TIME_REGEX = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
        fun parseTimes(text: String): List<String> =
            text.split(',', '，', ' ', ';', '；').map { it.trim() }.filter { it.isNotEmpty() }
        fun trimNumber(v: Double): String =
            if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()
    }
}

// ---------------- UI ----------------

@Composable
fun PlanEditScreen(memberId: String, planId: String?, onSaved: () -> Unit, onOpenDrug: (String) -> Unit) {
    val container = LocalAppContainer.current
    val vm: PlanEditViewModel = viewModel(factory = viewModelFactory { PlanEditViewModel(container.planRepository) })
    val state by vm.state.collectAsState()
    var drugPickerFor by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(planId) { vm.initForEdit(planId) }
    LaunchedEffect(state.saved) { if (state.saved) onSaved() }

    if (state.loading) {
        LoadingBox()
        return
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        Text(if (state.isEdit) "编辑计划" else "新建计划", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))

        LabeledField("计划名称", state.name) { vm.update { s -> s.copy(name = it) } }
        Text("计划类型", style = MaterialTheme.typography.labelLarge)
        ChipRow(
            options = listOf(PlanType.Scheduled to "常规", PlanType.Prn to "按需 PRN"),
            selected = state.planType,
            onSelect = { vm.update { s -> s.copy(planType = it) } },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LabeledField("开始日期", state.startDate, Modifier.weight(1f)) { vm.update { s -> s.copy(startDate = it) } }
            LabeledField("结束日期（可空）", state.endDate, Modifier.weight(1f)) { vm.update { s -> s.copy(endDate = it) } }
        }
        if (state.planType == PlanType.Prn) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField("最小间隔（分钟）", state.prnMinInterval, Modifier.weight(1f)) {
                    vm.update { s -> s.copy(prnMinInterval = it) }
                }
                LabeledField("单日上限（次）", state.prnMaxPerDay, Modifier.weight(1f)) {
                    vm.update { s -> s.copy(prnMaxPerDay = it) }
                }
            }
            Text(
                "PRN 计划不生成定时提醒、不计入按时率；阶段（phases）不适用于 PRN。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LabeledField("存放位置（如：客厅药箱）", state.storageLocation) { vm.update { s -> s.copy(storageLocation = it) } }
        LabeledField("附加备注（详细提醒中展示）", state.additionalNote) { vm.update { s -> s.copy(additionalNote = it) } }
        LabeledField("计划备注", state.note) { vm.update { s -> s.copy(note = it) } }

        SectionTitle("药品明细")
        state.items.forEach { form ->
            PlanItemEditor(
                form = form,
                onChange = { updated -> vm.updateItem(form.key) { updated } },
                onPickDrug = { drugPickerFor = form.key },
                onRemove = { vm.removeItem(form.key) },
                canRemove = state.items.size > 1,
                onOpenDrug = onOpenDrug,
            )
        }
        CareTextButton(text = "＋ 添加药品", onClick = { vm.addItem() })

        if (state.planType == PlanType.Scheduled) {
            SectionTitle("疗程阶段（可选，阶段只改每日总剂量）")
            state.phases.forEach { phase ->
                PlanPhaseEditor(
                    phase = phase,
                    items = state.items,
                    onChange = { updated -> vm.updatePhase(phase.key) { updated } },
                    onRemove = { vm.removePhase(phase.key) },
                )
            }
            CareTextButton(text = "＋ 添加阶段", onClick = { vm.addPhase() })
        }

        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
        }
        Spacer(Modifier.height(8.dp))
        CareButton(
            text = if (state.saving) "保存中…" else "保存计划",
            enabled = !state.saving,
            onClick = { vm.save(memberId, planId) },
            modifier = Modifier.fillMaxWidth(),
        )

        if (state.isEdit && state.history.isNotEmpty()) {
            SectionTitle("变更历史")
            state.history.forEach { h ->
                Text(
                    "${h.createdAt.replace('T', ' ').take(16)} · ${h.changedField}：${h.oldValue ?: "—"} → ${h.newValue ?: "—"}（${operatorLabel(h.operatorType.name)}）",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(32.dp))
    }

    drugPickerFor?.let { itemKey ->
        DrugSearchDialog(
            vm = vm,
            state = state,
            onDismiss = { drugPickerFor = null },
            onPick = { drug ->
                vm.updateItem(itemKey) { it.copy(drug = drug, doseUnit = drug.unit.ifBlank { it.doseUnit }) }
                drugPickerFor = null
            },
        )
    }
}

private fun operatorLabel(name: String): String = when (name) {
    "MemberSelf" -> "本人"
    "Caregiver" -> "照护人"
    "AdminCs" -> "客服"
    else -> "系统"
}

@Composable
private fun LabeledField(
    label: String,
    value: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = modifier.padding(vertical = 4.dp),
    )
}

@Composable
private fun <T> ChipRow(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
    ) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = value == selected,
                onClick = { onSelect(value) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun PlanItemEditor(
    form: PlanItemForm,
    onChange: (PlanItemForm) -> Unit,
    onPickDrug: () -> Unit,
    onRemove: () -> Unit,
    canRemove: Boolean,
    onOpenDrug: (String) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CareButton(
                    text = form.drug?.genericName ?: "选择药品",
                    onClick = onPickDrug,
                    modifier = Modifier.weight(1f),
                )
                if (form.drug != null) {
                    CareTextButton(text = "说明书", onClick = { onOpenDrug(form.drug.id) })
                }
                if (canRemove) {
                    CareTextButton(text = "移除", onClick = onRemove)
                }
            }
            form.drug?.let {
                Text(
                    "${it.specification} ${it.brandName ?: ""}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField("单次剂量", form.doseAmount, Modifier.weight(1f)) { onChange(form.copy(doseAmount = it)) }
                LabeledField("单位", form.doseUnit, Modifier.weight(1f)) { onChange(form.copy(doseUnit = it)) }
            }
            Text("频次", style = MaterialTheme.typography.labelLarge)
            ChipRow(
                options = listOf(
                    FrequencyType.Daily to "每日",
                    FrequencyType.TimesPerDay to "每日多次",
                    FrequencyType.Weekly to "每周",
                    FrequencyType.IntervalDays to "间隔天",
                    FrequencyType.CourseCycle to "周期疗程",
                    FrequencyType.OnDemand to "按需",
                ),
                selected = form.frequencyType,
                onSelect = { onChange(form.copy(frequencyType = it)) },
            )
            if (form.frequencyType != FrequencyType.OnDemand) {
                LabeledField("服药时刻（逗号分隔，如 08:00,20:00）", form.timesText) {
                    onChange(form.copy(timesText = it))
                }
            }
            if (form.frequencyType == FrequencyType.Weekly) {
                Text("星期", style = MaterialTheme.typography.labelLarge)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                ) {
                    (1..7).forEach { day ->
                        FilterChip(
                            selected = day in form.weekdays,
                            onClick = {
                                val next = if (day in form.weekdays) form.weekdays - day else form.weekdays + day
                                onChange(form.copy(weekdays = next))
                            },
                            label = { Text("周${"一二三四五六日"[day - 1]}") },
                        )
                    }
                }
            }
            if (form.frequencyType == FrequencyType.IntervalDays) {
                LabeledField("间隔天数", form.intervalDays) { onChange(form.copy(intervalDays = it)) }
            }
            if (form.frequencyType == FrequencyType.CourseCycle) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LabeledField("周期天数", form.cycleDays, Modifier.weight(1f)) { onChange(form.copy(cycleDays = it)) }
                    LabeledField("服药天数", form.onDays, Modifier.weight(1f)) { onChange(form.copy(onDays = it)) }
                }
            }
            Text("餐食关系", style = MaterialTheme.typography.labelLarge)
            ChipRow(
                options = listOf(
                    MealRelation.None to "无特殊",
                    MealRelation.BeforeMeal to "饭前",
                    MealRelation.WithMeal to "随餐",
                    MealRelation.AfterMeal to "饭后",
                    MealRelation.BeforeSleep to "睡前",
                ),
                selected = form.mealRelation,
                onSelect = { onChange(form.copy(mealRelation = it)) },
            )
            Text("疗程", style = MaterialTheme.typography.labelLarge)
            ChipRow(
                options = listOf(
                    CourseType.LongTerm to "长期",
                    CourseType.FixedDays to "固定天数",
                    CourseType.UntilFinished to "服完为止",
                ),
                selected = form.courseType,
                onSelect = { onChange(form.copy(courseType = it)) },
            )
            if (form.courseType == CourseType.FixedDays) {
                LabeledField("疗程天数", form.courseDays) { onChange(form.copy(courseDays = it)) }
            }
        }
    }
}

@Composable
private fun PlanPhaseEditor(
    phase: PlanPhaseForm,
    items: List<PlanItemForm>,
    onChange: (PlanPhaseForm) -> Unit,
    onRemove: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("阶段 ${phase.stageNo}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                CareTextButton(text = "移除", onClick = onRemove)
            }
            Text("作用范围", style = MaterialTheme.typography.labelLarge)
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            ) {
                FilterChip(
                    selected = phase.targetItemKey == null,
                    onClick = { onChange(phase.copy(targetItemKey = null)) },
                    label = { Text("全计划") },
                )
                items.forEach { item ->
                    FilterChip(
                        selected = phase.targetItemKey == item.key,
                        onClick = { onChange(phase.copy(targetItemKey = item.key)) },
                        label = { Text(item.drug?.genericName ?: "未选药品") },
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField("阶段序号", phase.stageNo, Modifier.weight(1f)) { onChange(phase.copy(stageNo = it)) }
                LabeledField("时长（天）", phase.durationDays, Modifier.weight(1f)) {
                    onChange(phase.copy(durationDays = it))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabeledField("每日总剂量", phase.dailyDoseAmount, Modifier.weight(1f)) {
                    onChange(phase.copy(dailyDoseAmount = it))
                }
                LabeledField("单位", phase.dailyDoseUnit, Modifier.weight(1f)) {
                    onChange(phase.copy(dailyDoseUnit = it))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("减量停药收尾阶段", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Switch(
                    checked = phase.isFinalStop,
                    onCheckedChange = { onChange(phase.copy(isFinalStop = it)) },
                )
            }
            LabeledField("阶段备注", phase.note) { onChange(phase.copy(note = it)) }
        }
    }
}

@Composable
private fun DrugSearchDialog(
    vm: PlanEditViewModel,
    state: PlanEditUiState,
    onDismiss: () -> Unit,
    onPick: (DrugDto) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("搜索药品") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("通用名 / 商品名") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                CareTextButton(
                    text = if (state.searching) "搜索中…" else "搜索",
                    onClick = { vm.searchDrugs(query) },
                )
                LazyColumn(modifier = Modifier.height(320.dp)) {
                    items(state.searchResults, key = { it.id }) { drug ->
                        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            TextButton(onClick = { onPick(drug) }) {
                                Text("${drug.genericName} ${drug.specification} ${drug.brandName ?: ""}")
                            }
                        }
                    }
                }
                if (state.searchResults.isEmpty() && !state.searching) {
                    Text("输入关键词后点搜索；平台库仅含已核验药品，自建药品请联系管理员或在 Web 端添加。", style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
