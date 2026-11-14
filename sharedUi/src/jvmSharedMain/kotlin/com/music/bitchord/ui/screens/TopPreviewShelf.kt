package com.music.bitchord.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Headphones
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.sharedui.resources.Res
import com.music.bitchord.sharedui.resources.top_preview_card_cd
import com.music.bitchord.sharedui.resources.top_preview_for_you
import com.music.bitchord.ui.components.PAGE_GUTTER
import com.music.bitchord.ui.components.ShimmerBox
import org.jetbrains.compose.resources.stringResource
import java.util.Locale
import kotlin.math.abs

internal const val TOP_PREVIEW_SECTION_KEY = "top-preview-for-you"

// 1.49:1 aspect ratio matching the official MUSICA reference design
private const val CARD_ASPECT_RATIO = 1.49f
private const val CARD_WIDTH_FRACTION = 0.77f
private val MAX_CARD_WIDTH = 340.dp
private val CARD_SHAPE = RoundedCornerShape(16.dp)

/**
 * "Top Preview for You" — Horizontal 3D-style video preview carousel positioned
 * as the FIRST section at the very top of the MUSICA Home screen, above Top Picks.
 *
 * Characteristics:
 * - Pure MUSICA dark theme (zero violet/purple backgrounds)
 * - Dimensions aligned with reference design (~1.49:1 aspect ratio)
 * - Centered active card with side cards partially visible
 * - Side cards display their own static song/video thumbnails and are non-clickable
 * - Polished 3D depth effect (smooth scale, perspective inward tilt, subtle dimming)
 * - Sound ON/OFF control at top-left (muted by default)
 * - Similar artist recommendation pill beside sound control
 * - 1-minute duration indicator at top-right
 * - Automatic looping 1-minute preview (no intrusive center play/pause overlay)
 * - Bottom video progress bar with "0:xx / 1:00" elapsed timer
 * - Title, artist, and three-dot options menu
 * - Only the centered active card plays video automatically
 * - Tapping the active card opens the full-screen video preview
 */
