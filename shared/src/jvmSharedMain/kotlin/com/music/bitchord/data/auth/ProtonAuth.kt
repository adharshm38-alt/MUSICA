package com.music.bitchord.data.auth

import com.music.bitchord.data.Http
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Authenticated Proton Mail MUSICA session.
 * Kept strictly separate from Google YouTube Music cookie sessions.
 */
data class ProtonSession(
    val userId: String,
    val email: String,
    val name: String,
    val token: String,
    val avatarUrl: String = "",
)

sealed class ProtonSendOtpResult {
    data class Success(val cooldownSeconds: Int, val expiresInSeconds: Int) : ProtonSendOtpResult()
    data class Error(val code: String, val message: String, val retryAfterSeconds: Int? = null) : ProtonSendOtpResult()
}

sealed class ProtonVerifyOtpResult {
    data class Success(val session: ProtonSession, val isNewUser: Boolean) : ProtonVerifyOtpResult()
    data class Error(val code: String, val message: String, val remainingAttempts: Int? = null) : ProtonVerifyOtpResult()
}

/**
 * HTTP client for the MUSICA Proton Mail OTP authentication and cloud user-data endpoints.
 */
object ProtonAuthClient {

    private val jsonParser = Json { ignoreUnknownKeys = true }
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val PROTON_DOMAINS = setOf(
        "proton.me",
        "protonmail.com",
        "pm.me",
        "protonmail.ch",
    )

    private val EMAIL_REGEX = Regex("^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$")

    fun isValidProtonEmail(rawEmail: String): Boolean {
        val email = rawEmail.trim().lowercase()
        if (!EMAIL_REGEX.matches(email)) return false
        val domain = email.substringAfter('@', "")
        return domain in PROTON_DOMAINS
    }

