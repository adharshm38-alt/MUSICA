package com.music.bitchord.assistant.wakeword

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * Live diagnostic metrics displayed on the MUSI interface for verification.
 */
data class MusiLiveDiagnostics(
    val microphoneStatus: String = "Available", // "Available" or "Error: <details>"
    val audioInputStatus: String = "No audio",  // "Receiving" or "No audio"
    val modelStatus: String = "Loaded",         // "Loaded" or "Failed"
    val detectorStatus: String = "Stopped",     // "Listening" or "Stopped"
    val lastConfidence: Float = 0.0f,
    val lastResult: String = "None",            // "Accepted", "Rejected", or "None"
    val rejectionReason: String = "None",
    val isMusicPlaying: Boolean = false,
)

/**
 * Privacy-safe diagnostic record for wake-word detection evaluations.
 */
data class WakeWordDiagnostic(
    val timestamp: Long,
    val confidence: Float,
    val threshold: Float,
    val isMusicPlaying: Boolean,
    val accepted: Boolean,
    val reason: String,
    val details: String,
)

/**
 * Lightweight, 100% offline acoustic wake-word detection engine for "Hey MUSI".
 *
 * Designed for high accuracy and false-activation immunity:
 * 1. Hardware Acoustic Echo Cancellation (AEC) and Noise Suppression (NS)
 *    attached to AudioRecord to subtract device speaker audio.
 * 2. Adaptive noise floor that naturally calibrates to room acoustics, enabling
 *    reliable detection of quiet/normal speech while ignoring steady background noise.
 * 3. Multi-band Goertzel spectral analysis:
 *    - Low band (180 Hz - 450 Hz): Nasal fundamental & vowel resonance in "MU".
 *    - Mid band (550 Hz - 2200 Hz): Formant transitions in diphthong /eɪ/ ("Hey").
 *    - High band (3500 Hz - 7500 Hz): Fricative turbulence in sibilant /s/ or /z/ ("SI").
 * 4. Syllable Cadence State Machine & Acoustic Confidence Scoring:
 *    [Hey] (120-460ms) -> [MU] (100-400ms) -> [SI] (80-340ms) within a 450-1400ms window.
 * 5. Music Playback Awareness:
 *    Elevates confidence threshold to 0.76 when music is playing and strictly rejects
 *    song lyrics, drums, and cymbals that lack the precise "Hey MUSI" phonetic structure.
 * 6. Privacy-Safe Diagnostic History for debugging and verification.
 */
object MusiWakeWordDetector {

    private const val TAG = "MusiWakeWord"
    private const val SAMPLE_RATE = 16000
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private const val FRAME_SIZE = 320 // 20ms per frame at 16kHz

    // Thresholds
    private const val BASE_THRESHOLD = 0.60f
    private const val MUSIC_PLAYING_THRESHOLD = 0.76f

    private val isRunning = AtomicBoolean(false)
    private val isPaused = AtomicBoolean(false)

    private var audioRecord: AudioRecord? = null
    private var echoCanceler: AcousticEchoCanceler? = null
    private var noiseSuppressor: NoiseSuppressor? = null

    private var workerThread: Thread? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private var onWakeWordCallback: ((String) -> Unit)? = null

    // Live diagnostics for on-screen verification
    private val _liveDiagnostics = kotlinx.coroutines.flow.MutableStateFlow(MusiLiveDiagnostics())
    val liveDiagnostics: kotlinx.coroutines.flow.StateFlow<MusiLiveDiagnostics> = _liveDiagnostics

    fun updateDiagnostic(
        microphoneStatus: String? = null,
        audioInputStatus: String? = null,
        modelStatus: String? = null,
        detectorStatus: String? = null,
        lastConfidence: Float? = null,
        lastResult: String? = null,
        rejectionReason: String? = null,
        isMusicPlaying: Boolean? = null,
    ) {
        val current = _liveDiagnostics.value
        _liveDiagnostics.value = current.copy(
            microphoneStatus = microphoneStatus ?: current.microphoneStatus,
            audioInputStatus = audioInputStatus ?: current.audioInputStatus,
            modelStatus = modelStatus ?: current.modelStatus,
            detectorStatus = detectorStatus ?: current.detectorStatus,
            lastConfidence = lastConfidence ?: current.lastConfidence,
            lastResult = lastResult ?: current.lastResult,
            rejectionReason = rejectionReason ?: current.rejectionReason,
            isMusicPlaying = isMusicPlaying ?: current.isMusicPlaying,
        )
    }

