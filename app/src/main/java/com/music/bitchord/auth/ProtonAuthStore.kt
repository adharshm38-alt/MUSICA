package com.music.bitchord.auth

import android.content.Context
import android.content.SharedPreferences
import com.music.bitchord.BuildConfig
import com.music.bitchord.data.auth.ProtonSession
import org.json.JSONObject

/**
 * Encrypted-at-rest storage for Proton Mail authentication session and backend endpoint.
 */
class ProtonAuthStore(context: Context) {

    private val prefs: SharedPreferences =
        EncryptedPrefs.open(context, "musica_proton_auth", "musica_proton_auth_plain")

    var session: ProtonSession?
        get() {
            val raw = prefs.getString(KEY_SESSION, null) ?: return null
            return runCatching {
                val obj = JSONObject(raw)
                val userId = obj.optString("userId").takeIf { it.isNotBlank() } ?: return null
                val email = obj.optString("email").takeIf { it.isNotBlank() } ?: return null
                val token = obj.optString("token").takeIf { it.isNotBlank() } ?: return null
                ProtonSession(
                    userId = userId,
                    email = email,
                    name = obj.optString("name", email.substringBefore('@')),
                    token = token,
                    avatarUrl = obj.optString("avatarUrl", ""),
                )
            }.getOrNull()
        }
        set(value) {
            if (value == null) {
                prefs.edit().remove(KEY_SESSION).apply()
            } else {
                val json = JSONObject().apply {
                    put("userId", value.userId)
                    put("email", value.email)
                    put("name", value.name)
                    put("token", value.token)
                    put("avatarUrl", value.avatarUrl)
                }
                prefs.edit().putString(KEY_SESSION, json.toString()).apply()
            }
        }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, null)
            ?.trim()
            ?.trimEnd('/')
            ?.takeIf { it.isNotBlank() }
            ?: BuildConfig.PROTON_AUTH_SERVER
        set(value) {
            val clean = value.trim().trimEnd('/')
            if (clean.isBlank()) {
                prefs.edit().remove(KEY_SERVER_URL).apply()
            } else {
                prefs.edit().putString(KEY_SERVER_URL, clean).apply()
            }
        }

    val isSignedIn: Boolean
        get() = session != null

    fun saveSession(newSession: ProtonSession) {
        session = newSession
    }

    fun clearSession() {
        session = null
    }

    private companion object {
        const val KEY_SESSION = "proton_session_json"
        const val KEY_SERVER_URL = "proton_auth_server_url"
    }
}
