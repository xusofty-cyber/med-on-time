package com.medontime.app.feature.adherence

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.AdherenceCalendarDto
import com.medontime.app.data.model.AdherenceSummaryDto
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.repository.HealthRepository
import com.medontime.app.data.repository.MemberRepository
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.EmptyBox
import com.medontime.app.ui.components.ErrorBox
import com.medontime.app.ui.components.LoadingBox
import com.medontime.app.ui.components.SectionTitle
import com.medontime.app.ui.components.percentText
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

data class AdherenceUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val members: List<MemberDto> = emptyList(),
    val currentMember: MemberDto? = null,
    val range: String = "week",
    val summary: AdherenceSummaryDto? = null,
    val month: YearMonth = YearMonth.now(),
    val calendar: AdherenceCalendarDto? = null,
)

class AdherenceViewModel(
    private val store: SessionStore,
    private val memberRepo: MemberRepository,
    private val healthRepo: HealthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AdherenceUiState())
    val state: StateFlow<AdherenceUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val members = memberRepo.listMembers()
                val savedId = store.currentMemberId()
                val current = members.firstOrNull { it.id == savedId } ?: members.firstOrNull()
                if (current == null) {
                    _state.update { it.copy(loading = false, members = emptyList(), currentMember = null) }
                    return@launch
                }
                store.setCurrentMemberId(current.id)
                _state.update { it.copy(members = members, currentMember = current) }
                loadStats(current.id)
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "加载失败") }
            }
        }
    }

    private suspend fun loadStats(memberId: String) {
        val s = _state.value
        val summary = healthRepo.adherenceSummary(memberId, s.range)
        val calendar = healthRepo.adherenceCalendar(memberId, s.month.toString())
        _state.update { it.copy(loading = false, summary = summary, calendar = calendar) }
    }

    fun selectMember(member: MemberDto) {
        viewModelScope.launch { store.setCurrentMemberId(member.id) }
        _state.update { it.copy(currentMember = member, loading = true) }
        viewModelScope.launch {
            runCatching { loadStats(member.id) }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun setRange(range: String) {
        if (range == _state.value.range) return
        _state.update { it.copy(range = range, loading = true) }
        val memberId = _state.value.currentMember?.id ?: return
        viewModelScope.launch {
            runCatching { loadStats(memberId) }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun shiftMonth(delta: Long) {
        _state.update { it.copy(month = it.month.plusMonths(delta), loading = true) }
        val memberId = _state.value.currentMember?.id ?: return
        viewModelScope.launch {
            runCatching { loadStats(memberId) }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}

@Composable
fun AdherenceScreen() {
    val container = LocalAppContainer.current
    val vm: AdherenceViewModel = viewModel(
        factory = viewModelFactory {
            AdherenceViewModel(container.sessionStore, container.memberRepository, container.healthRepository)
        },
    )
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("依从统计", style = MaterialTheme.typography.headlineSmall)
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
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorBox(state.error!!, onRetry = { vm.load() })
            state.currentMember == null -> EmptyBox("还没有成员档案，请先到「我的」里添加成员")
            else -> {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = state.range == "week",
                        onClick = { vm.setRange("week") },
                        label = { Text("本周") },
                    )
                    FilterChip(
                        selected = state.range == "month",
                        onClick = { vm.setRange("month") },
                        label = { Text("本月") },
                    )
                }
                state.summary?.let { summary ->
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "${summary.from} 至 ${summary.to}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                StatBlock("应服", summary.scheduled.toString())
                                StatBlock("实服", summary.taken.toString())
                                StatBlock("依从率", percentText(summary.adherenceRate))
                                StatBlock("按时率", percentText(summary.onTimeRate))
                            }
                            Text(
                                "漏服 ${summary.missed} 次 · 跳过 ${summary.skipped} 次（补记计入实服、不计按时）",
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    CareTextButton(text = "‹ 上月", onClick = { vm.shiftMonth(-1) })
                    Text("${state.month.year} 年 ${state.month.monthValue} 月", style = MaterialTheme.typography.titleMedium)
                    CareTextButton(text = "下月 ›", onClick = { vm.shiftMonth(1) })
                }
                state.calendar?.let { MonthCalendar(it) }
                Text(
                    "图例：绿=全部完成 · 黄=部分完成 · 红=有漏服 · 灰=无计划",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun StatBlock(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun MonthCalendar(calendar: AdherenceCalendarDto) {
    val byDate = calendar.days.associateBy { it.date }
    val firstDay = LocalDate.parse("${calendar.month}-01")
    val leadingBlanks = firstDay.dayOfWeek.value - 1 // 周一为每周第一列
    val daysInMonth = firstDay.lengthOfMonth()
    val cells: List<LocalDate?> = List(leadingBlanks) { null } + (1..daysInMonth).map { firstDay.withDayOfMonth(it) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth()) {
            listOf("一", "二", "三", "四", "五", "六", "日").forEach { label ->
                Text(
                    label,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
        cells.chunked(7).forEach { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                week.forEach { date ->
                    Box(modifier = Modifier.weight(1f).aspectRatio(1f).padding(2.dp)) {
                        if (date != null) {
                            val day = byDate[date.toString()]
                            val bg = when (day?.status) {
                                "complete" -> Color(0xFFBFE3D2)
                                "partial" -> Color(0xFFFCE9B8)
                                "missed" -> Color(0xFFF6C6C6)
                                else -> MaterialTheme.colorScheme.surfaceVariant
                            }
                            Box(
                                modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)).background(bg),
                                contentAlignment = Alignment.Center,
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(date.dayOfMonth.toString(), style = MaterialTheme.typography.bodyMedium)
                                    if (day != null && day.scheduled > 0) {
                                        Text(
                                            "${day.taken}/${day.scheduled}",
                                            style = MaterialTheme.typography.labelMedium,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                repeat(7 - week.size) {
                    Box(modifier = Modifier.weight(1f).aspectRatio(1f)) {}
                }
            }
        }
    }
}
