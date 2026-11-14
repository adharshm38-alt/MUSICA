package com.music.bitchord.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.music.bitchord.sharedui.resources.Res
import com.music.bitchord.sharedui.resources.musica_cassette_logo
import com.music.bitchord.sharedui.resources.video_discovery_card_cd
import com.music.bitchord.sharedui.resources.video_discovery_header
import coil3.compose.AsyncImage
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.ui.components.PAGE_GUTTER
import com.music.bitchord.ui.components.ShimmerBox
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import kotlin.math.abs

internal const val HOME_VIDEO_DISCOVERY_KEY = "home-video-discovery"

private val CardWidth = 148.dp
private val CardHeight = 226.dp
private val CardRadius = 14.dp
private val CardGap = 10.dp
private val WatermarkWidth = 24.dp
private val WatermarkHeight = 14.dp

/**
 * Stage 1 — Home Screen Video Preview Carousel.
 * Placed directly above Find Your Mood with compact Spotify-style vertical cards,
 * instant cinematic thumbnails, single-slot muted moving video previews when sufficiently
 * visible, transparent MUSICA cassette watermark in the top-right corner, and bold white
 * recommendation + song/artist overlay at the bottom.
 */
@Composable
fun HomeVideoDiscoveryCarousel(
    items: List<VideoDiscoveryItem>,
    loading: Boolean,
    homeListState: LazyListState,
    onItemClick: (VideoDiscoveryItem) -> Unit,
    videoPreviewSlot: @Composable (videoId: String, active: Boolean, modifier: Modifier) -> Unit = { _, _, _ -> },
    isMuted: Boolean = true,
    onToggleMute: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    if (!loading && items.isEmpty()) return

    val rowState = rememberLazyListState()
    val motionEnabled = LocalArtworkMotion.current

    // Pause previews immediately during vertical Home scroll or when < 55% of carousel height is visible.
    val carouselSufficientlyVisible by remember(homeListState, motionEnabled) {
        derivedStateOf {
            if (!motionEnabled || homeListState.isScrollInProgress) return@derivedStateOf false
            val layout = homeListState.layoutInfo
            val vis = layout.visibleItemsInfo.firstOrNull { it.key == HOME_VIDEO_DISCOVERY_KEY }
                ?: return@derivedStateOf false
            if (vis.size <= 0) return@derivedStateOf false
            val top = maxOf(vis.offset, layout.viewportStartOffset)
            val bottom = minOf(vis.offset + vis.size, layout.viewportEndOffset)
            val visiblePx = (bottom - top).coerceAtLeast(0)
            visiblePx >= (vis.size * 0.55f)
        }
    }

    // Play at most ONE card's silent video preview: the most-centered visible card (>= 70% visible)
    // once both vertical Home scroll and horizontal row scroll have settled.
    val activePreviewVideoId by remember(items, rowState, carouselSufficientlyVisible) {
        derivedStateOf {
            if (!carouselSufficientlyVisible || rowState.isScrollInProgress || items.isEmpty()) {
                return@derivedStateOf null
            }
            val layout = rowState.layoutInfo
            val viewportCenter = (layout.viewportStartOffset + layout.viewportEndOffset) / 2
            layout.visibleItemsInfo
                .mapNotNull { vis ->
                    if (vis.size <= 0) return@mapNotNull null
                    val left = maxOf(vis.offset, layout.viewportStartOffset)
                    val right = minOf(vis.offset + vis.size, layout.viewportEndOffset)
                    val visibleFraction = (right - left).coerceAtLeast(0).toFloat() / vis.size
                    if (visibleFraction >= 0.70f) {
                        val centerDistance = abs((vis.offset + vis.size / 2) - viewportCenter)
                        vis to centerDistance
                    } else {
                        null
                    }
                }
                .minByOrNull { it.second }
                ?.first
                ?.let { vis -> items.firstOrNull { it.id == vis.key }?.videoId }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp, bottom = 10.dp),
    ) {
        SectionHeader(title = stringResource(Res.string.video_discovery_header))
        Spacer(Modifier.height(4.dp))

        if (loading && items.isEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = PAGE_GUTTER),
                horizontalArrangement = Arrangement.spacedBy(CardGap),
                userScrollEnabled = false,
                modifier = Modifier.fillMaxWidth(),
            ) {
                items(3) {
                    ShimmerBox(
                        modifier = Modifier
                            .width(CardWidth)
                            .height(CardHeight)
                            .clip(RoundedCornerShape(CardRadius)),
                    )
                }
            }
        } else {
            LazyRow(
                state = rowState,
                contentPadding = PaddingValues(horizontal = PAGE_GUTTER),
                horizontalArrangement = Arrangement.spacedBy(CardGap),
                modifier = Modifier.fillMaxWidth(),
            ) {
                items(
                    items = items,
                    key = { it.id },
                    contentType = { "home_video_discovery_card" },
                ) { item ->
                    val cd = stringResource(Res.string.video_discovery_card_cd, item.label, item.title)
                    HomeVideoDiscoveryCard(
                        item = item,
                        previewActive = activePreviewVideoId == item.videoId,
                        contentDescription = cd,
                        videoPreviewSlot = videoPreviewSlot,
                        isMuted = isMuted,
                        onToggleMute = onToggleMute,
                        onClick = { onItemClick(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeVideoDiscoveryCard(
    item: VideoDiscoveryItem,
    previewActive: Boolean,
    contentDescription: String,
    videoPreviewSlot: @Composable (videoId: String, active: Boolean, modifier: Modifier) -> Unit,
    isMuted: Boolean = true,
    onToggleMute: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(CardRadius)
    Box(
        modifier = Modifier
            .width(CardWidth)
            .height(CardHeight)
            .clip(shape)
            .background(Color(0xFF141416))
            .semantics { this.contentDescription = contentDescription }
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        // Always paint thumbnail immediately underneath so scrolling or slow networks never flash blank.
        AsyncImage(
            model = item.thumbnailUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        // Muted looping moving preview renders on top once its first video frame is decoded.
        videoPreviewSlot(item.videoId, previewActive, Modifier.fillMaxSize())

        // Sound ON/OFF control at top-left of the active preview card
        if (previewActive && onToggleMute != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(top = 8.dp, start = 8.dp)
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.58f))
                    .clickable(
                        role = Role.Button,
                        onClickLabel = if (isMuted) "Turn sound on" else "Turn sound off",
                        onClick = onToggleMute,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isMuted) {
                        Icons.AutoMirrored.Rounded.VolumeOff
                    } else {
                        Icons.AutoMirrored.Rounded.VolumeUp
                    },
                    contentDescription = if (isMuted) "Sound off" else "Sound on",
                    tint = Color.White,
                    modifier = Modifier.size(15.dp),
                )
            }
        }

        // Soft top-right corner gradient (no box/badge) for legibility over bright frames.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = 0.34f),
                        1f to Color.Transparent,
                    ),
                ),
        )

        // Subtle dark gradient scrim at bottom matching Spotify discovery cards.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(126.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.40f to Color.Black.copy(alpha = 0.35f),
                        1f to Color.Black.copy(alpha = 0.88f),
                    ),
                ),
        )

        // Genuine transparent white cassette watermark (zero black box background).
        Image(
            painter = painterResource(Res.drawable.musica_cassette_logo),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 10.dp, end = 10.dp)
                .width(WatermarkWidth)
                .height(WatermarkHeight)
                .alpha(0.92f),
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 11.dp, vertical = 10.dp),
        ) {
            Text(
                text = item.label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.5.sp,
                    lineHeight = 13.sp,
                ),
                color = Color.White.copy(alpha = 0.90f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = item.title,
                style = MaterialTheme.typography.titleSmall.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.5.sp,
                    lineHeight = 16.5.sp,
                ),
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.artist.isNotBlank()) {
                Spacer(Modifier.height(1.dp))
                Text(
                    text = item.artist,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                    ),
                    color = Color.White.copy(alpha = 0.76f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
