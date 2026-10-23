package com.medontime.app.data.repository

import com.medontime.app.core.apiCall
import com.medontime.app.core.apiCallUnit
import com.medontime.app.data.local.SessionStore
import com.medontime.app.data.model.AuthorizationDto
import com.medontime.app.data.model.CareSettingsDto
import com.medontime.app.data.model.CreateAuthorizationRequest
import com.medontime.app.data.model.CreateMemberRequest
import com.medontime.app.data.model.MemberDto
import com.medontime.app.data.model.RevokeAuthorizationRequest
import com.medontime.app.data.model.UpdateCareSettingsRequest
import com.medontime.app.data.model.UpdateMemberRequest
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.remote.api.AuthorizationApi
import com.medontime.app.data.remote.api.MemberApi

/** member + authorization 域仓库。成员隔离由服务端守卫强制，客户端只负责传对 memberId。 */
class MemberRepository(
    private val apiProvider: ApiProvider,
    private val store: SessionStore,
) {
    private suspend fun members(): MemberApi = apiProvider.get(MemberApi::class.java)
    private suspend fun authz(): AuthorizationApi = apiProvider.get(AuthorizationApi::class.java)

    suspend fun listMembers(): List<MemberDto> = apiCall { members().list() }

    suspend fun createMember(request: CreateMemberRequest): MemberDto =
        apiCall { members().create(request) }

    suspend fun getMember(memberId: String): MemberDto = apiCall { members().get(memberId) }

    suspend fun updateMember(memberId: String, request: UpdateMemberRequest): MemberDto =
        apiCall { members().update(memberId, request) }

    suspend fun deleteMember(memberId: String) {
        apiCallUnit { members().delete(memberId) }
        if (store.currentMemberId() == memberId) store.setCurrentMemberId(null)
    }

    /** 拉取成员关怀设置并同步本地缓存（主题与本地通知读取缓存值）。 */
    suspend fun careSettings(memberId: String): CareSettingsDto {
        val settings = apiCall { members().careSettings(memberId) }
        store.cacheCareSettings(settings.careMode, settings.lockScreenShowDrugDetail)
        return settings
    }

    suspend fun updateCareSettings(memberId: String, request: UpdateCareSettingsRequest): CareSettingsDto {
        val settings = apiCall { members().updateCareSettings(memberId, request) }
        store.cacheCareSettings(settings.careMode, settings.lockScreenShowDrugDetail)
        return settings
    }

    suspend fun listAuthorizations(view: String? = null): List<AuthorizationDto> =
        apiCall { authz().list(view) }

    suspend fun createAuthorization(request: CreateAuthorizationRequest): AuthorizationDto =
        apiCall { authz().create(request) }

    suspend fun acceptAuthorization(id: String): AuthorizationDto = apiCall { authz().accept(id) }

    suspend fun rejectAuthorization(id: String): AuthorizationDto = apiCall { authz().reject(id) }

    suspend fun revokeAuthorization(id: String, reason: String?): AuthorizationDto =
        apiCall { authz().revoke(id, RevokeAuthorizationRequest(reason)) }
}
