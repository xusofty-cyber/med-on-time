package com.medontime.app.data.remote.api

import com.medontime.app.data.model.AccountDto
import com.medontime.app.data.model.ApiResponse
import com.medontime.app.data.model.BindWechatRequest
import com.medontime.app.data.model.CancelAccountRequest
import com.medontime.app.data.model.EmailCodeScene
import com.medontime.app.data.model.LoginByCodeRequest
import com.medontime.app.data.model.LoginByEmailCodeRequest
import com.medontime.app.data.model.LoginRequest
import com.medontime.app.data.model.LogoutRequest
import com.medontime.app.data.model.RefreshRequest
import com.medontime.app.data.model.RegisterByEmailRequest
import com.medontime.app.data.model.RegisterRequest
import com.medontime.app.data.model.ResetPasswordByEmailRequest
import com.medontime.app.data.model.ResetPasswordRequest
import com.medontime.app.data.model.SendEmailCodeRequest
import com.medontime.app.data.model.SendEmailCodeResponse
import com.medontime.app.data.model.SendSmsCodeRequest
import com.medontime.app.data.model.SendSmsCodeResponse
import com.medontime.app.data.model.SessionDto
import com.medontime.app.data.model.TokenPairDto
import com.medontime.app.data.model.UpdateProfileRequest
import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/** auth 域（契约：账号为手机号或邮箱；access 2h + refresh 30d）。 */
interface AuthApi {
    @POST("api/auth/sms/send")
    suspend fun sendSmsCode(@Body body: SendSmsCodeRequest): ApiResponse<SendSmsCodeResponse>

    /** 邮箱验证码发送（60 秒重发间隔、1 小时 5 次由后端限频，message 直接透出）。 */
    @POST("api/auth/email/send")
    suspend fun sendEmailCode(@Body body: SendEmailCodeRequest): ApiResponse<SendEmailCodeResponse>

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiResponse<TokenPairDto>

    @POST("api/auth/register/email")
    suspend fun registerByEmail(@Body body: RegisterByEmailRequest): ApiResponse<TokenPairDto>

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): ApiResponse<TokenPairDto>

    @POST("api/auth/login/code")
    suspend fun loginByCode(@Body body: LoginByCodeRequest): ApiResponse<TokenPairDto>

    @POST("api/auth/login/code")
    suspend fun loginByEmailCode(@Body body: LoginByEmailCodeRequest): ApiResponse<TokenPairDto>

    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): ApiResponse<TokenPairDto>

    @POST("api/auth/logout")
    suspend fun logout(@Body body: LogoutRequest): ApiResponse<JsonElement>

    @POST("api/auth/password/reset")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): ApiResponse<JsonElement>

    @POST("api/auth/password/reset")
    suspend fun resetPasswordByEmail(@Body body: ResetPasswordByEmailRequest): ApiResponse<JsonElement>

    /** 占位：未接真实微信前服务端返回未开通，客户端仅登记入口。 */
    @POST("api/auth/bind/wechat")
    suspend fun bindWechat(@Body body: BindWechatRequest): ApiResponse<JsonElement>

    @GET("api/auth/me")
    suspend fun me(): ApiResponse<AccountDto>
}

/** account 域（资料 / 注销冷静期 / 会话管理）。 */
interface AccountApi {
    @GET("api/account/profile")
    suspend fun profile(): ApiResponse<AccountDto>

    @PATCH("api/account/profile")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): ApiResponse<AccountDto>

    /** 注销申请：进入 30 天冷静期（status=cancelling），期内可 withdraw 撤销。 */
    @POST("api/account/cancel")
    suspend fun cancel(@Body body: CancelAccountRequest): ApiResponse<JsonElement>

    @POST("api/account/cancel/withdraw")
    suspend fun withdrawCancel(): ApiResponse<JsonElement>

    @GET("api/account/sessions")
    suspend fun sessions(): ApiResponse<List<SessionDto>>

    @DELETE("api/account/sessions/{id}")
    suspend fun deleteSession(@Path("id") id: String): ApiResponse<JsonElement>
}
