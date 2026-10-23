package com.medontime.app.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.medontime.app.BuildConfig
import com.medontime.app.core.AppJson
import com.medontime.app.data.local.SessionStore
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Retrofit 工厂：基地址可配置（DataStore 保存，设置页可改；默认 BuildConfig.DEFAULT_API_BASE_URL）。
 * 基地址变化时自动重建 Retrofit 实例。手动 DI（AppContainer 持有单例），未引入 Hilt 以保持
 * 工程在无 SDK 环境下的可核查性；后续可平滑替换为 Hilt Module。
 */
class ApiProvider(private val store: SessionStore) {

    @Volatile
    private var retrofit: Retrofit? = null

    @Volatile
    private var currentBaseUrl: String? = null

    private fun buildRetrofit(baseUrl: String): Retrofit {
        val logging = HttpLoggingInterceptor().apply {
            // 仅 BASIC 级别（不打请求/响应体），避免病历、用药、token 等敏感数据落日志（仓库红线 4）。
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(store))
            .addInterceptor(logging)
            .authenticator(TokenAuthenticator(store) { currentBaseUrl ?: BuildConfig.DEFAULT_API_BASE_URL })
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(AppJson.asConverterFactory("application/json".toMediaType()))
            .build()
    }

    /** 取 API 接口实例（基地址以存储值为准，变化时重建）。 */
    suspend fun <T> get(service: Class<T>): T {
        val baseUrl = store.baseUrl()
        val existing = retrofit
        if (existing == null || currentBaseUrl != baseUrl) {
            synchronized(this) {
                if (retrofit == null || currentBaseUrl != baseUrl) {
                    retrofit = buildRetrofit(baseUrl)
                    currentBaseUrl = baseUrl
                }
            }
        }
        return retrofit!!.create(service)
    }

    /** 设置页改完基地址后主动失效缓存（下次 get 时按新地址重建）。 */
    fun invalidate() {
        synchronized(this) {
            retrofit = null
            currentBaseUrl = null
        }
    }

    companion object {
        /** 供 Authenticator 等同步场景读取当前基地址（无存储值时回退默认）。 */
        fun peekBaseUrl(store: SessionStore): String = runBlocking { store.baseUrl() }
    }
}
