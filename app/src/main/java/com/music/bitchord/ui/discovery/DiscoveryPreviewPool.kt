package com.music.bitchord.ui.discovery

import android.content.Context
import android.view.TextureView
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
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
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ClippingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.datasource.HttpDataSource
import com.metrolist.innertubex.extraction.StreamResolveException
import com.music.bitchord.data.Http
import com.music.bitchord.data.innertube.InnerTubeXResolver
import com.music.bitchord.playback.ChunkedDataSource
import com.music.bitchord.ui.rememberIsForeground
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

/**
 * Shared LRU disk cache dedicated to Stage 1 / Stage 2 video discovery clips so
 * repeating previews or swiping back does not re-download previously buffered bytes.
 */
@OptIn(UnstableApi::class)
internal object DiscoveryVideoDiskCache {
    private const val MAX_BYTES = 64L * 1024 * 1024

    @Volatile
    private var cache: SimpleCache? = null

    fun wrap(context: Context, upstream: DataSource.Factory): DataSource.Factory {
        val instance = cache ?: synchronized(this) {
            cache ?: SimpleCache(
                File(context.applicationContext.cacheDir, "discovery_video"),
                LeastRecentlyUsedCacheEvictor(MAX_BYTES),
                StandaloneDatabaseProvider(context.applicationContext),
            ).also { cache = it }
        }
        return CacheDataSource.Factory()
            .setCache(instance)
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }
}

/**
 * Single shared silent preview decoder/player pool for Stage 1 carousel cards.
 * Guarantees:
 * - At most ONE preview stream loads or plays at a time
 * - Audio track disabled + volume 0 + no audio focus (never interrupts active music)
 * - Immediate pause when cards scroll away, carousel leaves viewport, or screen backgrounds
 * - 12s clipped preview loop backed by [DiscoveryVideoDiskCache]
 */
@OptIn(UnstableApi::class)
class DiscoveryPreviewPool {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var player: ExoPlayer? = null
    private var currentVideoId: String? = null
    private var currentSurface: TextureView? = null
    private var loadJob: Job? = null
    private var releaseJob: Job? = null
    private var activeCapHeight = PREVIEW_CAP_HEIGHT
    private var loadedProfileId: String? = null

    private data class CachedStream(val stream: InnerTubeXResolver.VideoStream, val atMs: Long)

    private val streamCache = ConcurrentHashMap<String, CachedStream>()
    private val refusedClients = ConcurrentHashMap<String, MutableSet<String>>()
    private val ageGatedVideos = ConcurrentHashMap.newKeySet<String>()
    private val unavailableVideos = ConcurrentHashMap.newKeySet<String>()

    private val _renderedVideoId = MutableStateFlow<String?>(null)
    val renderedVideoId: StateFlow<String?> = _renderedVideoId.asStateFlow()

    private val _renderedSurface = MutableStateFlow<TextureView?>(null)
    val renderedSurface: StateFlow<TextureView?> = _renderedSurface.asStateFlow()

    private val _aspect = MutableStateFlow(16f / 9f)
    val aspect: StateFlow<Float> = _aspect.asStateFlow()

    private val _isMuted = MutableStateFlow(true)
    val isMuted: StateFlow<Boolean> = _isMuted.asStateFlow()

    fun toggleMute() {
        val next = !_isMuted.value
        _isMuted.value = next
        player?.volume = if (next) 0f else 1f
    }