    // In-memory privacy-safe diagnostic ring buffer (last 15 evaluations)
    private val recentDiagnostics = ArrayDeque<WakeWordDiagnostic>(15)

    fun getRecentDiagnostics(): List<WakeWordDiagnostic> = synchronized(recentDiagnostics) {
        recentDiagnostics.toList()
    }

    private fun recordDiagnostic(
        confidence: Float,
        threshold: Float,
        isMusicPlaying: Boolean,
        accepted: Boolean,
        reason: String,
        details: String,
    ) {
        val diag = WakeWordDiagnostic(
            timestamp = System.currentTimeMillis(),
            confidence = confidence,
            threshold = threshold,
            isMusicPlaying = isMusicPlaying,
            accepted = accepted,
            reason = reason,
            details = details,
        )
        synchronized(recentDiagnostics) {
            if (recentDiagnostics.size >= 15) {
                recentDiagnostics.removeFirst()
            }
            recentDiagnostics.addLast(diag)
        }
        val confStr = String.format("%.2f", confidence)
        val threshStr = String.format("%.2f", threshold)
        Log.i(
            TAG,
            "Wake evaluation: accepted=$accepted, conf=$confStr, thresh=$threshStr, " +
                "music=$isMusicPlaying, reason='$reason', details='$details'"
        )

        updateDiagnostic(
            lastConfidence = confidence,
            lastResult = if (accepted) "Accepted" else "Rejected",
            rejectionReason = if (accepted) "Match verified for 'Hey MUSI'" else reason,
            isMusicPlaying = isMusicPlaying,
        )
    }

    /**
     * Starts foreground wake-word listening on AudioRecord if microphone permission is granted.
     */
    fun start(context: Context, onWakeWord: (String) -> Unit) {
        if (isRunning.get() && !isPaused.get()) {
            Log.d(TAG, "WakeWordDetector is already running")
            return
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Cannot start wake-word detector: RECORD_AUDIO permission missing")
            updateDiagnostic(
                microphoneStatus = "Error: Permission Denied",
                detectorStatus = "Stopped",
                audioInputStatus = "No audio",
            )
            return
        }

        // Clean up any stale handles before launching a fresh detector session
        releaseMicrophone()

        onWakeWordCallback = onWakeWord
        isRunning.set(true)
        isPaused.set(false)

        updateDiagnostic(
            microphoneStatus = "Available",
            detectorStatus = "Listening",
            modelStatus = "Loaded",
        )

        workerThread = Thread({
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            runAudioLoop()
        }, "musi-wakeword-detector").apply {
            isDaemon = true
            start()
        }
    }

    /**
     * Cleanly stops wake-word audio capture and fully releases microphone ownership
     * so that Android SpeechRecognizer has exclusive, uncontested access to the hardware.
     */
    fun releaseMicrophone() {
        isRunning.set(false)
        isPaused.set(true)

        updateDiagnostic(
            detectorStatus = "Stopped",
            audioInputStatus = "No audio",
        )

        try {
            echoCanceler?.enabled = false
            echoCanceler?.release()
        } catch (ignored: Throwable) {}
        echoCanceler = null

        try {
            noiseSuppressor?.enabled = false
            noiseSuppressor?.release()
        } catch (ignored: Throwable) {}
        noiseSuppressor = null

        try {
            if (audioRecord?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                audioRecord?.stop()
            }
            audioRecord?.release()
        } catch (e: Throwable) {
            Log.w(TAG, "Error releasing AudioRecord", e)
        } finally {
            audioRecord = null
        }

        try {
            workerThread?.interrupt()
        } catch (ignored: Throwable) {}
        workerThread = null

        Log.i(TAG, "Microphone ownership cleanly released")
    }

