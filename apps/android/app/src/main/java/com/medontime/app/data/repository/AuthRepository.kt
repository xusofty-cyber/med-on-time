package com.medontime.app.data.repository

import android.os.Build
import com.medontime.app.core.apiCall
import com.medontime.app.core.apiCallUnit
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.AccountDto
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
import com.medontime.app.data.model.SendSmsCodeRequest
import com.medontime.app.data.model.SessionDto
import com.medontime.app.data.model.SmsScene
import com.medontime.app.data.model.TokenPairDto
import com.medontime.app.data.model.UpdateProfileRequest
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.remote.api.AccountApi
import com.medontime.app.data.remote.api.AuthApi

/** auth + account 域仓库：登录态落 SessionStore；其余域经拦截器自动带 token。 */
class AuthRepository(
    private val apiProvider: ApiProvider,
    private val store: SessionStore,
) {
    private suspend fun auth(): AuthApi = apiProvider.get(AuthApi::class.java)
    private suspend fun account(): AccountApi = apiProvider.get(AccountApi::class.java)

    private fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    suspend fun sendSmsCode(phone: String, scene: SmsScene): Int =
        apiCall { auth().sendSmsCode(SendSmsCodeRequest(phone, scene)) }.expiresInSeconds

    /** 邮箱验证码发送（后端限频 60 秒重发间隔；返回码有效秒数，默认 300）。 */
    suspend fun sendEmailCode(email: String, scene: EmailCodeScene): Int =
        apiCall { auth().sendEmailCode(SendEmailCodeRequest(email, scene)) }.expiresInSeconds

    suspend fun register(phone: String, password: String, smsCode: String, nickname: String?): TokenPairDto {
        val pair = apiCall {
            auth().register(
                RegisterRequest(
                    phone = phone,
                    password = password,
                    smsCode = smsCode,
                    nickname = nickname?.takeIf { it.isNotBlank() },
                    deviceName = deviceName(),
                ),
            )
        }
        persistSession(pair)
        return pair
    }

    /** 邮箱注册（必验码；phone 选填仅登记不验证）。 */
    suspend fun registerByEmail(
        email: String,
        password: String,
        code: String,
        nickname: String?,
        phone: String?,
    ): TokenPairDto {
        val pair = apiCall {
            auth().registerByEmail(
                RegisterByEmailRequest(
                    email = email,
                    code = code,
                    password = password,
                    nickname = nickname?.takeIf { it.isNotBlank() },
                    phone = phone?.takeIf { it.isNotBlank() },
                    deviceName = deviceName(),
                ),
            )
        }
        persistSession(pair)
        return pair
    }

    /** 密码登录：account 为手机号或邮箱（后端含 @ 按邮箱查）。 */
    suspend fun login(account: String, password: String): TokenPairDto {
        val pair = apiCall { auth().login(LoginRequest(account, password, deviceName = deviceName())) }
        persistSession(pair)
        return pair
    }

    suspend fun loginByCode(phone: String, smsCode: String): TokenPairDto {
        val pair = apiCall { auth().loginByCode(LoginByCodeRequest(phone, smsCode, deviceName = deviceName())) }
        persistSession(pair)
        return pair
    }

    /** 邮箱验证码登录。 */
    suspend fun loginByEmailCode(email: String, code: String): TokenPairDto {
        val pair = apiCall { auth().loginByEmailCode(LoginByEmailCodeRequest(email, code, deviceName = deviceName())) }
        persistSession(pair)
        return pair
    }

    suspend fun refresh(): TokenPairDto {
        val rt = store.refreshToken() ?: throw IllegalStateException("无 refresh token")
        val pair = apiCall { auth().refresh(RefreshRequest(rt)) }
        store.saveTokens(pair.accessToken, pair.refreshToken)
        return pair
    }

    suspend fun logout() {
        val rt = store.refreshToken()
        runCatching { apiCallUnit { auth().logout(LogoutRequest(rt)) } }
        store.clearSession()
    }

    suspend fun resetPassword(phone: String, smsCode: String, newPassword: String) {
        apiCallUnit { auth().resetPassword(ResetPasswordRequest(phone, smsCode, newPassword)) }
    }

    /** 邮箱找回密码。 */
    suspend fun resetPasswordByEmail(email: String, code: String, newPassword: String) {
        apiCallUnit { auth().resetPasswordByEmail(ResetPasswordByEmailRequest(email, code, newPassword)) }
    }

    suspend fun bindWechat(code: String?) {
        apiCallUnit { auth().bindWechat(BindWechatRequest(code)) }
    }

    suspend fun me(): AccountDto = apiCall { auth().me() }

    suspend fun profile(): AccountDto = apiCall { account().profile() }

    suspend fun updateProfile(request: UpdateProfileRequest): AccountDto =
        apiCall { account().updateProfile(request) }

    suspend fun cancelAccount(reason: String?) {
        apiCallUnit { account().cancel(CancelAccountRequest(reason)) }
    }

    suspend fun withdrawCancel() {
        apiCallUnit { account().withdrawCancel() }
    }

    suspend fun sessions(): List<SessionDto> = apiCall { account().sessions() }.items

    suspend fun deleteSession(id: String) {
        apiCallUnit { account().deleteSession(id) }
    }

    private suspend fun persistSession(pair: TokenPairDto) {
        store.saveTokens(pair.accessToken, pair.refreshToken)
        // 补记 accountId（授权方向判定要用），失败不阻塞登录主流程。
        runCatching { me() }.onSuccess { store.saveAccountId(it.id) }
    }
}
