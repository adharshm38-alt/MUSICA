package com.music.bitchord.ui.discovery

import android.view.TextureView
import android.view.ViewGroup
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
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
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.ui.rememberIsForeground
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlin.math.roundToInt

/**
 * Stage 2 — Full-Screen Vertical Short-Video Feed.
 * Swipe up/down through discovered music videos with single-player auto-play,
 * segmented sequence indicators, sound toggle, creator avatar/Follow/Share,
 * real extracted hashtags, corresponding song card with Add-to-playlist, and
 * full-video Stage 3 launch on video tap.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VideoDiscoveryFeedScreen(
    items: List<VideoDiscoveryItem>,
    initialVideoId: String,
    isActiveRoute: Boolean,
    isMusicCurrentlyPlaying: Boolean,
    onRequestPauseBackgroundMusic: () -> Unit,
    onEnsureMetadata: (VideoDiscoveryItem) -> Unit,
    onToggleFollow: (VideoDiscoveryItem) -> Unit,
    onShare: (VideoDiscoveryItem) -> Unit,
    onAddToPlaylist: (VideoDiscoveryItem) -> Unit,
    onOpenFullVideo: (VideoDiscoveryItem, Long) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) {
        LaunchedEffect(Unit) { onBack() }
        return
    }

    val context = LocalContext.current
    val foreground = rememberIsForeground()
    val startIndex = remember(items, initialVideoId) {
        items.indexOfFirst { it.videoId == initialVideoId }.coerceAtLeast(0)
    }
    val pagerState = rememberPagerState(initialPage = startIndex, pageCount = { items.size })

    // If background music is already playing, start Stage 2 muted so the listener's
    // track keeps playing until they explicitly unmute the clip. Otherwise start unmuted.
    var muted by remember { mutableStateOf(isMusicCurrentlyPlaying) }

    val avPlayer = remember(context) {
        DiscoveryAvMediaPlayer(
            context = context,
            onUnmutedAudioRequested = onRequestPauseBackgroundMusic,
        )
    }
    val avState by avPlayer.state.collectAsStateWithLifecycle()

    DisposableEffect(avPlayer) {
        onDispose { avPlayer.release() }
    }

    // Play ONLY the settled active page when visible & foreground; pause during drags or backgrounding.
    val settledPage = pagerState.settledPage
    val isScrolling = pagerState.isScrollInProgress
    val shouldRunPlayer = isActiveRoute && foreground && !isScrolling
    val activeItem = items.getOrNull(settledPage) ?: items.first()

    LaunchedEffect(activeItem.videoId, activeItem.metadataLoaded) {
        if (!activeItem.metadataLoaded) onEnsureMetadata(activeItem)
        items.getOrNull(settledPage + 1)?.let { next ->
            if (!next.metadataLoaded) onEnsureMetadata(next)
        }
    }

    LaunchedEffect(shouldRunPlayer, activeItem.videoId) {
        if (shouldRunPlayer) {
            avPlayer.playVideo(
                videoId = activeItem.videoId,
                muted = muted,
                loop = true,
                maxHeight = 720,
            )
        } else {
            avPlayer.pause()
        }
    }

    // Also reflect scroll-drag transitions immediately cleanly.
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.isScrollInProgress }
            .distinctUntilChanged()
            .collect { scrolling ->
                if (scrolling) avPlayer.pause()
            }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        VerticalPager(
            state = pagerState,
            beyondViewportPageCount = 0,
            key = { index -> items[index].videoId },
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            val item = items[page]
            val isActivePage = page == pagerState.currentPage && shouldRunPlayer
            val showVideo = isActivePage && avState.activeVideoId == item.videoId && avState.renderedFirstFrame

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            val currentPos = if (avState.activeVideoId == item.videoId) avState.positionMs else 0L
                            avPlayer.pause()
                            onOpenFullVideo(item, currentPos)
                        },
                    ),
            ) {
                AsyncImage(
                    model = item.thumbnailUrl,
                    contentDescription = item.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )

                if (page == settledPage && shouldRunPlayer) {
                    DiscoveryFeedTextureSurface(
                        avPlayer = avPlayer,
                        aspect = avState.aspect,
                        visible = showVideo,
                        modifier = Modifier.fillMaxSize(),
                    )
                }

                // Top & Bottom gradient readability scrims.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(170.dp)
                        .align(Alignment.TopCenter)
                        .background(
                            Brush.verticalGradient(
                                0f to Color.Black.copy(alpha = 0.72f),
                                1f to Color.Transparent,
                            ),
                        ),
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(340.dp)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                0f to Color.Transparent,
                                0.35f to Color.Black.copy(alpha = 0.42f),
                                1f to Color.Black.copy(alpha = 0.90f),
                            ),
                        ),
                )

                if (page == settledPage && avState.activeVideoId == item.videoId) {
                    if (avState.loading && !avState.renderedFirstFrame && !avState.unavailable) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.5.dp,
                            modifier = Modifier
                                .size(36.dp)
                                .align(Alignment.Center),
                        )
                    } else if (avState.unavailable) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .align(Alignment.Center)
                                .padding(horizontal = 32.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color.Black.copy(alpha = 0.72f))
                                .padding(horizontal = 20.dp, vertical = 16.dp),
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
                }

                // Bottom Metadata Overlay (Creator + Hashtags + Corresponding Song).
                FeedBottomOverlay(
                    item = item,
                    onToggleFollow = { onToggleFollow(item) },
                    onShare = { onShare(item) },
                    onAddToPlaylist = { onAddToPlaylist(item) },
                    onOpenSongVideo = {
                        val currentPos = if (avState.activeVideoId == item.videoId) avState.positionMs else 0L
                        avPlayer.pause()
                        onOpenFullVideo(item, currentPos)
                    },
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 16.dp),
                )
            }
        }

        // Top HUD: Segmented Sequence Progress + Back + Recommendation Title + Sound Toggle.
        val displayedItem = items.getOrNull(pagerState.currentPage) ?: activeItem
        val activeProgress = if (avState.activeVideoId == displayedItem.videoId && avState.durationMs > 0L) {
            (avState.positionMs.toFloat() / avState.durationMs.toFloat()).coerceIn(0f, 1f)
        } else {
            0f
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                items.indices.forEach { idx ->
                    val segFraction = when {
                        idx < pagerState.currentPage -> 1f
                        idx == pagerState.currentPage -> activeProgress.coerceAtLeast(0.06f)
                        else -> 0f
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(2.5.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color.White.copy(alpha = 0.28f)),
                    ) {
                        if (segFraction > 0f) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth(segFraction)
                                    .background(Color.White),
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                IconButton(
                    onClick = {
                        avPlayer.pause()
                        onBack()
                    },
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.36f)),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = stringResource(R.string.video_discovery_back),
                        tint = Color.White,
                    )
                }

                Spacer(Modifier.width(10.dp))

                Text(
                    text = displayedItem.label,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    ),
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )

                Spacer(Modifier.width(10.dp))

                IconButton(
                    onClick = {
                        muted = avPlayer.toggleMuted()
                    },
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.36f)),
                ) {
                    Icon(
                        imageVector = if (muted) {
                            Icons.AutoMirrored.Rounded.VolumeOff
                        } else {
                            Icons.AutoMirrored.Rounded.VolumeUp
                        },
                        contentDescription = stringResource(
                            if (muted) R.string.video_discovery_unmute else R.string.video_discovery_mute,
                        ),
                        tint = Color.White,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FeedBottomOverlay(
    item: VideoDiscoveryItem,
    onToggleFollow: () -> Unit,
    onShare: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onOpenSongVideo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = modifier,
    ) {
        // Creator information: Avatar + Name + Follow button + Share button.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (!item.creatorAvatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = item.creatorAvatarUrl,
                    contentDescription = item.artist,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .border(1.dp, Color.White.copy(alpha = 0.35f), CircleShape),
                )
            } else {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.18f))
                        .border(1.dp, Color.White.copy(alpha = 0.30f), CircleShape),
                ) {
                    Text(
                        text = item.artist.firstOrNull()?.uppercaseChar()?.toString() ?: "♪",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = Color.White,
                    )
                }
            }

            Spacer(Modifier.width(10.dp))

            Column(Modifier.weight(1f)) {
                Text(
                    text = item.artist,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    ),
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                item.subscriberCountText?.takeIf { it.isNotBlank() }?.let { subs ->
                    Text(
                        text = subs,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                        color = Color.White.copy(alpha = 0.72f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (item.artistBrowseId != null || item.subscribed != null) {
                val isFollowing = item.subscribed == true
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (isFollowing) Color.White.copy(alpha = 0.22f) else Color.White,
                    border = if (isFollowing) BorderStroke(1.dp, Color.White.copy(alpha = 0.55f)) else null,
                    modifier = Modifier.clickable(onClick = onToggleFollow),
                ) {
                    Text(
                        text = stringResource(
                            if (isFollowing) R.string.video_discovery_following else R.string.video_discovery_follow,
                        ),
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = if (isFollowing) Color.White else Color.Black,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                    )
                }
                Spacer(Modifier.width(8.dp))
            }

            IconButton(
                onClick = onShare,
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.16f)),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Share,
                    contentDescription = stringResource(R.string.video_discovery_share),
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        // Video title + real extracted hashtags (never fabricated).
        Text(
            text = item.title,
            style = MaterialTheme.typography.bodyLarge.copy(
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.5.sp,
            ),
            color = Color.White,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        if (item.hashtags.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item.hashtags.forEach { tag ->
                    Text(
                        text = tag,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Medium,
                            fontSize = 12.sp,
                        ),
                        color = Color.White.copy(alpha = 0.88f),
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White.copy(alpha = 0.14f))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }

        // Corresponding song footer bar with artwork + title/artist + Add-to-playlist action.
        val song = item.correspondingSong
        val songTitle = song?.title?.ifBlank { null } ?: item.title
        val songArtist = song?.artist?.ifBlank { null } ?: item.artist
        val songArt = song?.thumbnailUrl?.takeIf { it.isNotBlank() } ?: item.thumbnailUrl

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Color.Black.copy(alpha = 0.56f))
                .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(14.dp))
                .clickable(onClick = onOpenSongVideo)
                .padding(horizontal = 10.dp, vertical = 8.dp),
        ) {
            AsyncImage(
                model = songArt,
                contentDescription = songTitle,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(8.dp)),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = songTitle,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.5.sp,
                    ),
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = songArtist,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                    color = Color.White.copy(alpha = 0.72f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(6.dp))
            IconButton(
                onClick = onAddToPlaylist,
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.14f)),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.PlaylistAdd,
                    contentDescription = stringResource(R.string.video_discovery_add_to_playlist),
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun DiscoveryFeedTextureSurface(
    avPlayer: DiscoveryAvMediaPlayer,
    aspect: Float,
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
        label = "feedVideoAlpha",
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
