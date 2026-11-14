package com.music.bitchord.ui.discovery

import android.view.TextureView
import android.view.ViewGroup
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.music.bitchord.R
import com.music.bitchord.data.settings.AppSettings
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.ui.rememberIsForeground
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Stage 3 — Full Music Video Playback Screen.
 * Plays the complete music video with real synchronized audio and standard video
 * controls (play/pause, seek bar, mute, fit/fill toggle), plus a separate
 * "Play Audio in Music Player" button that resolves the catalogue song and hands
 * off directly to MUSICA's existing MP3 player.
 */
@Composable
fun FullMusicVideoScreen(
    item: VideoDiscoveryItem,
    initialSeekMs: Long,
    onRequestPauseBackgroundMusic: () -> Unit,
    onAddToPlaylist: (VideoDiscoveryItem) -> Unit,
    onShare: (VideoDiscoveryItem) -> Unit,
    onOpenInAudioPlayer: (VideoDiscoveryItem, onDone: () -> Unit) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val foreground = rememberIsForeground()
    val metered by AppSettings.meteredConnection.collectAsStateWithLifecycle()

    val avPlayer = remember(context) {
        DiscoveryAvMediaPlayer(
            context = context,
            onUnmutedAudioRequested = onRequestPauseBackgroundMusic,
        )
    }
    val avState by avPlayer.state.collectAsStateWithLifecycle()

    var fitScreen by remember { mutableStateOf(true) }
    var controlsVisible by remember { mutableStateOf(true) }
    var openingAudioPlayer by remember { mutableStateOf(false) }

    DisposableEffect(avPlayer) {
        onDispose { avPlayer.release() }
    }

    LaunchedEffect(item.videoId, metered) {
        val cap = if (metered == true) 480 else 1080
        avPlayer.playVideo(
            videoId = item.videoId,
            muted = false,
            loop = false,
            maxHeight = cap,
            initialSeekMs = initialSeekMs,
        )
    }

    LaunchedEffect(foreground) {
        if (!foreground) avPlayer.pause() else avPlayer.resumeIfNotPausedByUser()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { controlsVisible = !controlsVisible },
            ),
    ) {
        AsyncImage(
            model = item.thumbnailUrl,
            contentDescription = item.title,
            contentScale = if (fitScreen) ContentScale.Fit else ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        FullVideoTextureSurface(
            avPlayer = avPlayer,
            aspect = avState.aspect,
            fit = fitScreen,
            visible = avState.renderedFirstFrame,
            modifier = Modifier.fillMaxSize(),
        )

        if (avState.loading && !avState.renderedFirstFrame && !avState.unavailable) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.5.dp,
                modifier = Modifier
                    .size(40.dp)
                    .align(Alignment.Center),
            )
        } else if (avState.unavailable) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 32.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color(0xCC141416))
                    .padding(horizontal = 22.dp, vertical = 20.dp),
            ) {
                Text(
                    text = stringResource(R.string.video_discovery_unavailable),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White,
                )
                Button(
                    onClick = { avPlayer.retry() },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = Color.Black,
                    ),
                ) {
                    Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.video_discovery_retry))
                }
            }
        }

        AnimatedVisibility(
            visible = controlsVisible || avState.unavailable,
            enter = fadeIn(tween(180)),
            exit = fadeOut(tween(180)),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(Modifier.fillMaxSize()) {
                // Top scrim & header.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .align(Alignment.TopCenter)
                        .background(
                            Brush.verticalGradient(
                                0f to Color.Black.copy(alpha = 0.78f),
                                1f to Color.Transparent,
                            ),
                        ),
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter)
                        .statusBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    IconButton(
                        onClick = {
                            avPlayer.pause()
                            onBack()
                        },
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.42f)),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = stringResource(R.string.video_discovery_back),
                            tint = Color.White,
                        )
                    }

                    Spacer(Modifier.width(10.dp))

                    Column(Modifier.weight(1f)) {
                        Text(
                            text = item.title,
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                            ),
                            color = Color.White,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (item.artist.isNotBlank()) {
                            Text(
                                text = item.artist,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.76f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    IconButton(onClick = { onAddToPlaylist(item) }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.PlaylistAdd,
                            contentDescription = stringResource(R.string.video_discovery_add_to_playlist),
                            tint = Color.White,
                        )
                    }

                    IconButton(onClick = { onShare(item) }) {
                        Icon(
                            imageVector = Icons.Rounded.Share,
                            contentDescription = stringResource(R.string.video_discovery_share),
                            tint = Color.White,
                        )
                    }
                }

                // Center Play/Pause button when not errored.
                if (!avState.unavailable && !(avState.loading && !avState.renderedFirstFrame)) {
                    IconButton(
                        onClick = { avPlayer.togglePlayPause() },
                        modifier = Modifier
                            .size(64.dp)
                            .align(Alignment.Center)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.56f)),
                    ) {
                        Icon(
                            imageVector = if (avState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = stringResource(
                                if (avState.isPlaying) R.string.video_discovery_pause else R.string.video_discovery_play,
                            ),
                            tint = Color.White,
                            modifier = Modifier.size(34.dp),
                        )
                    }
                }

                // Bottom scrim & Seek/Transport + "Play Audio in Music Player" button.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                0f to Color.Transparent,
                                0.35f to Color.Black.copy(alpha = 0.50f),
                                1f to Color.Black.copy(alpha = 0.92f),
                            ),
                        ),
                )

                var scrubbing by remember { mutableStateOf(false) }
                var scrubPositionFraction by remember { mutableFloatStateOf(0f) }
                val durationMs = avState.durationMs.coerceAtLeast(0L)
                val liveFraction = if (durationMs > 0L) {
                    (avState.positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
                } else {
                    0f
                }
                val displayedFraction = if (scrubbing) scrubPositionFraction else liveFraction
                val displayedPosMs = if (scrubbing) {
                    (scrubPositionFraction * durationMs).toLong()
                } else {
                    avState.positionMs
                }

                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 16.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = formatDurationMs(displayedPosMs),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.85f),
                        )
                        Slider(
                            value = displayedFraction,
                            onValueChange = { frac ->
                                scrubbing = true
                                scrubPositionFraction = frac
                            },
                            onValueChangeFinished = {
                                if (durationMs > 0L) {
                                    avPlayer.seekTo((scrubPositionFraction * durationMs).toLong())
                                }
                                scrubbing = false
                            },
                            enabled = durationMs > 0L,
                            colors = SliderDefaults.colors(
                                thumbColor = Color.White,
                                activeTrackColor = Color.White,
                                inactiveTrackColor = Color.White.copy(alpha = 0.30f),
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 8.dp),
                        )
                        Text(
                            text = if (durationMs > 0L) formatDurationMs(durationMs) else "--:--",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.85f),
                        )

                        Spacer(Modifier.width(4.dp))

                        IconButton(onClick = { avPlayer.toggleMuted() }, modifier = Modifier.size(36.dp)) {
                            Icon(
                                imageVector = if (avState.muted) {
                                    Icons.AutoMirrored.Rounded.VolumeOff
                                } else {
                                    Icons.AutoMirrored.Rounded.VolumeUp
                                },
                                contentDescription = stringResource(
                                    if (avState.muted) R.string.video_discovery_unmute else R.string.video_discovery_mute,
                                ),
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }

                        IconButton(onClick = { fitScreen = !fitScreen }, modifier = Modifier.size(36.dp)) {
                            Icon(
                                imageVector = if (fitScreen) Icons.Rounded.Fullscreen else Icons.Rounded.FullscreenExit,
                                contentDescription = stringResource(
                                    if (fitScreen) R.string.video_discovery_fill else R.string.video_discovery_fit,
                                ),
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }

                    // Separate Audio Player Handoff CTA.
                    Button(
                        onClick = {
                            if (!openingAudioPlayer) {
                                openingAudioPlayer = true
                                avPlayer.release()
                                onOpenInAudioPlayer(item) {
                                    openingAudioPlayer = false
                                }
                            }
                        },
                        enabled = !openingAudioPlayer,
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color.Black,
                            disabledContainerColor = Color.White.copy(alpha = 0.72f),
                            disabledContentColor = Color.Black,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                    ) {
                        if (openingAudioPlayer) {
                            CircularProgressIndicator(
                                color = Color.Black,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = stringResource(R.string.video_discovery_resolving_audio),
                                fontWeight = FontWeight.Bold,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Rounded.MusicNote,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = stringResource(R.string.video_discovery_open_audio_player),
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FullVideoTextureSurface(
    avPlayer: DiscoveryAvMediaPlayer,
    aspect: Float,
    fit: Boolean,
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    var textureView by remember { mutableStateOf<TextureView?>(null) }

    DisposableEffect(textureView, avPlayer) {
        val tv = textureView
        avPlayer.attachSurface(tv)
        onDispose {
            if (tv != null) avPlayer.attachSurface(null)
        }
    }

    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(durationMillis = 220),
        label = "fullVideoAlpha",
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
                val wider = boundsAspect > aspect
                val (w, h) = if (wider == fit) {
                    (height * aspect).roundToInt() to height
                } else {
                    width to (width / aspect).roundToInt()
                }
                val placeable = measurable.measure(Constraints.fixed(w.coerceAtLeast(1), h.coerceAtLeast(1)))
                layout(width, height) {
                    placeable.place((width - w) / 2, (height - h) / 2)
                }
            },
        )
    }
}

private fun formatDurationMs(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val mins = totalSec / 60L
    val secs = totalSec % 60L
    return String.format(Locale.US, "%d:%02d", mins, secs)
}
