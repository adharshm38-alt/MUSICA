package com.music.bitchord.ui.toppreview

import android.view.TextureView
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.painterResource
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
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.ui.rememberIsForeground
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Full-screen preview opened when tapping the centered card in "Top Preview for You".
 *
 * Characteristics:
 * - Continues showing the same selected video preview with audio
 * - Prominent song title and artist display
 * - High-contrast "Listen Now" action button that hands off directly to MUSICA's audio player
 * - 30-second duration slider and replay controls
 * - Back button to return to Home
 */
@Composable
fun TopPreviewFullScreen(
    item: VideoDiscoveryItem,
    player: TopPreviewPlayer,
    onRequestPauseBackgroundMusic: () -> Unit,
    onListenNow: (VideoDiscoveryItem) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(onBack = onBack)

    val foreground = rememberIsForeground()
    val state by player.state.collectAsStateWithLifecycle()
    val renderedSurface by player.renderedSurface.collectAsStateWithLifecycle()
    var textureView by remember { mutableStateOf<TextureView?>(null) }
    var openingAudioPlayer by remember { mutableStateOf(false) }

    DisposableEffect(textureView, foreground) {
        val tv = textureView
        if (tv != null && foreground) {
            player.attachSurface(tv)
            player.setMuted(false)
            player.resume()
        }
        onDispose {
            player.attachSurface(null)
            player.setMuted(true)
        }
    }

    LaunchedEffect(foreground) {
        if (!foreground) player.pause() else player.resume()
    }

    val isVideoVisible = textureView != null && renderedSurface === textureView &&
        state.activeVideoId == item.videoId && state.renderedFirstFrame

    val videoAlpha by animateFloatAsState(
        targetValue = if (isVideoVisible) 1f else 0f,
        animationSpec = tween(durationMillis = 280),
        label = "fullScreenVideoAlpha",
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        // 1. Static fallback thumbnail
        AsyncImage(
            model = item.thumbnailUrl,
            contentDescription = item.title,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
        )

        // 2. Video TextureView
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clipToBounds(),
            contentAlignment = Alignment.Center,
        ) {
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
                update = { it.alpha = videoAlpha },
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
                        (height * state.aspect).roundToInt() to height
                    } else {
                        width to (width / state.aspect).roundToInt()
                    }
                    val placeable = measurable.measure(Constraints.fixed(w.coerceAtLeast(1), h.coerceAtLeast(1)))
                    layout(width, height) {
                        placeable.place((width - w) / 2, (height - h) / 2)
                    }
                },
            )
        }

        // 3. Top gradient & navigation bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(130.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = 0.75f),
                        1f to Color.Transparent,
                    ),
                ),
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 8.dp)
                .align(Alignment.TopCenter),
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.45f)),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = stringResource(R.string.video_discovery_back),
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = 0.50f))
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            ) {
                Text(
                    text = stringResource(R.string.top_preview_for_you).uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                    ),
                    color = Color.White.copy(alpha = 0.90f),
                )
            }
        }

        // 4. Center replay / buffer indicator if completed or loading
        if (state.completed) {
            Box(
                modifier = Modifier
                    .size(68.dp)
                    .align(Alignment.Center)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.65f))
                    .clickable {
                        player.seekTo(0L)
                        player.resume()
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Replay,
                    contentDescription = "Replay Preview",
                    tint = Color.White,
                    modifier = Modifier.size(34.dp),
                )
            }
        } else if (state.loading && !state.renderedFirstFrame) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.5.dp,
                modifier = Modifier
                    .size(40.dp)
                    .align(Alignment.Center),
            )
        }

        // 5. Bottom gradient scrim & controls
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(290.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.30f to Color.Black.copy(alpha = 0.60f),
                        1f to Color.Black.copy(alpha = 0.96f),
                    ),
                ),
        )

        var scrubbing by remember { mutableStateOf(false) }
        var scrubPositionFraction by remember { mutableFloatStateOf(0f) }
        val maxDurationMs = TopPreviewPlayer.PREVIEW_DURATION_MS
        val liveFraction = (state.positionMs.toFloat() / maxDurationMs).coerceIn(0f, 1f)
        val displayedFraction = if (scrubbing) scrubPositionFraction else liveFraction
        val displayedPosMs = if (scrubbing) {
            (scrubPositionFraction * maxDurationMs).toLong()
        } else {
            state.positionMs
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 18.dp),
        ) {
            // Recommendation Tag
            if (item.label.isNotBlank()) {
                Text(
                    text = item.label.uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.6.sp,
                    ),
                    color = Color.White.copy(alpha = 0.70f),
                )
            }

            // Song Title
            Text(
                text = item.title,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                    lineHeight = 26.sp,
                ),
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            // Artist Name
            if (item.artist.isNotBlank()) {
                Text(
                    text = item.artist,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontSize = 15.sp,
                    ),
                    color = Color.White.copy(alpha = 0.82f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(4.dp))

            // 30-Second Preview Slider
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = formatDuration(displayedPosMs),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.80f),
                )
                Slider(
                    value = displayedFraction,
                    onValueChange = { frac ->
                        scrubbing = true
                        scrubPositionFraction = frac
                    },
                    onValueChangeFinished = {
                        player.seekTo((scrubPositionFraction * maxDurationMs).toLong())
                        scrubbing = false
                    },
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
                    text = formatDuration(maxDurationMs),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.80f),
                )
            }

            Spacer(Modifier.height(4.dp))

            // "Listen Now" Prominent Action Button
            Button(
                onClick = {
                    if (!openingAudioPlayer) {
                        openingAudioPlayer = true
                        player.pause()
                        onListenNow(item)
                    }
                },
                enabled = !openingAudioPlayer,
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black,
                    disabledContainerColor = Color.White.copy(alpha = 0.70f),
                    disabledContentColor = Color.Black,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
            ) {
                if (openingAudioPlayer) {
                    CircularProgressIndicator(
                        color = Color.Black,
                        strokeWidth = 2.5.dp,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = stringResource(R.string.video_discovery_resolving_audio),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color.Black,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = Color.Black,
                        modifier = Modifier.size(24.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.top_preview_listen_now),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color.Black,
                    )
                }
            }
        }
    }
}

private fun formatDuration(ms: Long): String {
    val sec = (ms / 1000L).coerceIn(0L, 30L)
    return String.format(Locale.ROOT, "0:%02d", sec)
}
