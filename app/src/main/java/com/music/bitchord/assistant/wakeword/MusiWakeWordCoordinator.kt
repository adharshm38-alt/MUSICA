package com.music.bitchord.assistant.wakeword

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.music.bitchord.data.settings.AppSettings
import java.util.concurrent.atomic.AtomicBoolean

/**
 * High-level coordinator bridging UI, Settings, and the WakeWordDetector.
 *
 * Enforces strict foreground-only wake-word activation:
 * - Detects "Hey MUSI" ONLY when the MUSICA application is in the foreground and visible.
 * - Uses ProcessLifecycleOwner to reliably observe application foreground/background state.
 * - Immediately halts audio capture and releases the microphone when MUSICA leaves foreground.
 * - Automatically resumes detection when MUSICA returns to foreground (if settings are enabled).
 * - Survives Activity configuration changes without duplicate listeners or microphone leaks.
 */
object MusiWakeWordCoordinator {

    private const val TAG = "MusiWakeWordCoord"

    private val isAppForeground = AtomicBoolean(false)
    private var appContext: Context? = null
    private var triggerCallback: (() -> Unit)? = null
    private var isObserverInstalled = false
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Installs ProcessLifecycleOwner observer. Call once from Application.onCreate().
     */
    fun install(app: Application) {
        appContext = app.applicationContext
        if (isObserverInstalled) return
        isObserverInstalled = true

        mainHandler.post {
            val lifecycle = ProcessLifecycleOwner.get().lifecycle
            val currentlyStarted = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
            isAppForeground.set(currentlyStarted)
            Log.d(TAG, "MusiWakeWordCoordinator installed. Initial foreground state: $currentlyStarted")

            lifecycle.addObserver(object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    Log.d(TAG, "MUSICA entered foreground -> evaluating wake-word state")
                    isAppForeground.set(true)
                    evaluateListeningState()
                }

                override fun onStop(owner: LifecycleOwner) {
                    Log.d(TAG, "MUSICA left foreground -> stopping wake-word & releasing microphone")
                    isAppForeground.set(false)
                    stopListening()
                }
            })
        }
    }

    /**
     * Registers the UI trigger callback (e.g. from MainActivity).
     */
    fun registerTriggerCallback(callback: () -> Unit) {
        triggerCallback = callback
        evaluateListeningState()
    }

    /**
     * Unregisters the UI trigger callback.
     */
    fun unregisterTriggerCallback() {
        triggerCallback = null
        stopListening()
    }

    /**
     * Updates state from Compose or Settings screens.
     */
    fun updateState(context: Context, onWakeWordTriggered: (() -> Unit)? = null) {
        appContext = context.applicationContext
        if (onWakeWordTriggered != null) {
            triggerCallback = onWakeWordTriggered
        }
        evaluateListeningState()
    }

    /**
     * Evaluates whether wake-word detection should actively run.
     * Must ONLY run if:
     * 1. MUSICA is in the foreground (isAppForeground == true).
     * 2. MUSI Assistant setting is ON.
     * 3. Wake Word Detection setting is ON.
     * 4. RECORD_AUDIO permission is granted.
     * 5. A trigger callback is registered.
     */
    fun evaluateListeningState() {
        val inForeground = isAppForeground.get()
        val assistantEnabled = AppSettings.musiAssistantEnabled.value
        val wakeWordEnabled = AppSettings.musiWakeWordEnabled.value
        val context = appContext
        val hasPermission = context != null &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val hasCallback = triggerCallback != null

        val shouldListen = inForeground && assistantEnabled && wakeWordEnabled && hasPermission && hasCallback

        Log.d(TAG, "evaluateListeningState: inFg=$inForeground, asst=$assistantEnabled, ww=$wakeWordEnabled, perm=$hasPermission, cb=$hasCallback => shouldListen=$shouldListen")

        if (shouldListen && context != null) {
            if (!MusiWakeWordDetector.isListening()) {
                Log.i(TAG, "Starting wake-word detector in foreground with clean AudioRecord")
                MusiWakeWordDetector.start(context) { wakeWord ->
                    mainHandler.post {
                        if (isAppForeground.get()) {
                            Log.i(TAG, "Wake word detected in foreground: $wakeWord")
                            triggerCallback?.invoke()
                        } else {
                            Log.d(TAG, "Wake word detected but app is in background; ignoring")
                        }
                    }
                }
            }
        } else {
            stopListening()
        }
    }

    /**
     * Completely releases microphone hardware ownership so SpeechRecognizer has exclusive capture.
     */
    fun releaseMicrophone() {
        MusiWakeWordDetector.releaseMicrophone()
    }

    /**
     * Temporarily pauses wake-word detection (e.g. while speech recognition is active).
     */
    fun pause() {
        MusiWakeWordDetector.releaseMicrophone()
    }

    /**
     * Resumes wake-word detection once speech recognition / voice response has finished.
     * Only resumes if MUSICA is STILL in the foreground!
     */
    fun resume() {
        mainHandler.postDelayed({
            if (isAppForeground.get() && AppSettings.musiAssistantEnabled.value && AppSettings.musiWakeWordEnabled.value) {
                evaluateListeningState()
            } else {
                stopListening()
            }
        }, 150L)
    }

    /**
     * Completely stops wake-word detection and any active service, releasing microphone.
     */
    fun stop(context: Context? = null) {
        if (context != null) appContext = context.applicationContext
        stopListening()
    }

    private fun stopListening() {
        MusiWakeWordDetector.stop()
        appContext?.let {
            try {
                MusiWakeWordService.stop(it)
            } catch (e: Throwable) {
                Log.w(TAG, "Error stopping MusiWakeWordService", e)
            }
        }
    }

    private val isPlayerMusicPlaying = AtomicBoolean(false)

    /**
     * Called strictly from the Main Thread (e.g. from Player.Listener)
     * to safely publish playback status without cross-thread MediaController calls.
     */
    fun setMusicPlaying(playing: Boolean) {
        isPlayerMusicPlaying.set(playing)
    }

    /**
     * Checks whether music is currently actively playing through the player or system audio output.
     * Safe to call from ANY thread (including the wake-word audio processing thread).
     */
    fun isMusicPlaying(): Boolean {
        if (isPlayerMusicPlaying.get()) return true
        val context = appContext ?: return false
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager
        return am?.isMusicActive == true
    }

    fun isForeground(): Boolean = isAppForeground.get()
}
