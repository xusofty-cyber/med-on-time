package com.medontime.app.data.repository

import com.medontime.app.core.apiCall
import com.medontime.app.core.apiCallUnit
import com.medontime.app.data.model.CreateCustomDrugRequest
import com.medontime.app.data.model.CreatePlanRequest
import com.medontime.app.data.model.DrugDto
import com.medontime.app.data.model.DrugInteractionsDto
import com.medontime.app.data.model.PageData
import com.medontime.app.data.model.PlanDto
import com.medontime.app.data.model.PlanHistoryDto
import com.medontime.app.data.model.UpdatePlanRequest
import com.medontime.app.data.remote.ApiProvider
import com.medontime.app.data.remote.api.DrugApi
import com.medontime.app.data.remote.api.PlanApi

/** plan + drug 域仓库。 */
class PlanRepository(private val apiProvider: ApiProvider) {
    private suspend fun plans(): PlanApi = apiProvider.get(PlanApi::class.java)
    private suspend fun drugs(): DrugApi = apiProvider.get(DrugApi::class.java)

    suspend fun listPlans(memberId: String): List<PlanDto> =
        apiCall { plans().list(memberId) }.items

    suspend fun getPlan(planId: String): PlanDto = apiCall { plans().get(planId) }

    suspend fun createPlan(memberId: String, request: CreatePlanRequest): PlanDto =
        apiCall { plans().create(memberId, request) }

    suspend fun updatePlan(planId: String, request: UpdatePlanRequest): PlanDto =
        apiCall { plans().update(planId, request) }

    suspend fun deletePlan(planId: String) {
        apiCallUnit { plans().delete(planId) }
    }

    suspend fun pausePlan(planId: String): PlanDto = apiCall { plans().pause(planId) }

    suspend fun resumePlan(planId: String): PlanDto = apiCall { plans().resume(planId) }

    suspend fun planHistory(planId: String): PageData<PlanHistoryDto> =
        apiCall { plans().history(planId) }

    suspend fun searchDrugs(query: String, page: Int = 1): PageData<DrugDto> =
        apiCall { drugs().search(query.ifBlank { null }, page) }

    suspend fun drugDetail(id: String): DrugDto = apiCall { drugs().detail(id) }

    suspend fun drugInteractions(id: String): DrugInteractionsDto =
        apiCall { drugs().interactions(id) }

    suspend fun createCustomDrug(memberId: String, request: CreateCustomDrugRequest): DrugDto =
        apiCall { drugs().createCustom(memberId, request) }
}
