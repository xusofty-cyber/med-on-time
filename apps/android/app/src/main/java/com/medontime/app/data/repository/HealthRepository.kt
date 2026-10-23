package com.medontime.app.data.repository

import com.medontime.app.core.apiCall
import com.medontime.app.core.apiCallUnit
import com.medontime.app.data.model.AdjustStockRequest
import com.medontime.app.data.model.AdverseRecordDto
import com.medontime.app.data.model.AllergyDto
import com.medontime.app.data.model.ArticleDto
import com.medontime.app.data.model.CreateAdverseRecordRequest
import com.medontime.app.data.model.CreateEmergencyContactRequest
import com.medontime.app.data.model.EmergencyContactDto
import com.medontime.app.data.model.MedicalRecordDto
import com.medontime.app.data.model.NotificationPageDto
import com.medontime.app.data.model.NotificationPrefsDto
import com.medontime.app.data.model.PageData
import com.medontime.app.data.model.PutAllergiesRequest
import com.medontime.app.data.model.StockItemDto
import com.medontime.app.data.model.UpdateEmergencyContactRequest
import com.medontime.app.data.model.UpdateNotificationPrefsRequest
import com.medontime.app.data.model.UpsertMedicalRecordRequest
import com.medontime.app.data.model.AdherenceCalendarDto
import com.medontime.app.data.model.AdherenceSummaryDto
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.remote.api.AdherenceApi
import com.medontime.app.data.remote.api.ContentApi
import com.medontime.app.data.remote.api.EhrApi
import com.medontime.app.data.remote.api.NotificationApi
import com.medontime.app.data.remote.api.StockApi

/** adherence / stock / ehr / notification / content 域仓库（健康与辅助域合集）。 */
class HealthRepository(private val apiProvider: ApiProvider) {
    private suspend fun adherence(): AdherenceApi = apiProvider.get(AdherenceApi::class.java)
    private suspend fun stock(): StockApi = apiProvider.get(StockApi::class.java)
    private suspend fun ehr(): EhrApi = apiProvider.get(EhrApi::class.java)
    private suspend fun notifications(): NotificationApi = apiProvider.get(NotificationApi::class.java)
    private suspend fun content(): ContentApi = apiProvider.get(ContentApi::class.java)

    // adherence
    suspend fun adherenceSummary(memberId: String, range: String): AdherenceSummaryDto =
        apiCall { adherence().summary(memberId, range) }

    suspend fun adherenceCalendar(memberId: String, month: String): AdherenceCalendarDto =
        apiCall { adherence().calendar(memberId, month) }

    // stock
    suspend fun listStock(memberId: String): PageData<StockItemDto> = apiCall { stock().list(memberId) }

    suspend fun adjustStock(memberId: String, request: AdjustStockRequest): StockItemDto =
        apiCall { stock().adjust(memberId, request) }

    // ehr
    suspend fun allergies(memberId: String): List<AllergyDto> = apiCall { ehr().allergies(memberId) }

    suspend fun putAllergies(memberId: String, items: List<AllergyDto>): List<AllergyDto> =
        apiCall { ehr().putAllergies(memberId, PutAllergiesRequest(items)) }

    suspend fun adverseRecords(memberId: String, page: Int = 1): PageData<AdverseRecordDto> =
        apiCall { ehr().adverseRecords(memberId, page) }

    suspend fun createAdverse(memberId: String, request: CreateAdverseRecordRequest): AdverseRecordDto =
        apiCall { ehr().createAdverse(memberId, request) }

    suspend fun emergencyContacts(memberId: String): List<EmergencyContactDto> =
        apiCall { ehr().emergencyContacts(memberId) }

    suspend fun createEmergencyContact(memberId: String, request: CreateEmergencyContactRequest): EmergencyContactDto =
        apiCall { ehr().createEmergencyContact(memberId, request) }

    suspend fun updateEmergencyContact(
        memberId: String,
        contactId: String,
        request: UpdateEmergencyContactRequest,
    ): EmergencyContactDto = apiCall { ehr().updateEmergencyContact(memberId, contactId, request) }

    suspend fun deleteEmergencyContact(memberId: String, contactId: String) {
        apiCallUnit { ehr().deleteEmergencyContact(memberId, contactId) }
    }

    /** 病历一人一份，未建档时返回 null（不抛错）。 */
    suspend fun medicalRecord(memberId: String): MedicalRecordDto? {
        return try {
            val resp = ehr().medicalRecord(memberId)
            if (resp.code == 0) resp.data else null
        } catch (e: retrofit2.HttpException) {
            null
        }
    }

    suspend fun upsertMedicalRecord(memberId: String, request: UpsertMedicalRecordRequest): MedicalRecordDto =
        apiCall { ehr().upsertMedicalRecord(memberId, request) }

    // notification
    suspend fun listNotifications(page: Int = 1): NotificationPageDto =
        apiCall { notifications().list(page) }

    suspend fun markNotificationRead(id: String) {
        apiCallUnit { notifications().markRead(id) }
    }

    suspend fun notificationPrefs(): NotificationPrefsDto = apiCall { notifications().prefs() }

    suspend fun updateNotificationPrefs(request: UpdateNotificationPrefsRequest): NotificationPrefsDto =
        apiCall { notifications().updatePrefs(request) }

    // content
    suspend fun articles(locale: String? = null, page: Int = 1): PageData<ArticleDto> =
        apiCall { content().articles(locale, page) }

    suspend fun article(id: String): ArticleDto = apiCall { content().article(id) }
}
