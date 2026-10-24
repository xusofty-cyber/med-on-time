package com.medontime.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.medontime.app.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "medontime_session")

/**
 * 本地会话与偏好（DataStore）：
 * - token 对（access 2h / refresh 30d，refresh 服务端可吊销）；
 * - 当前成员、API 基地址（可配置）；
 * - 关怀模式与锁屏显示药品详情的本地缓存（服务端 care-settings 为权威，缓存供通知与冷启动渲染）。
 * 注：token 以明文存于应用私有 DataStore（与 Web 端 localStorage 口径一致的 MVP 取舍）；
 * 后续可迁移至 EncryptedFile / Keystore 包装，已在 README 缺口登记。
 */
class SessionStore(private val context: Context) {

    private object Keys {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val ACCOUNT_ID = stringPreferencesKey("account_id")
        val CURRENT_MEMBER_ID = stringPreferencesKey("current_member_id")
        val BASE_URL = stringPreferencesKey("base_url")
        val CARE_MODE = booleanPreferencesKey("care_mode")
        val LOCK_SCREEN_SHOW_DRUG = booleanPreferencesKey("lock_screen_show_drug")
        val SCHEDULED_INSTANCE_IDS = stringSetPreferencesKey("scheduled_instance_ids")
    }

    val accessTokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.ACCESS_TOKEN] }
    val currentMemberIdFlow: Flow<String?> = context.dataStore.data.map { it[Keys.CURRENT_MEMBER_ID] }
    val careModeFlow: Flow<Boolean> = context.dataStore.data.map { it[Keys.CARE_MODE] ?: false }
    val lockScreenShowDrugFlow: Flow<Boolean> =
        context.dataStore.data.map { it[Keys.LOCK_SCREEN_SHOW_DRUG] ?: false }
    val baseUrlFlow: Flow<String> =
        context.dataStore.data.map { it[Keys.BASE_URL] ?: BuildConfig.DEFAULT_API_BASE_URL }

    val isLoggedInFlow: Flow<Boolean> = context.dataStore.data.map { !it[Keys.ACCESS_TOKEN].isNullOrBlank() }

    suspend fun accessToken(): String? = context.dataStore.data.first()[Keys.ACCESS_TOKEN]
    suspend fun refreshToken(): String? = context.dataStore.data.first()[Keys.REFRESH_TOKEN]
    suspend fun currentMemberId(): String? = context.dataStore.data.first()[Keys.CURRENT_MEMBER_ID]
    suspend fun baseUrl(): String = context.dataStore.data.first()[Keys.BASE_URL] ?: BuildConfig.DEFAULT_API_BASE_URL
    suspend fun lockScreenShowDrug(): Boolean =
        context.dataStore.data.first()[Keys.LOCK_SCREEN_SHOW_DRUG] ?: false
    suspend fun scheduledInstanceIds(): Set<String> =
        context.dataStore.data.first()[Keys.SCHEDULED_INSTANCE_IDS] ?: emptySet()

    suspend fun saveScheduledInstanceIds(ids: Set<String>) {
        context.dataStore.edit { prefs ->
            if (ids.isEmpty()) prefs.remove(Keys.SCHEDULED_INSTANCE_IDS) else prefs[Keys.SCHEDULED_INSTANCE_IDS] = ids
        }
    }

    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        context.dataStore.edit {
            it[Keys.ACCESS_TOKEN] = accessToken
            it[Keys.REFRESH_TOKEN] = refreshToken
        }
    }

    suspend fun saveAccountId(accountId: String) {
        context.dataStore.edit { it[Keys.ACCOUNT_ID] = accountId }
    }

    suspend fun setCurrentMemberId(memberId: String?) {
        context.dataStore.edit { prefs ->
            if (memberId == null) prefs.remove(Keys.CURRENT_MEMBER_ID) else prefs[Keys.CURRENT_MEMBER_ID] = memberId
        }
    }

    suspend fun setBaseUrl(url: String) {
        val normalized = if (url.endsWith("/")) url else "$url/"
        context.dataStore.edit { it[Keys.BASE_URL] = normalized }
    }

    /** 同步服务端 care-settings 到本地缓存（供本地通知与主题冷启动使用）。 */
    suspend fun cacheCareSettings(careMode: Boolean, lockScreenShowDrugDetail: Boolean) {
        context.dataStore.edit {
            it[Keys.CARE_MODE] = careMode
            it[Keys.LOCK_SCREEN_SHOW_DRUG] = lockScreenShowDrugDetail
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit {
            it.remove(Keys.ACCESS_TOKEN)
            it.remove(Keys.REFRESH_TOKEN)
            it.remove(Keys.ACCOUNT_ID)
            it.remove(Keys.CURRENT_MEMBER_ID)
            it[Keys.CARE_MODE] = false
            it[Keys.LOCK_SCREEN_SHOW_DRUG] = false
        }
    }
}