@Composable
fun TopPreviewShelf(
    items: List<VideoDiscoveryItem>,
    loading: Boolean,
    homeListState: LazyListState,
    onItemClick: (VideoDiscoveryItem) -> Unit,
    previewSlot: @Composable (videoId: String, active: Boolean, modifier: Modifier) -> Unit,
    isMuted: Boolean = true,
    onToggleMute: () -> Unit = {},
    isPlaying: Boolean = false,
    onTogglePlayPause: () -> Unit = {},
    positionMs: Long = 0L,
    durationMs: Long = 60_000L,
    onMoreClick: ((VideoDiscoveryItem) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    if (!loading && items.isEmpty()) return

    // Pause previews during vertical Home scroll or when < 35% of the carousel is visible.
    val isCarouselVisible by remember(homeListState) {
        derivedStateOf {
            if (homeListState.isScrollInProgress) return@derivedStateOf false
            val layout = homeListState.layoutInfo
            val vis = layout.visibleItemsInfo.firstOrNull { it.key == TOP_PREVIEW_SECTION_KEY }
                ?: return@derivedStateOf false
            if (vis.size <= 0) return@derivedStateOf false
            val top = maxOf(vis.offset, layout.viewportStartOffset)
            val bottom = minOf(vis.offset + vis.size, layout.viewportEndOffset)
            val visiblePx = (bottom - top).coerceAtLeast(0)
            visiblePx >= (vis.size * 0.35f)
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 12.dp),
    ) {
        // Section Header matching MUSICA design
        Row(
            modifier = Modifier
                .padding(horizontal = PAGE_GUTTER, vertical = 6.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.top_preview_for_you),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Spacer(Modifier.height(8.dp))

        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val availableWidth = maxWidth
            val cardWidth = minOf(availableWidth * CARD_WIDTH_FRACTION, MAX_CARD_WIDTH)
            val cardHeight = cardWidth / CARD_ASPECT_RATIO
            val sidePadding = ((availableWidth - cardWidth) / 2).coerceAtLeast(PAGE_GUTTER)

            if (loading && items.isEmpty()) {
                // Skeleton matching carousel card dimensions
                LazyRow(
                    contentPadding = PaddingValues(horizontal = sidePadding),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    userScrollEnabled = false,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(3) {
                        ShimmerBox(
                            modifier = Modifier
                                .width(cardWidth)
                                .height(cardHeight)
                                .clip(CARD_SHAPE),
                        )
                    }
                }
            } else {
                val pagerState = rememberPagerState(
                    initialPage = 0,
                    pageCount = { items.size },
                )

                // The newly centered card becomes the active preview once swiping settles.
                val activeVideoId by remember(items, pagerState, isCarouselVisible) {
                    derivedStateOf {
                        if (!isCarouselVisible || pagerState.isScrollInProgress || items.isEmpty()) {
                            null
                        } else {
                            items.getOrNull(pagerState.currentPage)?.videoId
                        }
                    }
                }

                val density = LocalDensity.current.density

                HorizontalPager(
                    state = pagerState,
                    contentPadding = PaddingValues(horizontal = sidePadding),
                    pageSpacing = 14.dp,
                    beyondViewportPageCount = 1,
                    key = { index -> items[index].id },
                    modifier = Modifier.fillMaxWidth(),
                ) { page ->
                    val item = items[page]
                    val isCurrent = page == pagerState.currentPage
                    val isPreviewActive = isCurrent && activeVideoId == item.videoId

                    // Calculate smooth 3D depth transformations
                    val pageOffset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction)
                    val absOffset = abs(pageOffset).coerceIn(0f, 1f)

                    // Side cards shrink slightly for depth perspective
                    val scale = 1f - (absOffset * 0.12f)
                    // Side cards dim slightly to keep focus on the centered preview
                    val alpha = 1f - (absOffset * 0.35f)
                    // Inward cylindrical rotation
                    val rotationY = -14f * pageOffset.coerceIn(-1f, 1f)

                    val cd = stringResource(Res.string.top_preview_card_cd, item.label, item.title, item.artist)

                    Box(
                        modifier = Modifier
                            .width(cardWidth)
                            .height(cardHeight)
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                                this.alpha = alpha
                                this.rotationY = rotationY
                                cameraDistance = 14f * density
                            }
                            .clip(CARD_SHAPE)
                            .background(Color(0xFF0F0F12))
                            .semantics { this.contentDescription = cd },
                    ) {
                        // 1. Static high-res video thumbnail (always painted underneath so no flash)
                        AsyncImage(
                            model = item.thumbnailUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )

                        // 2. Video Preview Slot (only decoded & played for the centered active card)
                        if (isCurrent) {
                            previewSlot(item.videoId, isPreviewActive, Modifier.fillMaxSize())
                        }

                        // 3. Full-card touch surface (placed behind interactive overlay controls)
                        if (isCurrent) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clickable(
                                        role = Role.Button,
                                        onClickLabel = "Open Full Screen",
                                        onClick = { onItemClick(item) },
                                    ),
                            )
                        }

                        // 4. Top-left Controls: Sound ON/OFF + Recommendation Tag
                        Row(
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(10.dp),
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            // Sound Button: Controls audio only, does not stop video or open full-screen
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(CircleShape)
                                    .background(Color.Black.copy(alpha = 0.58f))
                                    .clickable(
                                        enabled = isCurrent,
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
                                    modifier = Modifier.size(17.dp),
                                )
                            }

                            // Recommendation Label
                            val labelText = if (item.label.isNotBlank()) item.label else "SIMILAR TO ${item.artist}"
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color.Black.copy(alpha = 0.58f))
                                    .padding(horizontal = 9.dp, vertical = 5.dp),
                            ) {
                                Text(
                                    text = labelText.uppercase(),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 0.5.sp,
                                    ),
                                    color = Color.White.copy(alpha = 0.92f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }

                        // 5. Top-right Duration Indicator ("1:00" with headphone icon)
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(10.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.Black.copy(alpha = 0.58f))
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Headphones,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(13.dp),
                                )
                                Text(
                                    text = "1:00",
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                    ),
                                    color = Color.White,
                                )
                            }
                        }

                        // 6. Bottom Gradient Scrim for maximum text and scrubber contrast
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(125.dp)
                                .align(Alignment.BottomCenter)
                                .background(
                                    Brush.verticalGradient(
                                        0f to Color.Transparent,
                                        0.35f to Color.Black.copy(alpha = 0.55f),
                                        1f to Color.Black.copy(alpha = 0.94f),
                                    ),
                                ),
                        )

                        // 8. Bottom Information & Scrubber Overlay
                        Column(
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                        ) {
                            // Video Progress Bar & Elapsed/Total Counter
                            val progressFraction = if (isCurrent) {
                                (positionMs.toFloat() / durationMs.coerceAtLeast(1L)).coerceIn(0f, 1f)
                            } else {
                                0f
                            }
                            val elapsedSec = if (isCurrent) (positionMs / 1000L).coerceIn(0L, 60L) else 0L
                            val elapsedStr = String.format(Locale.ROOT, "%d:%02d / 1:00", elapsedSec / 60, elapsedSec % 60)

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(3.dp)
                                        .clip(RoundedCornerShape(1.5.dp))
                                        .background(Color.White.copy(alpha = 0.35f)),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(progressFraction)
                                            .fillMaxHeight()
                                            .background(Color.White),
                                    )
                                }
                                Text(
                                    text = elapsedStr,
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                    ),
                                    color = Color.White.copy(alpha = 0.90f),
                                )
                            }

                            Spacer(Modifier.height(5.dp))

                            // Song Title, Artist Name, and Three-Dot Menu
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .padding(end = 8.dp),
                                ) {
                                    Text(
                                        text = item.title,
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            lineHeight = 19.sp,
                                        ),
                                        color = Color.White,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (item.artist.isNotBlank()) {
                                        Text(
                                            text = item.artist,
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                fontSize = 12.sp,
                                                lineHeight = 15.sp,
                                            ),
                                            color = Color.White.copy(alpha = 0.78f),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }

                                // Three-dot options menu
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .clickable(
                                            enabled = isCurrent,
                                            role = Role.Button,
                                            onClick = { onMoreClick?.invoke(item) },
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.MoreVert,
                                        contentDescription = "More options",
                                        tint = Color.White.copy(alpha = 0.85f),
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
