package com.medontime.app.data.remote.api

import com.medontime.app.data.model.ApiResponse
import com.medontime.app.data.model.CreateCustomDrugRequest
import com.medontime.app.data.model.CreatePlanRequest
import com.medontime.app.data.model.DrugDto
import com.medontime.app.data.model.DrugInteractionsDto
import com.medontime.app.data.model.PageData
import com.medontime.app.data.model.PlanDto
import com.medontime.app.data.model.PlanHistoryDto
import com.medontime.app.data.model.UpdatePlanRequest
import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** drug 域（平台药品库仅 review_status=approved 对外可见；自建药仅创建账号可见）。 */
interface DrugApi {
    @GET("api/drugs/search")
    suspend fun search(
        @Query("q") q: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): ApiResponse<PageData<DrugDto>>

    @GET("api/drugs/{id}")
    suspend fun detail(@Path("id") id: String): ApiResponse<DrugDto>

    @GET("api/drugs/{id}/interactions")
    suspend fun interactions(@Path("id") id: String): ApiResponse<DrugInteractionsDto>

    @POST("api/members/{memberId}/drugs/custom")
    suspend fun createCustom(
        @Path("memberId") memberId: String,
        @Body body: CreateCustomDrugRequest,
    ): ApiResponse<DrugDto>
}

/** plan 域（常规/PRN；含 course+dose phases、存放位置/附加备注、变更史）。 */
interface PlanApi {
    @POST("api/members/{memberId}/plans")
    suspend fun create(
        @Path("memberId") memberId: String,
        @Body body: CreatePlanRequest,
    ): ApiResponse<PlanDto>

    @GET("api/members/{memberId}/plans")
    suspend fun list(
        @Path("memberId") memberId: String,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
    ): ApiResponse<PageData<PlanDto>>

    @GET("api/plans/{planId}")
    suspend fun get(@Path("planId") planId: String): ApiResponse<PlanDto>

    @PATCH("api/plans/{planId}")
    suspend fun update(
        @Path("planId") planId: String,
        @Body body: UpdatePlanRequest,
    ): ApiResponse<PlanDto>

    @DELETE("api/plans/{planId}")
    suspend fun delete(@Path("planId") planId: String): ApiResponse<JsonElement>

    @GET("api/plans/{planId}/history")
    suspend fun history(
        @Path("planId") planId: String,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
    ): ApiResponse<PageData<PlanHistoryDto>>

    @POST("api/plans/{planId}/pause")
    suspend fun pause(@Path("planId") planId: String): ApiResponse<PlanDto>

    @POST("api/plans/{planId}/resume")
    suspend fun resume(@Path("planId") planId: String): ApiResponse<PlanDto>
}
