package com.music.bitchord.assistant

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.music.bitchord.assistant.wakeword.MusiWakeWordCoordinator
import com.music.bitchord.data.settings.AppSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

/**
 * State representation for MUSI voice assistant.
 */
sealed interface MusiState {
    object Idle : MusiState
    object Initializing : MusiState // "Waiting for voice..."
    data class Listening(val rmsDb: Float = 0f, val partialText: String = "", val isAutoRetry: Boolean = false) : MusiState
    data class Processing(val spokenText: String, val stepText: String = "") : MusiState
    data class Responding(val responseText: String, val spokenText: String? = null) : MusiState
    data class Error(val message: String, val canRetry: Boolean = true) : MusiState
}

/**
 * Core manager for the MUSI Personal Music Voice Assistant.
 * Uses pure Android SpeechRecognizer for speech-to-text and
 * Android TextToSpeech for spoken responses.
 * Strictly zero external or cloud dependencies.
 */
object MusiAssistantManager : TextToSpeech.OnInitListener {

    private const val TAG = "MusiAssistant"

    private val mainHandler = Handler(Looper.getMainLooper())

    private val _state = MutableStateFlow<MusiState>(MusiState.Idle)
    val state: StateFlow<MusiState> = _state.asStateFlow()

    private var speechRecognizer: SpeechRecognizer? = null
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false

    private var activeCommandCallback: ((MusiCommand) -> Unit)? = null
    private var autoRetryAttempted = false
    private var currentContext: Context? = null
    private var currentActivityContext: Context? = null

