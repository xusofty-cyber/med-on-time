package com.medontime.app.data.remote.api

import com.medontime.app.data.model.AdjustStockRequest
import com.medontime.app.data.model.AdverseRecordDto
import com.medontime.app.data.model.AllergyDto
import com.medontime.app.data.model.ApiResponse
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
import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** stock 域（库存汇总在 member_medication；变动一律走流水，打卡自动扣减）。 */
interface StockApi {
    @GET("api/members/{memberId}/stock")
    suspend fun list(
        @Path("memberId") memberId: String,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
    ): ApiResponse<PageData<StockItemDto>>

    @POST("api/members/{memberId}/stock/adjust")
    suspend fun adjust(
        @Path("memberId") memberId: String,
        @Body body: AdjustStockRequest,
    ): ApiResponse<StockItemDto>
}

/** ehr 域（过敏档案 / 不适记录 / 紧急联系人 / 病历；病历正文服务端加密存储）。 */
interface EhrApi {
    @GET("api/members/{memberId}/allergies")
    suspend fun allergies(@Path("memberId") memberId: String): ApiResponse<List<AllergyDto>>

    /** 全量替换语义。 */
    @PUT("api/members/{memberId}/allergies")
    suspend fun putAllergies(
        @Path("memberId") memberId: String,
        @Body body: PutAllergiesRequest,
    ): ApiResponse<List<AllergyDto>>

    @POST("api/members/{memberId}/adverse-records")
    suspend fun createAdverse(
        @Path("memberId") memberId: String,
        @Body body: CreateAdverseRecordRequest,
    ): ApiResponse<AdverseRecordDto>

    @GET("api/members/{memberId}/adverse-records")
    suspend fun adverseRecords(
        @Path("memberId") memberId: String,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): ApiResponse<PageData<AdverseRecordDto>>

    @GET("api/members/{memberId}/emergency-contacts")
    suspend fun emergencyContacts(@Path("memberId") memberId: String): ApiResponse<List<EmergencyContactDto>>

    @POST("api/members/{memberId}/emergency-contacts")
    suspend fun createEmergencyContact(
        @Path("memberId") memberId: String,
        @Body body: CreateEmergencyContactRequest,
    ): ApiResponse<EmergencyContactDto>

    @PATCH("api/members/{memberId}/emergency-contacts/{contactId}")
    suspend fun updateEmergencyContact(
        @Path("memberId") memberId: String,
        @Path("contactId") contactId: String,
        @Body body: UpdateEmergencyContactRequest,
    ): ApiResponse<EmergencyContactDto>

    @DELETE("api/members/{memberId}/emergency-contacts/{contactId}")
    suspend fun deleteEmergencyContact(
        @Path("memberId") memberId: String,
        @Path("contactId") contactId: String,
    ): ApiResponse<JsonElement>

    /** 一人一份；无记录时 data 为空，仓库层以 nullable 处理。 */
    @GET("api/members/{memberId}/medical-records")
    suspend fun medicalRecord(@Path("memberId") memberId: String): ApiResponse<MedicalRecordDto>

    @POST("api/members/{memberId}/medical-records")
    suspend fun upsertMedicalRecord(
        @Path("memberId") memberId: String,
        @Body body: UpsertMedicalRecordRequest,
    ): ApiResponse<MedicalRecordDto>
}

/** notification 域（站内通知列表/已读 + 渠道偏好；短信为用户自选开启）。 */
interface NotificationApi {
    @GET("api/notifications")
    suspend fun list(
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): ApiResponse<NotificationPageDto>

    @POST("api/notifications/{id}/read")
    suspend fun markRead(@Path("id") id: String): ApiResponse<JsonElement>

    @GET("api/notification-prefs")
    suspend fun prefs(): ApiResponse<NotificationPrefsDto>

    @PUT("api/notification-prefs")
    suspend fun updatePrefs(@Body body: UpdateNotificationPrefsRequest): ApiResponse<NotificationPrefsDto>
}

/** content 域（简/繁/英 locale 内容组）。 */
interface ContentApi {
    @GET("api/content/articles")
    suspend fun articles(
        @Query("locale") locale: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): ApiResponse<PageData<ArticleDto>>

    @GET("api/content/articles/{id}")
    suspend fun article(@Path("id") id: String): ApiResponse<ArticleDto>
}