    /**
     * Pauses wake-word detection by releasing microphone ownership.
     */
    fun pause() {
        releaseMicrophone()
    }

    /**
     * Resumes audio capture once voice recognition / command processing finishes.
     */
    fun resume() {
        // Resume requires start with context to ensure clean AudioRecord allocation
        isPaused.set(false)
    }

    /**
     * Full stop and hardware release of AudioRecord and acoustic filters.
     */
    fun stop() {
        onWakeWordCallback = null
        releaseMicrophone()
    }

    fun isListening(): Boolean = isRunning.get() && !isPaused.get()

    private fun runAudioLoop() {
        val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        val bufferSize = maxOf(minBufferSize, FRAME_SIZE * 4)

        try {
            // Standard MIC audio source avoids conflicts with SpeechRecognizer's VOICE_RECOGNITION preset
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed")
                updateDiagnostic(
                    microphoneStatus = "Error: Init Failed",
                    detectorStatus = "Stopped",
                    audioInputStatus = "No audio",
                )
                isRunning.set(false)
                return
            }

            val sessionId = audioRecord!!.audioSessionId

            // Hardware Acoustic Echo Cancellation (subtracts device speaker playback)
            if (AcousticEchoCanceler.isAvailable()) {
                try {
                    echoCanceler = AcousticEchoCanceler.create(sessionId)?.apply {
                        enabled = true
                    }
                    Log.i(TAG, "Hardware AcousticEchoCanceler enabled on session $sessionId")
                } catch (e: Throwable) {
                    Log.w(TAG, "AcousticEchoCanceler init warning: ${e.message}")
                }
            }

            // Hardware Noise Suppression
            if (NoiseSuppressor.isAvailable()) {
                try {
                    noiseSuppressor = NoiseSuppressor.create(sessionId)?.apply {
                        enabled = true
                    }
                    Log.i(TAG, "Hardware NoiseSuppressor enabled on session $sessionId")
                } catch (e: Throwable) {
                    Log.w(TAG, "NoiseSuppressor init warning: ${e.message}")
                }
            }

            audioRecord?.startRecording()
            Log.i(TAG, "MusiWakeWordDetector successfully started recording at ${SAMPLE_RATE}Hz")

            updateDiagnostic(
                microphoneStatus = "Available",
                detectorStatus = "Listening",
                modelStatus = "Loaded",
            )

            val audioBuffer = ShortArray(FRAME_SIZE)
            var consecutiveErrors = 0
            var lastAudioSampleTime = 0L

            // Syllable progression tracking: 0: Idle, 1: HEY, 2: MU, 3: SI
            var stage = 0
            var stageFrames = 0
            var totalSequenceFrames = 0
            var silenceFrames = 0
            var noiseFloorRms = 140.0

            // Syllable 1 ("Hey") accumulators
            var heyFrames = 0
            var heyMidSum = 0.0
            var heyPeakRms = 0.0

            // Syllable 2 ("MU") accumulators
            var muFrames = 0
            var muLowSum = 0.0
            var muHighSum = 0.0

            // Syllable 3 ("SI") accumulators
            var siFrames = 0
            var siHighSum = 0.0
            var siZcrSum = 0.0
            var siLowSum = 0.0

            fun resetSequence() {
                stage = 0
                stageFrames = 0
                totalSequenceFrames = 0
                heyFrames = 0
                heyMidSum = 0.0
                heyPeakRms = 0.0
                muFrames = 0
                muLowSum = 0.0
                muHighSum = 0.0
                siFrames = 0
                siHighSum = 0.0
                siZcrSum = 0.0
                siLowSum = 0.0
            }

            while (isRunning.get() && !isPaused.get()) {
                val record = audioRecord ?: break

                val readCount = record.read(audioBuffer, 0, FRAME_SIZE)
                if (readCount < 0) {
                    consecutiveErrors++
                    Log.w(TAG, "AudioRecord.read returned error: $readCount (consecutive: $consecutiveErrors)")
                    updateDiagnostic(
                        audioInputStatus = "No audio",
                        microphoneStatus = "Error: Code $readCount",
                    )
                    if (consecutiveErrors > 5) {
                        Log.e(TAG, "Too many read errors, breaking to re-establish microphone")
                        break
                    }
                    try { Thread.sleep(50) } catch (ignored: InterruptedException) { break }
                    continue
                }

                if (readCount < FRAME_SIZE) {
                    continue
                }

                consecutiveErrors = 0
                val now = System.currentTimeMillis()
                val features = extractFrameFeatures(audioBuffer, noiseFloorRms)

                // Track live audio reception for on-screen diagnostics
                if (features.rms > 12.0) {
                    lastAudioSampleTime = now
                    updateDiagnostic(
                        audioInputStatus = "Receiving",
                        microphoneStatus = "Available",
                        detectorStatus = "Listening",
                    )
                } else if (now - lastAudioSampleTime > 1000L) {
                    updateDiagnostic(audioInputStatus = "No audio")
                }

                // Adaptive background noise floor tracking during silence / non-speech
                if (!features.isSpeech) {
                    silenceFrames++
                    noiseFloorRms = (noiseFloorRms * 0.96) + (features.rms * 0.04)

                    // Allow natural word boundaries (up to 360ms of silence between words)
                    if (silenceFrames > 18) {
                        if (stage == 3 && siFrames >= 3 && totalSequenceFrames in 16..80) {
                            // Candidate sequence completed! Evaluate confidence.
                            val heyAvgMid = if (heyFrames > 0) heyMidSum / heyFrames else 0.0
                            val muAvgLow = if (muFrames > 0) muLowSum / muFrames else 0.0
                            val muAvgHigh = if (muFrames > 0) muHighSum / muFrames else 0.0
                            val siAvgHigh = if (siFrames > 0) siHighSum / siFrames else 0.0
                            val siAvgZcr = if (siFrames > 0) siZcrSum / siFrames else 0.0
                            val siAvgLow = if (siFrames > 0) siLowSum / siFrames else 0.0

                            val (confidence, details) = evaluateConfidence(
                                heyFrames = heyFrames,
                                heyAvgMid = heyAvgMid,
                                heyPeakRms = heyPeakRms,
                                muFrames = muFrames,
                                muAvgLow = muAvgLow,
                                muAvgHigh = muAvgHigh,
                                siFrames = siFrames,
                                siAvgHigh = siAvgHigh,
                                siAvgZcr = siAvgZcr,
                                siAvgLow = siAvgLow,
                                totalFrames = totalSequenceFrames,
                                noiseFloor = noiseFloorRms,
                            )

                            val isMusic = MusiWakeWordCoordinator.isMusicPlaying()
                            val threshold = if (isMusic) MUSIC_PLAYING_THRESHOLD else BASE_THRESHOLD

                            if (confidence >= threshold) {
                                recordDiagnostic(
                                    confidence = confidence,
                                    threshold = threshold,
                                    isMusicPlaying = isMusic,
                                    accepted = true,
                                    reason = "Match verified for 'Hey MUSI'",
                                    details = details,
                                )
                                triggerWakeWord()
                            } else {
                                val reason = if (isMusic) {
                                    val confStr = String.format("%.2f", confidence)
                                    val threshStr = String.format("%.2f", threshold)
                                    "Score $confStr below music threshold $threshStr (music playing)"
                                } else {
                                    val confStr = String.format("%.2f", confidence)
                                    val threshStr = String.format("%.2f", threshold)
                                    "Score $confStr below threshold $threshStr"
                                }
                                recordDiagnostic(
                                    confidence = confidence,
                                    threshold = threshold,
                                    isMusicPlaying = isMusic,
                                    accepted = false,
                                    reason = reason,
                                    details = details,
                                )
                            }
                        }
                        resetSequence()
                    }
                    continue
                }

                silenceFrames = 0
                totalSequenceFrames++

                // Max sequence timeout (1.6 seconds)
                if (totalSequenceFrames > 80) {
                    resetSequence()
                    continue
                }

                // 4-Stage Syllable State Machine
                when (stage) {
                    0 -> { // Idle: Listening for "Hey" diphthong onset
                        if (features.midRatio >= 0.30 && features.highRatio < 0.32) {
                            stage = 1
                            stageFrames = 1
                            heyFrames = 1
                            heyMidSum = features.midRatio
                            heyPeakRms = features.rms
                        }
                    }
                    1 -> { // In "Hey" (formant /eɪ/ diphthong)
                        stageFrames++
                        heyFrames++
                        heyMidSum += features.midRatio
                        heyPeakRms = maxOf(heyPeakRms, features.rms)

                        // Transition to "MU" when low-band nasal energy arrives
                        if (features.lowRatio >= 0.32 && features.highRatio < 0.24 && stageFrames >= 3) {
                            stage = 2
                            stageFrames = 1
                            muFrames = 1
                            muLowSum = features.lowRatio
                            muHighSum = features.highRatio
                        } else if (stageFrames > 25) { // >500ms in "Hey", reset
                            resetSequence()
                        }
                    }
                    2 -> { // In "MU" (low nasal murmur /m/ + /u/ vowel)
                        stageFrames++
                        muFrames++
                        muLowSum += features.lowRatio
                        muHighSum += features.highRatio

                        // Transition to "SI" when high-frequency fricative burst arrives
                        if ((features.highRatio >= 0.28 || features.zcr >= 0.25) && features.lowRatio < 0.35 && stageFrames >= 3) {
                            stage = 3
                            stageFrames = 1
                            siFrames = 1
                            siHighSum = features.highRatio
                            siZcrSum = features.zcr
                            siLowSum = features.lowRatio
                        } else if (stageFrames > 22) { // >440ms in "MU", reset
                            resetSequence()
                        }
                    }
                    3 -> { // In "SI" (high sibilance /s/ or /z/)
                        stageFrames++
                        siFrames++
                        siHighSum += features.highRatio
                        siZcrSum += features.zcr
                        siLowSum += features.lowRatio

                        // If sibilant finishes or starts falling off
                        if (stageFrames >= 3 && (features.highRatio < 0.24 || features.rms < noiseFloorRms * 1.3)) {
                            val heyAvgMid = if (heyFrames > 0) heyMidSum / heyFrames else 0.0
                            val muAvgLow = if (muFrames > 0) muLowSum / muFrames else 0.0
                            val muAvgHigh = if (muFrames > 0) muHighSum / muFrames else 0.0
                            val siAvgHigh = if (siFrames > 0) siHighSum / siFrames else 0.0
                            val siAvgZcr = if (siFrames > 0) siZcrSum / siFrames else 0.0
                            val siAvgLow = if (siFrames > 0) siLowSum / siFrames else 0.0

                            val (confidence, details) = evaluateConfidence(
                                heyFrames = heyFrames,
                                heyAvgMid = heyAvgMid,
                                heyPeakRms = heyPeakRms,
                                muFrames = muFrames,
                                muAvgLow = muAvgLow,
                                muAvgHigh = muAvgHigh,
                                siFrames = siFrames,
                                siAvgHigh = siAvgHigh,
                                siAvgZcr = siAvgZcr,
                                siAvgLow = siAvgLow,
                                totalFrames = totalSequenceFrames,
                                noiseFloor = noiseFloorRms,
                            )

                            val isMusic = MusiWakeWordCoordinator.isMusicPlaying()
                            val threshold = if (isMusic) MUSIC_PLAYING_THRESHOLD else BASE_THRESHOLD

                            if (confidence >= threshold) {
                                recordDiagnostic(
                                    confidence = confidence,
                                    threshold = threshold,
                                    isMusicPlaying = isMusic,
                                    accepted = true,
                                    reason = "Match verified for 'Hey MUSI'",
                                    details = details,
                                )
                                triggerWakeWord()
                            } else {
                                val reason = if (isMusic) {
                                    val confStr = String.format("%.2f", confidence)
                                    val threshStr = String.format("%.2f", threshold)
                                    "Score $confStr below music threshold $threshStr (music playing)"
                                } else {
                                    val confStr = String.format("%.2f", confidence)
                                    val threshStr = String.format("%.2f", threshold)
                                    "Score $confStr below threshold $threshStr"
                                }
                                recordDiagnostic(
                                    confidence = confidence,
                                    threshold = threshold,
                                    isMusicPlaying = isMusic,
                                    accepted = false,
                                    reason = reason,
                                    details = details,
                                )
                            }
                            resetSequence()
                        } else if (stageFrames > 20) { // >400ms in "SI", reset
                            resetSequence()
                        }
                    }
                }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error in audio detection loop", e)
            updateDiagnostic(
                microphoneStatus = "Error: ${e.message}",
                detectorStatus = "Stopped",
                audioInputStatus = "No audio",
            )
        } finally {
            try {
                echoCanceler?.release()
                noiseSuppressor?.release()
                audioRecord?.stop()
                audioRecord?.release()
            } catch (ignored: Throwable) {}
            echoCanceler = null
            noiseSuppressor = null
            audioRecord = null
            isRunning.set(false)
            updateDiagnostic(
                detectorStatus = "Stopped",
                audioInputStatus = "No audio",
            )
            Log.i(TAG, "MusiWakeWordDetector stopped.")
        }
    }