    /**
     * Initializes TextToSpeech engine eagerly so it is primed for responses.
     */
    fun init(context: Context) {
        currentActivityContext = context
        currentContext = context.applicationContext
        if (textToSpeech == null) {
            try {
                textToSpeech = TextToSpeech(context.applicationContext, this)
            } catch (e: Throwable) {
                Log.w(TAG, "Failed to initialize TextToSpeech", e)
            }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            ttsReady = true
            textToSpeech?.let { tts ->
                val locale = Locale.getDefault()
                if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                    tts.language = locale
                } else {
                    tts.language = Locale.US
                }
                tts.setPitch(1.0f)
                tts.setSpeechRate(1.0f)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                    val attrs = android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                    tts.setAudioAttributes(attrs)
                }
            }
        } else {
            ttsReady = false
            Log.w(TAG, "TextToSpeech initialization returned status $status")
        }
    }

    /**
     * Starts listening for voice commands if MUSI is enabled.
     */
    fun startListening(context: Context, onCommand: (MusiCommand) -> Unit) {
        currentActivityContext = context
        currentContext = context.applicationContext
        autoRetryAttempted = false

        if (!AppSettings.musiAssistantEnabled.value) {
            _state.value = MusiState.Error("MUSI is disabled. Enable it in Settings.", canRetry = false)
            speak("MUSI is disabled. Enable it in Settings.")
            return
        }

        // 1. Cleanly stop wake-word audio capture and release microphone ownership completely
        MusiWakeWordCoordinator.releaseMicrophone()

        _state.value = MusiState.Initializing
        activeCommandCallback = onCommand

        // 2. Allow 200ms settling time for Android Audio HAL to fully release microphone hardware
        mainHandler.postDelayed({
            startListeningInternal(context)
        }, 200L)
    }

    /**
     * Retries listening (e.g. from the user tapping the retry button).
     */
    fun retryListening() {
        val ctx = currentActivityContext ?: currentContext ?: return
        val cb = activeCommandCallback ?: return
        startListening(ctx, cb)
    }

    private fun startListeningInternal(context: Context) {
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                _state.value = MusiState.Error("Speech recognition is unavailable on this device.", canRetry = false)
                speak("Speech recognition is unavailable on this device.")
                return
            }

            // Reuse or cleanly instantiate SpeechRecognizer on the main thread
            if (speechRecognizer == null) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                    setRecognitionListener(createRecognitionListener(context))
                }
            } else {
                try {
                    speechRecognizer?.cancel()
                } catch (ignored: Throwable) {}
            }

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            }

            speechRecognizer?.startListening(intent)
        } catch (e: Throwable) {
            Log.e(TAG, "Error starting speech recognition", e)
            stopRecognizerOnly()
            _state.value = MusiState.Error("Failed to start voice recognition.", canRetry = true)
        }
    }

    private fun createRecognitionListener(context: Context) = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            Log.d(TAG, "SpeechRecognizer onReadyForSpeech")
            val current = _state.value
            if (current is MusiState.Initializing || current is MusiState.Idle || current is MusiState.Listening) {
                _state.value = MusiState.Listening(
                    rmsDb = 0f,
                    partialText = if (autoRetryAttempted) "Listening again..." else "",
                    isAutoRetry = autoRetryAttempted
                )
            }
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "SpeechRecognizer onBeginningOfSpeech - voice detected")
            _state.value = MusiState.Listening(0f, "")
        }

        override fun onRmsChanged(rmsdB: Float) {
            val current = _state.value
            if (current is MusiState.Listening) {
                val normalized = ((rmsdB + 2f) / 10f).coerceIn(0f, 1f)
                _state.value = current.copy(rmsDb = normalized)
            }
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            Log.d(TAG, "SpeechRecognizer onEndOfSpeech")
            val current = _state.value
            if (current is MusiState.Listening) {
                _state.value = MusiState.Processing(
                    spokenText = current.partialText.ifBlank { "Processing..." },
                    stepText = "Recognizing speech..."
                )
            }
        }

        override fun onError(error: Int) {
            Log.w(TAG, "SpeechRecognizer error: $error (autoRetryAttempted=$autoRetryAttempted)")

            val isTimeoutOrNoMatch = error == SpeechRecognizer.ERROR_NO_MATCH ||
                    error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT

            if (isTimeoutOrNoMatch && !autoRetryAttempted) {
                // Automatically retry listening once before displaying error
                autoRetryAttempted = true
                Log.i(TAG, "Attempting automatic single retry for speech recognition...")
                _state.value = MusiState.Listening(rmsDb = 0f, partialText = "Listening again...", isAutoRetry = true)
                mainHandler.postDelayed({
                    val ctx = currentActivityContext ?: currentContext ?: context
                    startListeningInternal(ctx)
                }, 250L)
                return
            }

            autoRetryAttempted = false
            val message = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error. Check microphone."
                SpeechRecognizer.ERROR_CLIENT -> "Speech recognition client error. Tap to try again."
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network error. Please check your connection."
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech heard. Tap the microphone to speak."
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Microphone was busy. Tap to try again."
                SpeechRecognizer.ERROR_SERVER -> "Voice server error. Please try again."
                else -> "Could not recognize speech (Error $error). Tap to try again."
            }

            // Keep wake-word STOPPED while Error screen is showing so user can tap retry without competition
            _state.value = MusiState.Error(message, canRetry = true)
        }

        override fun onResults(results: Bundle?) {
            autoRetryAttempted = false
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            Log.d(TAG, "SpeechRecognizer matches: $matches")

            if (matches.isNotEmpty()) {
                // Choose the best match by evaluating command parser across candidates
                var selectedText = matches.first().trim()
                var selectedCommand: MusiCommand = MusiCommandParser.parse(selectedText)

                if (selectedCommand is MusiCommand.Unknown) {
                    for (alt in matches.drop(1)) {
                        val candidateCmd = MusiCommandParser.parse(alt.trim())
                        if (candidateCmd !is MusiCommand.Unknown) {
                            selectedText = alt.trim()
                            selectedCommand = candidateCmd
                            break
                        }
                    }
                }

                _state.value = MusiState.Processing(selectedText, "Processing command...")
                activeCommandCallback?.invoke(selectedCommand)
            } else {
                _state.value = MusiState.Error("No speech detected. Tap the microphone to try again.", canRetry = true)
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val partialMatches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val partial = partialMatches?.firstOrNull()?.trim().orEmpty()
            if (partial.isNotBlank()) {
                val current = _state.value
                if (current is MusiState.Listening) {
                    _state.value = current.copy(partialText = partial)
                }
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun stopRecognizerOnly() {
        try {
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
        } catch (e: Throwable) {
            Log.w(TAG, "Error stopping recognizer", e)
        } finally {
            speechRecognizer = null
        }
    }

    /**
     * Updates the status step shown beneath the processed text.
     */
    fun setProcessingStep(step: String) {
        mainHandler.post {
            val current = _state.value
            if (current is MusiState.Processing) {
                _state.value = current.copy(stepText = step)
            }
        }
    }

    /**
     * Displays an error message state.
     */
    fun notifyError(message: String) {
        mainHandler.post {
            _state.value = MusiState.Error(message, canRetry = true)
            MusiWakeWordCoordinator.resume()
        }
    }

    /**
     * Speaks natural responses to the user via TextToSpeech.
     */
    fun speak(text: String, spokenQuery: String? = null, onDone: (() -> Unit)? = null) {
        if (!AppSettings.musiAssistantEnabled.value) return

        _state.value = MusiState.Responding(responseText = text, spokenText = spokenQuery)

        if (ttsReady && textToSpeech != null) {
            val utteranceId = "musi_utt_${System.currentTimeMillis()}"
            textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) {
                    if (id == utteranceId) {
                        mainHandler.post {
                            onDone?.invoke()
                            MusiWakeWordCoordinator.resume()
                        }
                    }
                }
                override fun onError(id: String?) {
                    if (id == utteranceId) {
                        mainHandler.post {
                            onDone?.invoke()
                            MusiWakeWordCoordinator.resume()
                        }
                    }
                }
            })
            textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        } else {
            // If TTS is unavailable or not ready yet, execute completion callback after brief delay
            mainHandler.postDelayed({
                onDone?.invoke()
                MusiWakeWordCoordinator.resume()
            }, 2000L)
        }
    }

    fun notifyPermissionDenied() {
        _state.value = MusiState.Error(
            message = "Microphone permission is required. Please allow microphone access in Android Settings.",
            canRetry = false
        )
        speak("Microphone permission is required for MUSI.")
    }

    /**
     * Dismisses the voice overlay without canceling any running playback operations.
     */
    fun dismissOverlay() {
        mainHandler.post {
            stopRecognizerOnly()
            _state.value = MusiState.Idle
            activeCommandCallback = null
            MusiWakeWordCoordinator.resume()
        }
    }

    /**
     * Cancels any active speech recognition, stops TTS, and resets state.
     */
    fun stop() {
        mainHandler.post {
            autoRetryAttempted = false
            MusiPlaybackController.cancel()
            stopInternal(clearState = true)
            MusiWakeWordCoordinator.resume()
        }
    }

    private fun stopInternal(clearState: Boolean) {
        stopRecognizerOnly()

        try {
            textToSpeech?.stop()
        } catch (e: Throwable) {
            Log.w(TAG, "Error stopping TextToSpeech", e)
        }

        if (clearState) {
            _state.value = MusiState.Idle
            activeCommandCallback = null
        }
    }

    /**
     * Full cleanup on app teardown.
     */
    fun release() {
        autoRetryAttempted = false
        MusiPlaybackController.cancel()
        MusiWakeWordCoordinator.stop()
        stop()
        try {
            textToSpeech?.shutdown()
        } catch (e: Throwable) {
            Log.w(TAG, "Error shutting down TextToSpeech", e)
        } finally {
            textToSpeech = null
            ttsReady = false
            currentContext = null
        }
    }
}
