package com.medontime.app.core

import com.medontime.app.data.model.ApiResponse
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.HttpException
import java.io.IOException

/** 业务异常：code 为后端业务码（0 成功；40100 未授权；40301 成员隔离拦截等），与 HTTP 状态分离。 */
class ApiException(
    val businessCode: Int,
    override val message: String,
    val traceId: String? = null,
    val httpStatus: Int? = null,
) : Exception(message) {
    val isUnauthorized: Boolean get() = httpStatus == 401 || businessCode == 40100
}

/** 全端统一 Json 配置：容忍未知字段；请求体省略 null 与默认值（PATCH 部分更新语义）。 */
val AppJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    encodeDefaults = false
    explicitNulls = false
}

/** 解包信封：code != 0 或 data 为空（需要 data 时）抛 ApiException。 */
fun <T> ApiResponse<T>.unwrap(): T {
    if (code != 0) {
        throw ApiException(code, message.ifBlank { "请求失败（$code）" }, traceId)
    }
    return data ?: throw ApiException(code, message.ifBlank { "响应为空" }, traceId)
}

/** 执行 Retrofit 调用并统一异常转换（含 HTTP 错误体中的业务信封解析）。 */
suspend fun <T> apiCall(block: suspend () -> ApiResponse<T>): T {
    try {
        return block().unwrap()
    } catch (e: ApiException) {
        throw e
    } catch (e: HttpException) {
        throw e.toApiException()
    } catch (e: IOException) {
        throw ApiException(-1, "网络不可用，请检查连接", null, null)
    }
}

/** 无 data 返回（如标记已读、暂停计划成功仅返回状态对象时按 Unit 场景单独处理）。 */
suspend fun apiCallUnit(block: suspend () -> ApiResponse<*>) {
    try {
        val resp = block()
        if (resp.code != 0) throw ApiException(resp.code, resp.message, resp.traceId)
    } catch (e: ApiException) {
        throw e
    } catch (e: HttpException) {
        throw e.toApiException()
    } catch (e: IOException) {
        throw ApiException(-1, "网络不可用，请检查连接", null, null)
    }
}

private fun HttpException.toApiException(): ApiException {
    val status = code()
    val body: ResponseBody? = response()?.errorBody()
    if (body != null) {
        runCatching {
            val parsed = AppJson.decodeFromString<ApiResponse<kotlinx.serialization.json.JsonElement>>(body.string())
            return ApiException(
                parsed.code,
                parsed.message.ifBlank { "请求失败（HTTP $status）" },
                parsed.traceId,
                status,
            )
        }
    }
    return ApiException(status * 100, "请求失败（HTTP $status）", null, status)
}