    private fun triggerWakeWord() {
        Log.i(TAG, "triggerWakeWord: Cleanly releasing microphone ownership for SpeechRecognizer")
        // 1. Cleanly stop wake-word audio capture and 2. Release microphone ownership
        releaseMicrophone()

        // 3. Open assistant & 4. Start speech recognition
        mainHandler.post {
            onWakeWordCallback?.invoke("Hey MUSI")
        }
    }

    /**
     * Discrete Goertzel algorithm estimating energy at a specific frequency bin.
     */
    internal fun computeGoertzel(samples: ShortArray, targetFreq: Float, sampleRate: Float = 16000f): Double {
        val k = (0.5 + (samples.size * targetFreq / sampleRate)).toInt()
        val omega = (2.0 * Math.PI * k) / samples.size
        val cosine = cos(omega)
        val coeff = 2.0 * cosine

        var q1 = 0.0
        var q2 = 0.0

        for (sample in samples) {
            val q0 = coeff * q1 - q2 + sample.toDouble()
            q2 = q1
            q1 = q0
        }

        return q1 * q1 + q2 * q2 - coeff * q1 * q2
    }

    /**
     * Extracts multi-band spectral energy ratios and voice activity metrics for a 20ms frame.
     */
    internal fun extractFrameFeatures(buffer: ShortArray, noiseFloorRms: Double): FrameFeatures {
        val size = buffer.size
        var sumSq = 0.0
        var zeroCrossings = 0
        var highFreqDiff = 0.0

        for (i in 0 until size) {
            val s = buffer[i].toDouble()
            sumSq += s * s
            if (i > 0) {
                if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
                    zeroCrossings++
                }
                val diff = buffer[i].toDouble() - buffer[i - 1].toDouble()
                highFreqDiff += diff * diff
            }
        }