    suspend fun sendOtp(email: String, baseUrl: String): ProtonSendOtpResult = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        val url = "${baseUrl.trimEnd('/')}/api/auth/proton/send-otp"
        val payload = buildJsonObject { put("email", cleanEmail) }
        val request = Request.Builder()
            .url(url)
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        runCatching {
            Http.client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = runCatching { jsonParser.parseToJsonElement(text).jsonObject }.getOrNull()
                val isSuccess = json?.get("success")?.jsonPrimitive?.booleanOrNull == true
                if (response.isSuccessful && isSuccess) {
                    val cooldown = json["cooldownSeconds"]?.jsonPrimitive?.intOrNull ?: 60
                    val expires = json["expiresInSeconds"]?.jsonPrimitive?.intOrNull ?: 600
                    ProtonSendOtpResult.Success(
                        cooldownSeconds = cooldown,
                        expiresInSeconds = expires,
                    )
                } else {
                    val code = json?.get("error")?.jsonPrimitive?.contentOrNull ?: "http_${response.code}"
                    val message = json?.get("message")?.jsonPrimitive?.contentOrNull
                        ?: "Request failed (${response.code})"
                    val retryAfter = json?.get("retryAfter")?.jsonPrimitive?.intOrNull
                    ProtonSendOtpResult.Error(code, message, retryAfter)
                }
            }
        }.getOrElse { err ->
            ProtonSendOtpResult.Error(
                code = "network_error",
                message = err.message ?: "Unable to connect to authentication server.",
            )
        }
    }

    suspend fun verifyOtp(email: String, code: String, baseUrl: String): ProtonVerifyOtpResult = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        val cleanCode = code.trim()
        val url = "${baseUrl.trimEnd('/')}/api/auth/proton/verify-otp"
        val payload = buildJsonObject {
            put("email", cleanEmail)
            put("code", cleanCode)
        }
        val request = Request.Builder()
            .url(url)
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        runCatching {
            Http.client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = runCatching { jsonParser.parseToJsonElement(text).jsonObject }.getOrNull()
                val isSuccess = json?.get("success")?.jsonPrimitive?.booleanOrNull == true
                if (response.isSuccessful && isSuccess && json != null) {
                    val token = json["token"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    val user = json["user"]?.jsonObject
                    val userId = user?.get("id")?.jsonPrimitive?.contentOrNull.orEmpty()
                    if (token.isBlank() || userId.isBlank()) {
                        ProtonVerifyOtpResult.Error("invalid_response", "Invalid server session response.")
                    } else {
                        val session = ProtonSession(
                            userId = userId,
                            email = user?.get("email")?.jsonPrimitive?.contentOrNull ?: cleanEmail,
                            name = user?.get("name")?.jsonPrimitive?.contentOrNull ?: cleanEmail.substringBefore('@'),
                            token = token,
                            avatarUrl = user?.get("avatarUrl")?.jsonPrimitive?.contentOrNull.orEmpty(),
                        )
                        val isNew = json["isNewUser"]?.jsonPrimitive?.booleanOrNull == true
                        ProtonVerifyOtpResult.Success(
                            session = session,
                            isNewUser = isNew,
                        )
                    }
                } else {
                    val errCode = json?.get("error")?.jsonPrimitive?.contentOrNull ?: "http_${response.code}"
                    val message = json?.get("message")?.jsonPrimitive?.contentOrNull
                        ?: "Verification failed (${response.code})"
                    val remaining = json?.get("remainingAttempts")?.jsonPrimitive?.intOrNull
                    ProtonVerifyOtpResult.Error(errCode, message, remaining)
                }
            }
        }.getOrElse { err ->
            ProtonVerifyOtpResult.Error(
                code = "network_error",
                message = err.message ?: "Unable to verify code right now.",
            )
        }
    }

    suspend fun fetchProfile(token: String, baseUrl: String): Result<ProtonSession> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "${baseUrl.trimEnd('/')}/api/user/profile"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            Http.client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = jsonParser.parseToJsonElement(text).jsonObject
                if (!response.isSuccessful) {
                    val msg = json["message"]?.jsonPrimitive?.contentOrNull ?: "HTTP ${response.code}"
                    error(msg)
                }
                val user = json["user"]!!.jsonObject
                ProtonSession(
                    userId = user["id"]!!.jsonPrimitive.content,
                    email = user["email"]!!.jsonPrimitive.content,
                    name = user["name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    token = token,
                    avatarUrl = user["avatarUrl"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                )
            }
        }
    }

    suspend fun updateProfile(
        token: String,
        name: String?,
        avatarUrl: String?,
        baseUrl: String,
    ): Result<ProtonSession> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "${baseUrl.trimEnd('/')}/api/user/profile"
            val payload = buildJsonObject {
                if (name != null) put("name", name)
                if (avatarUrl != null) put("avatarUrl", avatarUrl)
            }
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .put(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build()
            Http.client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = jsonParser.parseToJsonElement(text).jsonObject
                if (!response.isSuccessful) {
                    val msg = json["message"]?.jsonPrimitive?.contentOrNull ?: "HTTP ${response.code}"
                    error(msg)
                }
                val user = json["user"]!!.jsonObject
                ProtonSession(
                    userId = user["id"]!!.jsonPrimitive.content,
                    email = user["email"]!!.jsonPrimitive.content,
                    name = user["name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    token = token,
                    avatarUrl = user["avatarUrl"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                )
            }
        }
    }

    suspend fun fetchLibrary(token: String, baseUrl: String): Result<JsonObject> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "${baseUrl.trimEnd('/')}/api/user/library"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            Http.client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = jsonParser.parseToJsonElement(text).jsonObject
                if (!response.isSuccessful) {
                    val msg = json["message"]?.jsonPrimitive?.contentOrNull ?: "HTTP ${response.code}"
                    error(msg)
                }
                json["library"]!!.jsonObject
            }
        }
    }

    suspend fun syncLibrary(
        token: String,
        payload: JsonObject,
        baseUrl: String,
    ): Result<JsonObject> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "${baseUrl.trimEnd('/')}/api/user/library/sync"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build()
            Http.client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = jsonParser.parseToJsonElement(text).jsonObject
                if (!response.isSuccessful) {
                    val msg = json["message"]?.jsonPrimitive?.contentOrNull ?: "HTTP ${response.code}"
                    error(msg)
                }
                json["library"]!!.jsonObject
            }
        }
    }
}
