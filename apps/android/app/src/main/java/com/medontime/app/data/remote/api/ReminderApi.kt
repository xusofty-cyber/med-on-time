package com.medontime.app.data.remote.api

import com.medontime.app.data.model.AdherenceCalendarDto
import com.medontime.app.data.model.AdherenceSummaryDto
import com.medontime.app.data.model.ApiResponse
import com.medontime.app.data.model.CheckinRequest
import com.medontime.app.data.model.IntakeRecordDto
import com.medontime.app.data.model.PageData
import com.medontime.app.data.model.ReminderDayDto
import com.medontime.app.data.model.SkipRequest
import com.medontime.app.data.model.SkipResultDto
import com.medontime.app.data.model.SnoozeRequest
import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** reminder 域（实例由服务端按成员本地时区生成；客户端只读 + 动作回写）。 */
interface ReminderApi {
    @GET("api/members/{memberId}/reminders/today")
    suspend fun today(@Path("memberId") memberId: String): ApiResponse<ReminderDayDto>

    @GET("api/members/{memberId}/reminders")
    suspend fun byDate(
        @Path("memberId") memberId: String,
        @Query("date") date: String,
    ): ApiResponse<ReminderDayDto>

    /** 按 cycle 顺延（minutes 缺省走成员 cycle interval，标准 15 分钟）。 */
    @POST("api/reminders/{instanceId}/snooze")
    suspend fun snooze(
        @Path("instanceId") instanceId: String,
        @Body body: SnoozeRequest,
    ): ApiResponse<JsonElement>

    @POST("api/reminders/{instanceId}/skip")
    suspend fun skip(
        @Path("instanceId") instanceId: String,
        @Body body: SkipRequest,
    ): ApiResponse<SkipResultDto>
}

/** checkin 域（一实例仅一条有效 intake_record；clientRequestId 幂等）。 */
interface CheckinApi {
    @POST("api/reminders/{instanceId}/checkin")
    suspend fun checkin(
        @Path("instanceId") instanceId: String,
        @Body body: CheckinRequest,
    ): ApiResponse<IntakeRecordDto>

    @GET("api/members/{memberId}/checkins")
    suspend fun list(
        @Path("memberId") memberId: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): ApiResponse<PageData<IntakeRecordDto>>
}

/** adherence 域（应服/实服/按时率汇总 + 月历；口径：分母只数已到期实例，补记不计按时）。 */
interface AdherenceApi {
    @GET("api/members/{memberId}/adherence/summary")
    suspend fun summary(
        @Path("memberId") memberId: String,
        @Query("range") range: String,
    ): ApiResponse<AdherenceSummaryDto>

    @GET("api/members/{memberId}/adherence/calendar")
    suspend fun calendar(
        @Path("memberId") memberId: String,
        @Query("month") month: String,
    ): ApiResponse<AdherenceCalendarDto>
}
