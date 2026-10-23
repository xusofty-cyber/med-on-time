package com.medontime.app.data.repository

import com.medontime.app.core.apiCall
import com.medontime.app.data.model.CheckinRequest
import com.medontime.app.data.model.IntakeRecordDto
import com.medontime.app.data.model.PageData
import com.medontime.app.data.model.ReminderDayDto
import com.medontime.app.data.model.SkipRequest
import com.medontime.app.data.model.SkipResultDto
import com.medontime.app.data.model.SnoozeRequest
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.remote.api.CheckinApi
import com.medontime.app.data.remote.api.ReminderApi
import java.time.Instant
import java.util.UUID

/** reminder + checkin 域仓库：打卡/跳过以 clientRequestId 幂等，重复提交由服务端去重。 */
class ReminderRepository(private val apiProvider: ApiProvider) {
    private suspend fun reminders(): ReminderApi = apiProvider.get(ReminderApi::class.java)
    private suspend fun checkins(): CheckinApi = apiProvider.get(CheckinApi::class.java)

    suspend fun today(memberId: String): ReminderDayDto = apiCall { reminders().today(memberId) }

    suspend fun byDate(memberId: String, date: String): ReminderDayDto =
        apiCall { reminders().byDate(memberId, date) }

    suspend fun checkin(instanceId: String, clientRequestId: String, takenAt: Instant? = null): IntakeRecordDto =
        apiCall {
            checkins().checkin(
                instanceId,
                CheckinRequest(
                    clientRequestId = clientRequestId,
                    takenAt = takenAt?.toString(),
                    confirmationMethod = "tap",
                ),
            )
        }

    suspend fun snooze(instanceId: String, minutes: Int? = null) {
        com.medontime.app.core.apiCallUnit { reminders().snooze(instanceId, SnoozeRequest(minutes)) }
    }

    suspend fun skip(instanceId: String, reason: String?, clientRequestId: String): SkipResultDto =
        apiCall { reminders().skip(instanceId, SkipRequest(reason, clientRequestId)) }

    suspend fun listCheckins(memberId: String, from: String?, to: String?, page: Int = 1): PageData<IntakeRecordDto> =
        apiCall { checkins().list(memberId, from, to, page) }

    companion object {
        fun newClientRequestId(): String = UUID.randomUUID().toString()
    }
}