    private val listener = object : Player.Listener {
        override fun onRenderedFirstFrame() {
            _renderedSurface.value = currentSurface
            _renderedVideoId.value = currentVideoId
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            val w = videoSize.width * videoSize.pixelWidthHeightRatio
            if (w > 0f && videoSize.height > 0) {
                _aspect.value = w / videoSize.height
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            val id = currentVideoId ?: return
            streamCache.remove(id)
            val isRefusal = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
                .any { it.responseCode in REFUSAL_CODES }
            val prof = loadedProfileId
            if (isRefusal && prof != null) {
                val skips = refusedClients.getOrPut(id) { ConcurrentHashMap.newKeySet() }
                if (skips.add(prof) && skips.size <= 2) {
                    loadAndPlay(id)
                    return
                }
            }
            unavailableVideos += id
            pauseAndClearSurface()
        }
    }

    fun activate(context: Context, videoId: String, surface: TextureView) {
        if (videoId in unavailableVideos) return
        releaseJob?.cancel()
        val app = context.applicationContext
        val exo = ensurePlayer(app)
        if (currentVideoId == videoId && currentSurface === surface) {
            exo.playWhenReady = true
            return
        }
        currentSurface = surface
        _renderedVideoId.value = null
        _renderedSurface.value = null
        exo.setVideoTextureView(surface)

        if (currentVideoId == videoId && exo.playbackState != Player.STATE_IDLE) {
            exo.playWhenReady = true
            return
        }

        loadJob?.cancel()
        currentVideoId = videoId
        exo.playWhenReady = false
        loadJob = scope.launch {
            // Brief settle debounce avoids firing InnerTube requests while scrolling across cards.
            delay(SETTLE_DEBOUNCE_MS)
            if (currentVideoId != videoId || currentSurface !== surface) return@launch
            loadAndPlay(videoId, app)
        }
    }

    fun deactivate(videoId: String, surface: TextureView) {
        if (currentVideoId != videoId || currentSurface !== surface) return
        pauseAndClearSurface()
    }

    fun pauseAll() {
        loadJob?.cancel()
        player?.playWhenReady = false
        _renderedVideoId.value = null
    }

    fun release() {
        loadJob?.cancel()
        releaseJob?.cancel()
        currentVideoId = null
        currentSurface = null
        _renderedVideoId.value = null
        _renderedSurface.value = null
        player?.let { exo ->
            exo.removeListener(listener)
            exo.release()
        }
        player = null
    }

    private fun pauseAndClearSurface() {
        loadJob?.cancel()
        currentSurface?.let { s -> player?.clearVideoTextureView(s) }
        currentSurface = null
        currentVideoId = null
        _renderedVideoId.value = null
        _renderedSurface.value = null
        player?.playWhenReady = false
        releaseJob?.cancel()
        releaseJob = scope.launch {
            delay(IDLE_RELEASE_MS)
            if (currentSurface == null) {
                player?.stop()
                player?.clearMediaItems()
            }
        }
    }

    private fun loadAndPlay(videoId: String, context: Context? = null) {
        val exo = player ?: return
        val app = context ?: return
        loadJob?.cancel()
        loadJob = scope.launch {
            val stream = resolvePreviewStream(videoId)
            if (currentVideoId != videoId || currentSurface == null) return@launch
            if (stream == null) {
                unavailableVideos += videoId
                pauseAndClearSurface()
                return@launch
            }
            loadedProfileId = stream.profileId
            if (stream.aspect > 0f) _aspect.value = stream.aspect

            val upstream = OkHttpDataSource.Factory(Http.client)
                .setDefaultRequestProperties(stream.headers)
            val chunked = ChunkedDataSource.Factory(upstream, PREVIEW_CHUNK_BYTES.toLong())
            val cached = DiscoveryVideoDiskCache.wrap(app, chunked)
            val mediaItem = MediaItem.Builder()
                .setUri(stream.url)
                .setCustomCacheKey("discovery_preview:$videoId")
                .build()
            val progressive = ProgressiveMediaSource.Factory(cached).createMediaSource(mediaItem)
            val clipped = ClippingMediaSource(progressive, 0L, PREVIEW_CLIP_US)

            exo.setMediaSource(clipped)
            exo.repeatMode = Player.REPEAT_MODE_ONE
            exo.volume = if (_isMuted.value) 0f else 1f
            exo.prepare()
            exo.playWhenReady = true
        }
    }

    private suspend fun resolvePreviewStream(videoId: String): InnerTubeXResolver.VideoStream? {
        val now = System.currentTimeMillis()
        streamCache[videoId]?.let { cached ->
            if (now - cached.atMs < STREAM_TTL_MS) return cached.stream
            streamCache.remove(videoId)
        }
        val skip = refusedClients[videoId].orEmpty().toSet()
        val resolved = try {
            withContext(Dispatchers.IO) {
                if (videoId in ageGatedVideos) {
                    InnerTubeXResolver.extractVideo(videoId, activeCapHeight, skip, ageRestricted = true)
                } else {
                    try {
                        InnerTubeXResolver.extractVideo(videoId, activeCapHeight, skip, ageRestricted = false)
                    } catch (e: StreamResolveException) {
                        if (e.reason == StreamResolveException.Reason.AGE_RESTRICTED ||
                            e.reason == StreamResolveException.Reason.NO_PLAYABLE_STREAM
                        ) {
                            ageGatedVideos += videoId
                            InnerTubeXResolver.extractVideo(videoId, activeCapHeight, skip, ageRestricted = true)
                        } else {
                            throw e
                        }
                    }
                }
            }
        } catch (_: Throwable) {
            null
        } ?: return null

        streamCache[videoId] = CachedStream(resolved, now)
        return resolved
    }

    private fun ensurePlayer(app: Context): ExoPlayer = player ?: ExoPlayer.Builder(app)
        .setLoadControl(
            DefaultLoadControl.Builder()
                .setBufferDurationsMs(1_500, 6_000, 400, 900)
                .build(),
        )
        .build()
        .apply {
            volume = 0f
            setAudioAttributes(AudioAttributes.DEFAULT, /* handleAudioFocus = */ false)
            trackSelectionParameters = trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                .build()
            repeatMode = Player.REPEAT_MODE_ONE
            addListener(listener)
        }
        .also { player = it }

    companion object {
        private const val PREVIEW_CAP_HEIGHT = 480
        private const val PREVIEW_CHUNK_BYTES = 512 * 1024
        private const val PREVIEW_CLIP_US = 60_000_000L
        private const val SETTLE_DEBOUNCE_MS = 180L
        private const val IDLE_RELEASE_MS = 2_500L
        private const val STREAM_TTL_MS = 4 * 60 * 60_000L
        private val REFUSAL_CODES = setOf(403, 404, 410)
    }
}

/**
 * Composable slot passed into Stage 1 Home cards. Shows transparent Surface over
 * card's cached thumbnail and fades smoothly in once first video frame renders.
 */
@Composable
fun DiscoveryCardPreviewSurface(
    videoId: String,
    active: Boolean,
    pool: DiscoveryPreviewPool,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val foreground = rememberIsForeground()
    var textureView by remember { mutableStateOf<TextureView?>(null) }
    val shouldPlay = active && foreground

    DisposableEffect(textureView, videoId, shouldPlay) {
        val tv = textureView
        if (tv != null && shouldPlay) {
            pool.activate(context, videoId, tv)
        } else if (tv != null) {
            pool.deactivate(videoId, tv)
        }
        onDispose {
            if (tv != null) pool.deactivate(videoId, tv)
        }
    }

    val renderedId by pool.renderedVideoId.collectAsStateWithLifecycle()
    val renderedSurface by pool.renderedSurface.collectAsStateWithLifecycle()
    val aspect by pool.aspect.collectAsStateWithLifecycle()
    val isShowing = shouldPlay && textureView != null && renderedSurface === textureView && renderedId == videoId

    val alpha by animateFloatAsState(
        targetValue = if (isShowing) 1f else 0f,
        animationSpec = tween(durationMillis = 280),
        label = "discoveryPreviewAlpha",
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
                    (width / aspect).roundToInt()
                }
                val boundsAspect = width.toFloat() / height.coerceAtLeast(1)
                val (w, h) = if (boundsAspect > aspect) {
                    width to (width / aspect).roundToInt()
                } else {
                    (height * aspect).roundToInt() to height
                }
                val placeable = measurable.measure(Constraints.fixed(w.coerceAtLeast(1), h.coerceAtLeast(1)))
                layout(width, height) {
                    placeable.place((width - w) / 2, (height - h) / 2)
                }
            },
        )
    }
}
