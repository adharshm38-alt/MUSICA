package com.music.bitchord.ui.toppreview

import android.content.Context
import android.view.TextureView
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.metrolist.innertubex.extraction.StreamResolveException
import com.music.bitchord.data.Http
import com.music.bitchord.data.innertube.InnerTubeXResolver
import com.music.bitchord.playback.ChunkedDataSource
import com.music.bitchord.ui.discovery.DiscoveryVideoDiskCache
import com.music.bitchord.ui.rememberIsForeground
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
import kotlin.math.roundToInt

data class TopPreviewState(
    val activeVideoId: String? = null,
    val loading: Boolean = false,
    val renderedFirstFrame: Boolean = false,
    val isPlaying: Boolean = false,
    val isMuted: Boolean = true,
    val positionMs: Long = 0L,
    val durationMs: Long = 60_000L,
    val aspect: Float = 16f / 9f,
    val completed: Boolean = false,
    val unavailable: Boolean = false,
)

/**
 * Single-instance controller for the "Top Preview for You" Home screen section.
 *
 * Guarantees:
 * - Real synchronized audio & video for the centered active card only
 * - 60-second (1 minute) duration cap with automatic clean stop & looping
 * - Safe merging of video & audio streams with time offset alignment & duration clipping
 * - Non-interfering background music coordination
 * - Fast-swipe debounce and LRU disk caching via [DiscoveryVideoDiskCache]
 */
