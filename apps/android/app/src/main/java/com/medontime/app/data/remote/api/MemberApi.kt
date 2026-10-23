package com.medontime.app.data.remote.api

import com.medontime.app.data.model.ApiResponse
import com.medontime.app.data.model.AuthorizationDto
import com.medontime.app.data.model.CareSettingsDto
import com.medontime.app.data.model.CreateAuthorizationRequest
import com.medontime.app.data.model.CreateMemberRequest
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.RevokeAuthorizationRequest
import com.medontime.app.data.model.UpdateCareSettingsRequest
import com.medontime.app.data.model.UpdateMemberRequest
import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** member 域（上限 10/账号；成员数据隔离由服务端 MemberAccessGuard 强制）。 */
interface MemberApi {
    @POST("api/members")
    suspend fun create(@Body body: CreateMemberRequest): ApiResponse<MemberDto>

    @GET("api/members")
    suspend fun list(): ApiResponse<List<MemberDto>>

    @GET("api/members/{memberId}")
    suspend fun get(@Path("memberId") memberId: String): ApiResponse<MemberDto>

    @PATCH("api/members/{memberId}")
    suspend fun update(
        @Path("memberId") memberId: String,
        @Body body: UpdateMemberRequest,
    ): ApiResponse<MemberDto>

    @DELETE("api/members/{memberId}")
    suspend fun delete(@Path("memberId") memberId: String): ApiResponse<JsonElement>

    @GET("api/members/{memberId}/care-settings")
    suspend fun careSettings(@Path("memberId") memberId: String): ApiResponse<CareSettingsDto>

    @PUT("api/members/{memberId}/care-settings")
    suspend fun updateCareSettings(
        @Path("memberId") memberId: String,
        @Body body: UpdateCareSettingsRequest,
    ): ApiResponse<CareSettingsDto>
}

/** authorization 域（照护授权：上限 5 照护人/成员；代操作双记录由服务端落日志）。 */
interface AuthorizationApi {
    @POST("api/authorizations")
    suspend fun create(@Body body: CreateAuthorizationRequest): ApiResponse<AuthorizationDto>

    /** view: granted = 我授权出去的；received = 授权给我的；缺省两者都返。 */
    @GET("api/authorizations")
    suspend fun list(@Query("view") view: String? = null): ApiResponse<List<AuthorizationDto>>

    @POST("api/authorizations/{id}/accept")
    suspend fun accept(@Path("id") id: String): ApiResponse<AuthorizationDto>

    @POST("api/authorizations/{id}/reject")
    suspend fun reject(@Path("id") id: String): ApiResponse<AuthorizationDto>

    @POST("api/authorizations/{id}/revoke")
    suspend fun revoke(
        @Path("id") id: String,
        @Body body: RevokeAuthorizationRequest,
    ): ApiResponse<AuthorizationDto>
}
