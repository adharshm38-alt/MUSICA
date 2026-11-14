package com.music.bitchord.data

import com.music.bitchord.data.auth.ProtonAuthClient
import com.music.bitchord.data.auth.ProtonSendOtpResult
import com.music.bitchord.data.auth.ProtonVerifyOtpResult
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProtonAuthTest {

    private lateinit var server: MockWebServer

    @BeforeTest
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @AfterTest
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun testValidProtonEmails() {
        assertTrue(ProtonAuthClient.isValidProtonEmail("user@proton.me"))
        assertTrue(ProtonAuthClient.isValidProtonEmail("first.last@protonmail.com"))
        assertTrue(ProtonAuthClient.isValidProtonEmail("short@pm.me"))
        assertTrue(ProtonAuthClient.isValidProtonEmail("swiss@protonmail.ch"))
        assertTrue(ProtonAuthClient.isValidProtonEmail("USER.UPPER@PROTON.ME"))

        assertFalse(ProtonAuthClient.isValidProtonEmail("user@gmail.com"))
        assertFalse(ProtonAuthClient.isValidProtonEmail("user@yahoo.com"))
        assertFalse(ProtonAuthClient.isValidProtonEmail("user@outlook.com"))
        assertFalse(ProtonAuthClient.isValidProtonEmail("notanemail"))
        assertFalse(ProtonAuthClient.isValidProtonEmail("@proton.me"))
        assertFalse(ProtonAuthClient.isValidProtonEmail("user@"))
    }

    @Test
    fun testSendOtpSuccess() = runBlocking {
        val json = """
            {
                "success": true,
                "message": "Verification code sent to your Proton email.",
                "cooldownSeconds": 60,
                "expiresInSeconds": 600
            }
        """.trimIndent()
        server.enqueue(MockResponse().setResponseCode(200).setBody(json))

        val result = ProtonAuthClient.sendOtp("tester@proton.me", server.url("/").toString())
        assertTrue(result is ProtonSendOtpResult.Success)
        val success = result as ProtonSendOtpResult.Success
        assertEquals(60, success.cooldownSeconds)
        assertEquals(600, success.expiresInSeconds)

        val recorded = server.takeRequest()
        assertEquals("/api/auth/proton/send-otp", recorded.path)
        assertTrue(recorded.body.readUtf8().contains("tester@proton.me"))
    }

    @Test
    fun testSendOtpCooldown() = runBlocking {
        val json = """
            {
                "error": "cooldown_active",
                "message": "Please wait 45 seconds before requesting a new code.",
                "retryAfter": 45
            }
        """.trimIndent()
        server.enqueue(MockResponse().setResponseCode(429).setBody(json))

        val result = ProtonAuthClient.sendOtp("tester@proton.me", server.url("/").toString())
        assertTrue(result is ProtonSendOtpResult.Error)
        val error = result as ProtonSendOtpResult.Error
        assertEquals("cooldown_active", error.code)
        assertEquals(45, error.retryAfterSeconds)
    }

    @Test
    fun testVerifyOtpSuccess() = runBlocking {
        val json = """
            {
                "success": true,
                "token": "mock.jwt.token",
                "isNewUser": true,
                "user": {
                    "id": "musica_proton_1234567890abcdef",
                    "email": "tester@proton.me",
                    "name": "tester",
                    "avatarUrl": ""
                }
            }
        """.trimIndent()
        server.enqueue(MockResponse().setResponseCode(200).setBody(json))

        val result = ProtonAuthClient.verifyOtp("tester@proton.me", "123456", server.url("/").toString())
        assertTrue(result is ProtonVerifyOtpResult.Success)
        val success = result as ProtonVerifyOtpResult.Success
        assertTrue(success.isNewUser)
        assertEquals("musica_proton_1234567890abcdef", success.session.userId)
        assertEquals("tester@proton.me", success.session.email)
        assertEquals("mock.jwt.token", success.session.token)

        val recorded = server.takeRequest()
        assertEquals("/api/auth/proton/verify-otp", recorded.path)
    }

    @Test
    fun testVerifyOtpIncorrectCode() = runBlocking {
        val json = """
            {
                "error": "incorrect_code",
                "message": "Incorrect code. 3 attempts remaining.",
                "remainingAttempts": 3
            }
        """.trimIndent()
        server.enqueue(MockResponse().setResponseCode(400).setBody(json))

        val result = ProtonAuthClient.verifyOtp("tester@proton.me", "000000", server.url("/").toString())
        assertTrue(result is ProtonVerifyOtpResult.Error)
        val error = result as ProtonVerifyOtpResult.Error
        assertEquals("incorrect_code", error.code)
        assertEquals(3, error.remainingAttempts)
    }
}
