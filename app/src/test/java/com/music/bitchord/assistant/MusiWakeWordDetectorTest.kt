package com.music.bitchord.assistant

import com.music.bitchord.assistant.wakeword.MusiWakeWordCoordinator
import com.music.bitchord.assistant.wakeword.MusiWakeWordDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sin

class MusiWakeWordDetectorTest {

    @Test
    fun testInitialState() {
        assertFalse(MusiWakeWordDetector.isListening())
    }

    @Test
    fun testCoordinatorForegroundState() {
        assertFalse(MusiWakeWordCoordinator.isForeground())
        MusiWakeWordCoordinator.stop()
        assertFalse(MusiWakeWordDetector.isListening())
    }

    @Test
    fun testGoertzelFrequencyTargeting() {
        val sampleRate = 16000f
        val frameSize = 320

        // 1. Generate 250Hz sine wave (Low band)
        val lowWave = ShortArray(frameSize) { i ->
            (sin(2.0 * Math.PI * 250.0 * i / sampleRate) * 10000).toInt().toShort()
        }
        val lowE = MusiWakeWordDetector.computeGoertzel(lowWave, 220f, sampleRate)
        val highE = MusiWakeWordDetector.computeGoertzel(lowWave, 5000f, sampleRate)
        assertTrue("Low band energy must exceed high band on 250Hz wave", lowE > highE * 10)

        // 2. Generate 5500Hz sine wave (High band)
        val highWave = ShortArray(frameSize) { i ->
            (sin(2.0 * Math.PI * 5500.0 * i / sampleRate) * 10000).toInt().toShort()
        }
        val lowE2 = MusiWakeWordDetector.computeGoertzel(highWave, 220f, sampleRate)
        val highE2 = MusiWakeWordDetector.computeGoertzel(highWave, 6000f, sampleRate)
        assertTrue("High band energy must exceed low band on 5500Hz wave", highE2 > lowE2 * 10)
    }

    @Test
    fun testFrameFeaturesExtraction() {
        val sampleRate = 16000f
        val frameSize = 320

        // Mid-vowel test frame (1000Hz)
        val midFrame = ShortArray(frameSize) { i ->
            (sin(2.0 * Math.PI * 1000.0 * i / sampleRate) * 8000).toInt().toShort()
        }
        val midFeatures = MusiWakeWordDetector.extractFrameFeatures(midFrame, noiseFloorRms = 150.0)
        assertTrue("Mid ratio must be dominant on 1000Hz wave", midFeatures.midRatio > midFeatures.highRatio)
        assertTrue("Mid frame must be detected as speech above noise floor", midFeatures.isSpeech)

        // High sibilant noise test frame (5500Hz wave representing /s/ fricative)
        val sibilantFrame = ShortArray(frameSize) { i ->
            (sin(2.0 * Math.PI * 5500.0 * i / sampleRate) * 6000).toInt().toShort()
        }
        val sibilantFeatures = MusiWakeWordDetector.extractFrameFeatures(sibilantFrame, noiseFloorRms = 150.0)
        assertTrue("ZCR must be high on sibilant frame", sibilantFeatures.zcr > 0.40)
        assertTrue("High ratio must be elevated on sibilant frame", sibilantFeatures.highRatio > 0.35)
    }

    @Test
    fun testGenuineHeyMusiConfidenceScoring() {
        // Ideal "Hey MUSI" sequence:
        // Syllable 1 ("Hey"): 12 frames (240ms), midRatio ~0.55
        // Syllable 2 ("MU"): 10 frames (200ms), lowRatio ~0.50, highRatio ~0.08
        // Syllable 3 ("SI"): 9 frames (180ms), highRatio ~0.48, zcr ~0.36, lowRatio ~0.06
        // Total duration: 33 frames (660ms)
        val (confidence, details) = MusiWakeWordDetector.evaluateConfidence(
            heyFrames = 12,
            heyAvgMid = 0.55,
            heyPeakRms = 1200.0,
            muFrames = 10,
            muAvgLow = 0.52,
            muAvgHigh = 0.08,
            siFrames = 9,
            siAvgHigh = 0.48,
            siAvgZcr = 0.36,
            siAvgLow = 0.06,
            totalFrames = 33,
            noiseFloor = 140.0,
        )

        assertTrue("Genuine 'Hey MUSI' confidence must exceed 0.85 (got $confidence)", confidence >= 0.85f)
        assertTrue("Must pass idle threshold (0.60)", confidence >= 0.60f)
        assertTrue("Must pass music-playing threshold (0.76)", confidence >= 0.76f)
    }

    @Test
    fun testMusicLyricsAndPercussionRejection() {
        // Music scenario: Bass drum + cymbal crash + background singing
        // Syllable 1 missing or distorted (heyAvgMid ~0.25)
        // Syllable 2 has high high-frequency bleed from cymbals (muAvgHigh ~0.45)
        // Syllable 3 has high low-frequency bleed from bass/drums (siAvgLow ~0.48)
        val (confidence, details) = MusiWakeWordDetector.evaluateConfidence(
            heyFrames = 5,
            heyAvgMid = 0.25,
            heyPeakRms = 800.0,
            muFrames = 8,
            muAvgLow = 0.28,
            muAvgHigh = 0.45, // Heavy cymbal bleed during "MU"
            siFrames = 6,
            siAvgHigh = 0.30,
            siAvgZcr = 0.20,
            siAvgLow = 0.48,  // Heavy bass bleed during "SI"
            totalFrames = 30,
            noiseFloor = 500.0,
        )

        assertTrue("Music lyrics/percussion must score low (got $confidence)", confidence < 0.55f)
        assertFalse("Must be rejected under music-playing threshold (0.76)", confidence >= 0.76f)
        assertFalse("Must be rejected under idle threshold (0.60)", confidence >= 0.60f)
    }

    @Test
    fun testQuietSpeechConfidence() {
        // Quiet / normal conversational speech at normal distance:
        // Lower peak RMS (~350.0), but natural vocal formants and cadence preserved
        val (confidence, _) = MusiWakeWordDetector.evaluateConfidence(
            heyFrames = 10,
            heyAvgMid = 0.48,
            heyPeakRms = 350.0,
            muFrames = 9,
            muAvgLow = 0.46,
            muAvgHigh = 0.10,
            siFrames = 8,
            siAvgHigh = 0.42,
            siAvgZcr = 0.32,
            siAvgLow = 0.08,
            totalFrames = 30,
            noiseFloor = 90.0,
        )

        assertTrue("Quiet speech with clear phonemes must score high (got $confidence)", confidence >= 0.78f)
        assertTrue("Must pass idle threshold (0.60)", confidence >= 0.60f)
    }

    @Test
    fun testDiagnosticsHistoryRecording() {
        val recent = MusiWakeWordDetector.getRecentDiagnostics()
        // Verify buffer is safe and non-null
        assertTrue(recent.size <= 15)
    }

    @Test
    fun testLiveDiagnosticsAndReleaseMicrophone() {
        val live = MusiWakeWordDetector.liveDiagnostics.value
        assertEquals("Available", live.microphoneStatus)
        assertEquals("Loaded", live.modelStatus)

        // Verify microphone release cleans up and updates diagnostics
        MusiWakeWordDetector.releaseMicrophone()
        assertFalse(MusiWakeWordDetector.isListening())
        val afterRelease = MusiWakeWordDetector.liveDiagnostics.value
        assertEquals("Stopped", afterRelease.detectorStatus)
        assertEquals("No audio", afterRelease.audioInputStatus)
    }
}
