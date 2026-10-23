package com.medontime.app.data.remote

import com.medontime.app.core.AppJson
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.ApiResponse
import com.medontime.app.data.model.TokenPairDto
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route

/** Bearer 注入：已登录时为请求补 Authorization（调用方显式设置的优先）。 */
class AuthInterceptor(private val store: SessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null) return chain.proceed(request)
        val token = runBlocking { store.accessToken() }
        val authed = if (token.isNullOrBlank()) {
            request
        } else {
            request.newBuilder().header("Authorization", "Bearer $token").build()
        }
        return chain.proceed(authed)
    }
}

/**
 * 401 处理：用 refresh token 换新 token 对并重放原请求（access 2h 过期场景）。
 * - 已有其他线程刷新过（请求里的 token 与存储不一致）时直接用存储中的新 token 重放；
 * - 刷新失败则清除本地会话，返回原 401，由 UI 层根据会话状态跳登录；
 * - 刷新调用走独立裸 OkHttpClient，避免与业务 client 的 Authenticator 递归。
 */
class TokenAuthenticator(
    private val store: SessionStore,
    private val baseUrlProvider: () -> String,
) : Authenticator {

    private val refreshLock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        val requestToken = response.request.header("Authorization")?.removePrefix("Bearer ")
        synchronized(refreshLock) {
            val currentAccess = runBlocking { store.accessToken() }
            if (!currentAccess.isNullOrBlank() && currentAccess != requestToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $currentAccess")
                    .build()
            }
            val refreshToken = runBlocking { store.refreshToken() } ?: return null
            val newPair = refreshTokens(refreshToken) ?: run {
                runBlocking { store.clearSession() }
                return null
            }
            runBlocking { store.saveTokens(newPair.accessToken, newPair.refreshToken) }
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${newPair.accessToken}")
                .build()
        }
    }

    private fun refreshTokens(refreshToken: String): TokenPairDto? {
        val client = OkHttpClient()
        val body = kotlinx.serialization.json.buildJsonObject {
            put("refreshToken", kotlinx.serialization.json.JsonPrimitive(refreshToken))
        }.toString()
        val request = Request.Builder()
            .url(baseUrlProvider() + "api/auth/refresh")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        return runCatching {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val text = resp.body?.string() ?: return null
                val parsed = AppJson.decodeFromString<ApiResponse<TokenPairDto>>(text)
                if (parsed.code == 0) parsed.data else null
            }
        }.getOrNull()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
