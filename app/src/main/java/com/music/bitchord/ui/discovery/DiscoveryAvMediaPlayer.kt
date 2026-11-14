package com.music.bitchord.ui.discovery

import android.content.Context
import android.view.TextureView
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.metrolist.innertubex.extraction.StreamResolveException
import com.music.bitchord.data.Http
import com.music.bitchord.data.innertube.InnerTubeXResolver
import com.music.bitchord.playback.ChunkedDataSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

data class DiscoveryAvState(
    val activeVideoId: String? = null,
    val loading: Boolean = false,
    val renderedFirstFrame: Boolean = false,
    val isPlaying: Boolean = false,
    val muted: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val aspect: Float = 16f / 9f,
    val unavailable: Boolean = false,
)

/**
 * Single reusable audio+video ExoPlayer controller shared across Stage 2
 * vertical feed and Stage 3 full music video playback. Ensures at most ONE
 * active video decoder/player ever runs at a time.
 */
@OptIn(UnstableApi::class)
class DiscoveryAvMediaPlayer(
    private val context: Context,
    private val onUnmutedAudioRequested: () -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var player: ExoPlayer? = null
    private var surface: TextureView? = null
    private var loadJob: Job? = null
    private var progressJob: Job? = null
    private var loadedProfileId: String? = null
    private var loopOnEnd: Boolean = true
    private var maxHeightCap: Int = 720
    private var userPaused: Boolean = false

    private val refusedClients = ConcurrentHashMap<String, MutableSet<String>>()
    private val ageGated = ConcurrentHashMap.newKeySet<String>()

    private val _state = MutableStateFlow(DiscoveryAvState())
    val state: StateFlow<DiscoveryAvState> = _state.asStateFlow()

    private val listener = object : Player.Listener {
        override fun onRenderedFirstFrame() {
            _state.value = _state.value.copy(
                renderedFirstFrame = true,
                loading = false,
                unavailable = false,
            )
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            val w = videoSize.width * videoSize.pixelWidthHeightRatio
            if (w > 0f && videoSize.height > 0) {
                _state.value = _state.value.copy(aspect = w / videoSize.height)
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            val exo = player ?: return
            val dur = exo.duration.takeIf { it != C.TIME_UNSET && it > 0L } ?: _state.value.durationMs
            val isBuffering = playbackState == Player.STATE_BUFFERING && !_state.value.renderedFirstFrame
            _state.value = _state.value.copy(
                durationMs = dur,
                loading = isBuffering,
            )
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _state.value = _state.value.copy(isPlaying = isPlaying)
        }

        override fun onPlayerError(error: PlaybackException) {
            val id = _state.value.activeVideoId ?: return
            val isRefusal = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
                .any { it.responseCode in REFUSAL_CODES }
            val profile = loadedProfileId
            if (isRefusal && profile != null) {
                val skips = refusedClients.getOrPut(id) { ConcurrentHashMap.newKeySet() }
                if (skips.add(profile) && skips.size <= 2) {
                    startLoad(id, seekToMs = player?.currentPosition?.coerceAtLeast(0L) ?: 0L)
                    return
                }
            }
            _state.value = _state.value.copy(
                loading = false,
                isPlaying = false,
                unavailable = true,
            )
        }
    }

    fun attachSurface(view: TextureView?) {
        if (surface === view) return
        surface?.let { prev -> player?.clearVideoTextureView(prev) }
        surface = view
        if (view != null) {
            player?.setVideoTextureView(view)
        }
    }

    fun playVideo(
        videoId: String,
        muted: Boolean,
        loop: Boolean,
        maxHeight: Int,
        initialSeekMs: Long = 0L,
    ) {
        val exo = ensurePlayer()
        val sameVideo = _state.value.activeVideoId == videoId &&
            exo.playbackState != Player.STATE_IDLE &&
            !_state.value.unavailable

        loopOnEnd = loop
        maxHeightCap = maxHeight
        exo.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        setMuted(muted)

        if (sameVideo) {
            userPaused = false
            exo.playWhenReady = true
            return
        }

        userPaused = false
        exo.stop()
        exo.clearMediaItems()
        _state.value = _state.value.copy(
            activeVideoId = videoId,
            loading = true,
            renderedFirstFrame = false,
            isPlaying = false,
            durationMs = 0L,
            positionMs = initialSeekMs,
            unavailable = false,
        )
        startLoad(videoId, seekToMs = initialSeekMs)
    }

    fun setMuted(muted: Boolean) {
        if (!muted) onUnmutedAudioRequested()
        _state.value = _state.value.copy(muted = muted)
        player?.volume = if (muted) 0f else 1f
    }

    fun toggleMuted(): Boolean {
        val next = !_state.value.muted
        setMuted(next)
        return next
    }

    fun setPlaying(play: Boolean) {
        userPaused = !play
        if (play && !_state.value.muted) onUnmutedAudioRequested()
        player?.playWhenReady = play
    }

    fun togglePlayPause() {
        val exo = player ?: return
        setPlaying(!exo.playWhenReady)
    }

    fun seekTo(positionMs: Long) {
        val exo = player ?: return
        val clamped = positionMs.coerceAtLeast(0L)
        exo.seekTo(clamped)
        _state.value = _state.value.copy(positionMs = clamped)
    }

    fun pause() {
        player?.playWhenReady = false
    }

    fun resumeIfNotPausedByUser() {
        val exo = player ?: return
        if (!userPaused && _state.value.activeVideoId != null && !_state.value.unavailable) {
            if (!_state.value.muted) onUnmutedAudioRequested()
            exo.playWhenReady = true
        }
    }

    fun retry() {
        val id = _state.value.activeVideoId ?: return
        _state.value = _state.value.copy(loading = true, unavailable = false)
        startLoad(id, seekToMs = _state.value.positionMs)
    }

    fun release() {
        loadJob?.cancel()
        progressJob?.cancel()
        surface = null
        player?.let { exo ->
            exo.removeListener(listener)
            exo.release()
        }
        player = null
        _state.value = DiscoveryAvState()
    }

    private fun startLoad(videoId: String, seekToMs: Long) {
        loadJob?.cancel()
        loadJob = scope.launch {
            val stream = resolveAvStream(videoId, maxHeightCap)
            if (_state.value.activeVideoId != videoId) return@launch
            if (stream == null) {
                _state.value = _state.value.copy(
                    loading = false,
                    isPlaying = false,
                    unavailable = true,
                )
                return@launch
            }
            loadedProfileId = stream.profileId
            val exo = ensurePlayer()
            surface?.let { exo.setVideoTextureView(it) }

            val upstream = OkHttpDataSource.Factory(Http.client)
                .setDefaultRequestProperties(stream.headers)
            val chunked = ChunkedDataSource.Factory(upstream, CHUNK_BYTES.toLong())
            val cached = DiscoveryVideoDiskCache.wrap(context, chunked)

            val videoSource = ProgressiveMediaSource.Factory(cached).createMediaSource(
                MediaItem.Builder()
                    .setUri(stream.url)
                    .setCustomCacheKey("discovery_v_${maxHeightCap}:$videoId")
                    .build(),
            )

            val audioUrl = stream.audioUrl
            val finalSource = if (!audioUrl.isNullOrBlank()) {
                val audioSource = ProgressiveMediaSource.Factory(chunked).createMediaSource(
                    MediaItem.fromUri(audioUrl),
                )
                MergingMediaSource(videoSource, audioSource)
            } else {
                videoSource
            }

            if (stream.aspect > 0f) {
                _state.value = _state.value.copy(aspect = stream.aspect)
            }
            exo.setMediaSource(finalSource, seekToMs.coerceAtLeast(0L))
            exo.repeatMode = if (loopOnEnd) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            exo.volume = if (_state.value.muted) 0f else 1f
            exo.prepare()
            exo.playWhenReady = !userPaused
            startProgressTicker()
        }
    }

    private fun startProgressTicker() {
        progressJob?.cancel()
        progressJob = scope.launch {
            while (isActive) {
                val exo = player
                if (exo != null && exo.playbackState != Player.STATE_IDLE) {
                    val pos = exo.currentPosition.coerceAtLeast(0L)
                    val dur = exo.duration.takeIf { it != C.TIME_UNSET && it > 0L } ?: _state.value.durationMs
                    _state.value = _state.value.copy(positionMs = pos, durationMs = dur)
                }
                delay(150L)
            }
        }
    }

    private suspend fun resolveAvStream(videoId: String, capHeight: Int): InnerTubeXResolver.VideoStream? {
        val skip = refusedClients[videoId].orEmpty().toSet()
        return try {
            withContext(Dispatchers.IO) {
                if (videoId in ageGated) {
                    InnerTubeXResolver.extractVideo(
                        videoId = videoId,
                        maxHeight = capHeight,
                        skipClients = skip,
                        ageRestricted = true,
                        wantHighAudio = true,
                    )
                } else {
                    try {
                        InnerTubeXResolver.extractVideo(
                            videoId = videoId,
                            maxHeight = capHeight,
                            skipClients = skip,
                            ageRestricted = false,
                            wantHighAudio = true,
                        )
                    } catch (e: StreamResolveException) {
                        if (e.reason == StreamResolveException.Reason.AGE_RESTRICTED ||
                            e.reason == StreamResolveException.Reason.NO_PLAYABLE_STREAM
                        ) {
                            ageGated += videoId
                            InnerTubeXResolver.extractVideo(
                                videoId = videoId,
                                maxHeight = capHeight,
                                skipClients = skip,
                                ageRestricted = true,
                                wantHighAudio = true,
                            )
                        } else {
                            throw e
                        }
                    }
                }
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun ensurePlayer(): ExoPlayer = player ?: ExoPlayer.Builder(context.applicationContext)
        .build()
        .apply {
            val attrs = AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build()
            setAudioAttributes(attrs, /* handleAudioFocus = */ false)
            addListener(listener)
        }
        .also { player = it }

    companion object {
        private const val CHUNK_BYTES = 1024 * 1024
        private val REFUSAL_CODES = setOf(403, 404, 410)
    }
}