@OptIn(UnstableApi::class)
class TopPreviewPlayer(
    private val context: Context,
    private val onRequestPauseBackgroundMusic: () -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var player: ExoPlayer? = null
    private var currentSurface: TextureView? = null
    private var loadJob: Job? = null
    private var progressJob: Job? = null
    private var releaseJob: Job? = null
    private var loadedProfileId: String? = null

    private data class CachedStream(val stream: InnerTubeXResolver.VideoStream, val atMs: Long)

    private val streamCache = ConcurrentHashMap<String, CachedStream>()
    private val refusedClients = ConcurrentHashMap<String, MutableSet<String>>()
    private val ageGatedVideos = ConcurrentHashMap.newKeySet<String>()
    private val unavailableVideos = ConcurrentHashMap.newKeySet<String>()
    private val failCounts = ConcurrentHashMap<String, Int>()

    private val prefs by lazy {
        context.getSharedPreferences("top_preview_prefs", Context.MODE_PRIVATE)
    }

    private fun loadPersistedMuted(): Boolean = prefs.getBoolean("is_muted", true)

    private fun persistMuted(muted: Boolean) {
        try {
            prefs.edit().putBoolean("is_muted", muted).apply()
        } catch (_: Throwable) {}
    }

    private val _state = MutableStateFlow(TopPreviewState(isMuted = loadPersistedMuted()))
    val state: StateFlow<TopPreviewState> = _state.asStateFlow()

    private val _renderedSurface = MutableStateFlow<TextureView?>(null)
    val renderedSurface: StateFlow<TextureView?> = _renderedSurface.asStateFlow()

    private val listener = object : Player.Listener {
        override fun onRenderedFirstFrame() {
            _renderedSurface.value = currentSurface
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
            when (playbackState) {
                Player.STATE_BUFFERING -> {
                    if (!_state.value.renderedFirstFrame) {
                        _state.value = _state.value.copy(loading = true)
                    }
                }
                Player.STATE_ENDED -> {
                    // Loop 60-second preview automatically when ended
                    val exo = player
                    exo?.seekTo(0L)
                    exo?.playWhenReady = true
                    _state.value = _state.value.copy(
                        isPlaying = true,
                        positionMs = 0L,
                        completed = false,
                    )
                }
                Player.STATE_READY -> {
                    _state.value = _state.value.copy(loading = false)
                }
                else -> Unit
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _state.value = _state.value.copy(isPlaying = isPlaying)
        }

        override fun onPlayerError(error: PlaybackException) {
            val id = _state.value.activeVideoId ?: return
            streamCache.remove(id)
            val isRefusal = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
                .any { it.responseCode in REFUSAL_CODES }
            val profile = loadedProfileId
            if (isRefusal && profile != null) {
                val skips = refusedClients.getOrPut(id) { ConcurrentHashMap.newKeySet() }
                if (skips.add(profile) && skips.size <= 2) {
                    loadJob?.cancel()
                    loadJob = scope.launch { loadAndPlay(id) }
                    return
                }
            }
            val fails = (failCounts[id] ?: 0) + 1
            failCounts[id] = fails
            if (fails >= 3) {
                unavailableVideos += id
            }
            _state.value = _state.value.copy(
                loading = false,
                isPlaying = false,
                unavailable = true,
            )
            pauseAndClearSurface()
        }
    }

    fun activate(videoId: String, surface: TextureView) {
        if (videoId in unavailableVideos) return
        releaseJob?.cancel()
        val exo = ensurePlayer()

        if (_state.value.activeVideoId == videoId && currentSurface === surface) {
            if (_state.value.completed) {
                seekTo(0L)
            }
            if (!_state.value.isMuted) {
                onRequestPauseBackgroundMusic()
            }
            exo.playWhenReady = true
            return
        }

        if (_state.value.activeVideoId != videoId) {
            // Stop previous video and clear media items immediately so stale frames from the prior
            // card don't render on the newly centered card during the settle/debounce interval.
            exo.stop()
            exo.clearMediaItems()
        }

        currentSurface = surface
        _renderedSurface.value = null
        exo.setVideoTextureView(surface)

        if (_state.value.activeVideoId == videoId && exo.playbackState != Player.STATE_IDLE && !_state.value.unavailable) {
            if (!_state.value.isMuted) {
                onRequestPauseBackgroundMusic()
            }
            exo.playWhenReady = true
            return
        }

        loadJob?.cancel()
        _state.value = _state.value.copy(
            activeVideoId = videoId,
            loading = true,
            renderedFirstFrame = false,
            isPlaying = false,
            positionMs = 0L,
            completed = false,
            unavailable = false,
        )
        exo.playWhenReady = false

        loadJob = scope.launch {
            // Settle debounce prevents firing requests while swiping across cards
            delay(SWIPE_DEBOUNCE_MS)
            if (_state.value.activeVideoId != videoId || currentSurface !== surface) return@launch
            loadAndPlay(videoId)
        }
    }

    fun setMuted(muted: Boolean) {
        persistMuted(muted)
        _state.value = _state.value.copy(isMuted = muted)
        val exo = player
        if (exo != null) {
            val audioAttrs = AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build()
            exo.setAudioAttributes(audioAttrs, /* handleAudioFocus = */ !muted)
            exo.volume = if (muted) 0f else 1f
        }
        if (!muted) {
            onRequestPauseBackgroundMusic()
        }
    }

    fun toggleMuted() {
        setMuted(!_state.value.isMuted)
    }

    fun togglePlayPause() {
        val exo = player ?: return
        if (exo.isPlaying) {
            pause()
        } else {
            if (_state.value.completed) {
                seekTo(0L)
            }
            if (!_state.value.isMuted) {
                onRequestPauseBackgroundMusic()
            }
            exo.playWhenReady = true
            _state.value = _state.value.copy(isPlaying = true)
        }
    }

    fun deactivate(videoId: String, surface: TextureView) {
        if (_state.value.activeVideoId != videoId || currentSurface !== surface) return
        pauseAndClearSurface()
    }

    fun attachSurface(view: TextureView?) {
        if (currentSurface === view) return
        currentSurface?.let { prev -> player?.clearVideoTextureView(prev) }
        currentSurface = view
        _renderedSurface.value = null
        if (view != null) {
            player?.setVideoTextureView(view)
        }
    }

    fun pause() {
        loadJob?.cancel()
        progressJob?.cancel()
        player?.playWhenReady = false
        _state.value = _state.value.copy(isPlaying = false)
    }

    fun resume(forceRestartIfCompleted: Boolean = false) {
        val exo = player ?: return
        if (_state.value.activeVideoId != null && !_state.value.unavailable) {
            if (_state.value.completed && forceRestartIfCompleted) {
                seekTo(0L)
            }
            if (!_state.value.isMuted) {
                onRequestPauseBackgroundMusic()
            }
            exo.playWhenReady = true
        }
    }

    fun seekTo(positionMs: Long) {
        val clamped = positionMs.coerceIn(0L, PREVIEW_DURATION_MS)
        player?.seekTo(clamped)
        _state.value = _state.value.copy(positionMs = clamped, completed = clamped >= PREVIEW_DURATION_MS)
    }

    fun release() {
        loadJob?.cancel()
        progressJob?.cancel()
        releaseJob?.cancel()
        currentSurface = null
        _renderedSurface.value = null
        player?.let { exo ->
            exo.removeListener(listener)
            exo.release()
        }
        player = null
        _state.value = TopPreviewState()
    }

    private fun pauseAndClearSurface() {
        loadJob?.cancel()
        progressJob?.cancel()
        currentSurface?.let { s -> player?.clearVideoTextureView(s) }
        currentSurface = null
        _renderedSurface.value = null
        player?.playWhenReady = false
        _state.value = _state.value.copy(isPlaying = false)

        releaseJob?.cancel()
        releaseJob = scope.launch {
            delay(IDLE_RELEASE_MS)
            if (currentSurface == null) {
                player?.stop()
                player?.clearMediaItems()
            }
        }
    }

    private suspend fun loadAndPlay(videoId: String) {
        val stream = resolveStream(videoId)
        if (_state.value.activeVideoId != videoId || currentSurface == null) return
        if (stream == null) {
            val fails = (failCounts[videoId] ?: 0) + 1
            failCounts[videoId] = fails
            if (fails >= 3) {
                unavailableVideos += videoId
            }
            _state.value = _state.value.copy(
                loading = false,
                isPlaying = false,
                unavailable = true,
            )
            pauseAndClearSurface()
            return
        }

        failCounts.remove(videoId)
        loadedProfileId = stream.profileId
        if (stream.aspect > 0f) {
            _state.value = _state.value.copy(aspect = stream.aspect)
        }

        val exo = ensurePlayer()
        currentSurface?.let { exo.setVideoTextureView(it) }

        val upstream = OkHttpDataSource.Factory(Http.client)
            .setDefaultRequestProperties(stream.headers)
        val videoChunked = ChunkedDataSource.Factory(upstream, PREVIEW_CHUNK_BYTES.toLong())
        val videoCached = DiscoveryVideoDiskCache.wrap(context, videoChunked)

        val videoSource = ProgressiveMediaSource.Factory(videoCached).createMediaSource(
            MediaItem.Builder()
                .setUri(stream.url)
                .setCustomCacheKey("top_preview_v:$videoId")
                .build(),
        )

        val audioUrl = stream.audioUrl
        val fullSource = if (!audioUrl.isNullOrBlank()) {
            val audioChunked = ChunkedDataSource.Factory(upstream, AUDIO_CHUNK_BYTES.toLong())
            val audioCached = DiscoveryVideoDiskCache.wrap(context, audioChunked)
            val audioSource = ProgressiveMediaSource.Factory(audioCached).createMediaSource(
                MediaItem.Builder()
                    .setUri(audioUrl)
                    .setCustomCacheKey("top_preview_a:$videoId")
                    .build(),
            )
            MergingMediaSource(
                /* adjustPeriodTimeOffsets = */ true,
                /* clipDurations = */ true,
                videoSource,
                audioSource,
            )
        } else {
            videoSource
        }

        if (!_state.value.isMuted) {
            onRequestPauseBackgroundMusic()
        }

        exo.setMediaSource(fullSource)
        exo.repeatMode = Player.REPEAT_MODE_OFF
        exo.volume = if (_state.value.isMuted) 0f else 1.0f
        exo.prepare()
        exo.playWhenReady = true

        startProgressTicker()
    }

    private fun startProgressTicker() {
        progressJob?.cancel()
        progressJob = scope.launch {
            while (isActive) {
                val exo = player
                if (exo != null && exo.playbackState != Player.STATE_IDLE) {
                    val pos = exo.currentPosition.coerceAtLeast(0L)
                    if (pos >= PREVIEW_DURATION_MS) {
                        // Automatically restart and continue looping the 60-second preview
                        exo.seekTo(0L)
                        _state.value = _state.value.copy(
                            positionMs = 0L,
                            isPlaying = true,
                            completed = false,
                        )
                    } else {
                        _state.value = _state.value.copy(
                            positionMs = pos,
                            isPlaying = exo.isPlaying,
                        )
                    }
                }
                delay(120L)
            }
        }
    }

    private suspend fun resolveStream(videoId: String): InnerTubeXResolver.VideoStream? {
        val now = System.currentTimeMillis()
        streamCache[videoId]?.let { cached ->
            if (now - cached.atMs < STREAM_TTL_MS) return cached.stream
            streamCache.remove(videoId)
        }
        val skip = refusedClients[videoId].orEmpty().toSet()
        val resolved = try {
            withContext(Dispatchers.IO) {
                if (videoId in ageGatedVideos) {
                    InnerTubeXResolver.extractVideo(
                        videoId = videoId,
                        maxHeight = PREVIEW_MAX_HEIGHT,
                        skipClients = skip,
                        ageRestricted = true,
                        wantHighAudio = true,
                    )
                } else {
                    try {
                        InnerTubeXResolver.extractVideo(
                            videoId = videoId,
                            maxHeight = PREVIEW_MAX_HEIGHT,
                            skipClients = skip,
                            ageRestricted = false,
                            wantHighAudio = true,
                        )
                    } catch (e: StreamResolveException) {
                        ageGatedVideos += videoId
                        InnerTubeXResolver.extractVideo(
                            videoId = videoId,
                            maxHeight = PREVIEW_MAX_HEIGHT,
                            skipClients = skip,
                            ageRestricted = true,
                            wantHighAudio = true,
                        )
                    } catch (e: Throwable) {
                        // Fallback to ageRestricted client on any stream extraction exception
                        ageGatedVideos += videoId
                        InnerTubeXResolver.extractVideo(
                            videoId = videoId,
                            maxHeight = PREVIEW_MAX_HEIGHT,
                            skipClients = skip,
                            ageRestricted = true,
                            wantHighAudio = true,
                        )
                    }
                }
            }
        } catch (_: Throwable) {
            null
        } ?: return null

        streamCache[videoId] = CachedStream(resolved, now)
        return resolved
    }

    private fun ensurePlayer(): ExoPlayer = player ?: run {
        val renderersFactory = DefaultRenderersFactory(context.applicationContext)
            .setEnableDecoderFallback(true)

        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 3_000,
                /* maxBufferMs = */ 20_000,
                /* bufferForPlaybackMs = */ 1_000,
                /* bufferForPlaybackAfterRebufferMs = */ 2_000,
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        val isMuted = _state.value.isMuted
        ExoPlayer.Builder(context.applicationContext, renderersFactory)
            .setLoadControl(loadControl)
            .build()
            .apply {
                val audioAttrs = AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build()
                setAudioAttributes(audioAttrs, /* handleAudioFocus = */ !isMuted)
                repeatMode = Player.REPEAT_MODE_OFF
                volume = if (isMuted) 0f else 1.0f
                addListener(listener)
            }
            .also { player = it }
    }

    companion object {
        const val PREVIEW_DURATION_MS = 60_000L
        private const val PREVIEW_MAX_HEIGHT = 720
        private const val AUDIO_CHUNK_BYTES = 64 * 1024
        private const val PREVIEW_CHUNK_BYTES = 512 * 1024
        private const val SWIPE_DEBOUNCE_MS = 220L
        private const val IDLE_RELEASE_MS = 3_000L
        private const val STREAM_TTL_MS = 4 * 60 * 60_000L
        private val REFUSAL_CODES = setOf(403, 404, 410)
    }
}

/**
 * Surface slot for "Top Preview for You" carousel cards.
 * Mounts a TextureView over the card's thumbnail, fading smoothly in once the first video frame is decoded.
 */
@Composable
fun TopPreviewSurface(
    videoId: String,
    active: Boolean,
    player: TopPreviewPlayer,
    modifier: Modifier = Modifier,
) {
    val foreground = rememberIsForeground()
    var textureView by remember { mutableStateOf<TextureView?>(null) }
    val shouldPlay = active && foreground

    DisposableEffect(textureView, videoId, shouldPlay) {
        val tv = textureView
        if (tv != null && shouldPlay) {
            player.activate(videoId, tv)
        } else if (tv != null) {
            player.deactivate(videoId, tv)
        }
        onDispose {
            if (tv != null) player.deactivate(videoId, tv)
        }
    }

    val state by player.state.collectAsStateWithLifecycle()
    val renderedSurface by player.renderedSurface.collectAsStateWithLifecycle()
    val isShowing = shouldPlay && textureView != null && renderedSurface === textureView &&
        state.activeVideoId == videoId && state.renderedFirstFrame

    val alpha by animateFloatAsState(
        targetValue = if (isShowing) 1f else 0f,
        animationSpec = tween(durationMillis = 280),
        label = "topPreviewAlpha",
    )

    Box(modifier.clipToBounds(), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { ctx ->
                TextureView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    isOpaque = false
                    this.alpha = 0f
                    isClickable = false
                    isFocusable = false
                    setOnTouchListener { _, _ -> false }
                    textureView = this
                }
            },
            update = { it.alpha = alpha },
            onRelease = { if (textureView === it) textureView = null },
            modifier = Modifier.layout { measurable, constraints ->
                val width = constraints.maxWidth
                val height = if (constraints.hasBoundedHeight) {
                    constraints.maxHeight
                } else {
                    (width / state.aspect).roundToInt()
                }
                val boundsAspect = width.toFloat() / height.coerceAtLeast(1)
                val (w, h) = if (boundsAspect > state.aspect) {
                    width to (width / state.aspect).roundToInt()
                } else {
                    (height * state.aspect).roundToInt() to height
                }
                val placeable = measurable.measure(Constraints.fixed(w.coerceAtLeast(1), h.coerceAtLeast(1)))
                layout(width, height) {
                    placeable.place((width - w) / 2, (height - h) / 2)
                }
            },
        )
    }
}