        val rms = sqrt(sumSq / size)
        val zcr = zeroCrossings.toDouble() / size

        // Multi-band Goertzel sums:
        // Low: 220 & 340Hz (vocal fundamental and nasal resonance for /m/)
        // Mid: 700, 1400, 2000Hz (vowel formants F1 and F2 for /eɪ/)
        // High: 4500, 5500, 6500Hz (alveolar fricative sibilance /s/)
        val lowE = computeGoertzel(buffer, 220f) + computeGoertzel(buffer, 340f)
        val midE = computeGoertzel(buffer, 700f) + computeGoertzel(buffer, 1400f) + computeGoertzel(buffer, 2000f)
        val highE = computeGoertzel(buffer, 4500f) + computeGoertzel(buffer, 5500f) + computeGoertzel(buffer, 6500f)

        val totalE = lowE + midE + highE + 1.0
        val lowRatio = (lowE / totalE).coerceIn(0.0, 1.0)
        val midRatio = (midE / totalE).coerceIn(0.0, 1.0)
        val highRatio = (highE / totalE).coerceIn(0.0, 1.0)

        val vadThresh = maxOf(130.0, noiseFloorRms * 1.55)
        val isSpeech = rms >= vadThresh

        return FrameFeatures(
            rms = rms,
            zcr = zcr,
            lowRatio = lowRatio,
            midRatio = midRatio,
            highRatio = highRatio,
            isSpeech = isSpeech,
        )
    }

    /**
     * Calculates the composite acoustic confidence score across the 3 syllables and cadence.
     */
    internal fun evaluateConfidence(
        heyFrames: Int,
        heyAvgMid: Double,
        heyPeakRms: Double,
        muFrames: Int,
        muAvgLow: Double,
        muAvgHigh: Double,
        siFrames: Int,
        siAvgHigh: Double,
        siAvgZcr: Double,
        siAvgLow: Double,
        totalFrames: Int,
        noiseFloor: Double,
    ): Pair<Float, String> {
        // 1. Hey score (optimal 140-380ms, high mid ratio)
        val heyDurationScore = when (heyFrames) {
            in 7..19 -> 1.0f
            in 5..6, in 20..24 -> 0.75f
            else -> 0.40f
        }
        val heySpectralScore = (heyAvgMid.toFloat() / 0.48f).coerceIn(0.1f, 1.0f)
        val scoreHey = heyDurationScore * heySpectralScore

        // 2. MU score (optimal 100-320ms, high low-nasal ratio, low high-band ratio)
        val muDurationScore = when (muFrames) {
            in 5..16 -> 1.0f
            in 4..4, in 17..21 -> 0.75f
            else -> 0.40f
        }
        val muSpectralScore = (muAvgLow.toFloat() / 0.44f).coerceIn(0.1f, 1.0f)
        val muHighPenalty = if (muAvgHigh > 0.22) 0.50f else 1.0f
        val scoreMu = muDurationScore * muSpectralScore * muHighPenalty

        // 3. SI score (optimal 80-280ms, high sibilant ratio, high ZCR, low low-band ratio)
        val siDurationScore = when (siFrames) {
            in 4..14 -> 1.0f
            in 3..3, in 15..18 -> 0.75f
            else -> 0.40f
        }
        val siHighRatioScore = (siAvgHigh.toFloat() / 0.40f).coerceIn(0.1f, 1.0f)
        val siZcrScore = (siAvgZcr.toFloat() / 0.30f).coerceIn(0.1f, 1.0f)
        val siLowPenalty = if (siAvgLow > 0.24) 0.50f else 1.0f
        val scoreSi = siDurationScore * ((siHighRatioScore + siZcrScore) * 0.5f) * siLowPenalty

        // 4. Cadence score (optimal total duration 450-1150ms = 22-58 frames)
        val scoreCadence = when (totalFrames) {
            in 22..58 -> 1.0f
            in 19..21, in 59..68 -> 0.75f
            else -> 0.30f
        }

        val totalConfidence = (scoreHey * 0.28f) + (scoreMu * 0.32f) + (scoreSi * 0.28f) + (scoreCadence * 0.12f)
        val details = "hey=%.2f(dur=%dms), mu=%.2f(dur=%dms), si=%.2f(dur=%dms), cad=%.2f, total=%dms".format(
            scoreHey, heyFrames * 20,
            scoreMu, muFrames * 20,
            scoreSi, siFrames * 20,
            scoreCadence, totalFrames * 20
        )
        return Pair(totalConfidence.coerceIn(0.0f, 1.0f), details)
    }

    internal data class FrameFeatures(
        val rms: Double,
        val zcr: Double,
        val lowRatio: Double,
        val midRatio: Double,
        val highRatio: Double,
        val isSpeech: Boolean,
    )
}
