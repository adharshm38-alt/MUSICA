package com.music.bitchord.ui.screens

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Brightness1
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.music.bitchord.data.settings.AppSettings
import com.music.bitchord.data.settings.AppWallpaper

/**
 * Custom Backgrounds Gallery screen: Settings -> Extra Changes -> Backgrounds.
 *
 * Requirements satisfied:
 * - Attractive portrait wallpaper thumbnails
 * - Exact 6 options in user-specified order (Default Black + 5 uploaded wallpapers)
 * - Selected / active background indicator
 * - Full-screen wallpaper preview
 * - Apply button (only saves and activates when tapped)
 * - Safe fallback to Default Black
 */
@Composable
fun BackgroundsGalleryScreen(
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val activeWallpaper by AppSettings.customWallpaper.collectAsStateWithLifecycle()
    var previewingWallpaper by remember { mutableStateOf<AppWallpaper?>(null) }

    Box(modifier = modifier.fillMaxSize()) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = contentPadding.calculateTopPadding() + 8.dp,
                bottom = contentPadding.calculateBottomPadding() + 24.dp,
            ),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(span = { GridItemSpan(2) }) {
                Column(modifier = Modifier.padding(bottom = 6.dp)) {
                    Text(
                        text = "Backgrounds",
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color.White,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Choose an aesthetic wallpaper or keep the original pure black background. Tap any wallpaper to preview.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.68f),
                    )
                }
            }

            items(AppWallpaper.ALL, key = { it.id }) { wallpaper ->
                WallpaperCard(
                    wallpaper = wallpaper,
                    isActive = wallpaper == activeWallpaper,
                    onPreview = { previewingWallpaper = wallpaper },
                    onApplyDirectly = {
                        AppSettings.setCustomWallpaper(wallpaper)
                        Toast.makeText(context, "${wallpaper.displayName} applied", Toast.LENGTH_SHORT).show()
                    },
                )
            }
        }

        // Full-Screen Preview Overlay
        if (previewingWallpaper != null) {
            val preview = previewingWallpaper!!
            Dialog(
                onDismissRequest = { previewingWallpaper = null },
                properties = DialogProperties(
                    usePlatformDefaultWidth = false,
                    decorFitsSystemWindows = false,
                ),
            ) {
                FullScreenWallpaperPreview(
                    wallpaper = preview,
                    isActive = preview == activeWallpaper,
                    onDismiss = { previewingWallpaper = null },
                    onApply = {
                        AppSettings.setCustomWallpaper(preview)
                        Toast.makeText(context, "${preview.displayName} applied", Toast.LENGTH_SHORT).show()
                        previewingWallpaper = null
                    },
                )
            }
        }
    }
}

@Composable
private fun WallpaperCard(
    wallpaper: AppWallpaper,
    isActive: Boolean,
    onPreview: () -> Unit,
    onApplyDirectly: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cardShape = RoundedCornerShape(18.dp)
    val borderColor = if (isActive) {
        Color.White
    } else {
        Color.White.copy(alpha = 0.12f)
    }

    Surface(
        shape = cardShape,
        color = Color(0xFF141416),
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(9f / 16f)
            .border(if (isActive) 2.dp else 1.dp, borderColor, cardShape)
            .clip(cardShape)
            .clickable(onClick = onPreview),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (wallpaper.drawableRes != null) {
                Image(
                    painter = painterResource(wallpaper.drawableRes),
                    contentDescription = wallpaper.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                // Subtle dark overlay to match app aesthetic
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.32f)),
                )
            } else {
                // Default Black card
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .border(1.5.dp, Color.White.copy(alpha = 0.40f), CircleShape)
                                .background(Color(0xFF1C1C1E)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Brightness1,
                                contentDescription = null,
                                tint = Color.Black,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Pure Black",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = Color.White.copy(alpha = 0.70f),
                        )
                    }
                }
            }

            // Top Badges Row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Preview pill
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black.copy(alpha = 0.55f))
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Visibility,
                            contentDescription = "Preview",
                            tint = Color.White.copy(alpha = 0.85f),
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = "Preview",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color.White.copy(alpha = 0.85f),
                        )
                    }
                }

                if (isActive) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White)
                            .padding(horizontal = 6.dp, vertical = 3.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Check,
                                contentDescription = "Active",
                                tint = Color.Black,
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                text = "ACTIVE",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.Black,
                            )
                        }
                    }
                }
            }

            // Bottom title & info gradient
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.65f),
                                Color.Black.copy(alpha = 0.94f),
                            ),
                        ),
                    )
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Column {
                    Text(
                        text = wallpaper.displayName,
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = wallpaper.description,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.70f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/**
 * Full-screen interactive wallpaper preview.
 * Allows user to inspect the wallpaper edge-to-edge before applying.
 */
@Composable
private fun FullScreenWallpaperPreview(
    wallpaper: AppWallpaper,
    isActive: Boolean,
    onDismiss: () -> Unit,
    onApply: () -> Unit,
) {
    BackHandler(onBack = onDismiss)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        // Full Wallpaper
        if (wallpaper.drawableRes != null) {
            Image(
                painter = painterResource(wallpaper.drawableRes),
                contentDescription = wallpaper.displayName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            // System-level dark overlay exactly as used on Home/Explore/Library/Settings
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.44f)),
            )
        }

        // Top Navigation Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.50f)),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Text(
                text = "Preview",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = Color.White,
            )
        }

        // Bottom Action Bar
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.75f),
                            Color.Black.copy(alpha = 0.98f),
                        ),
                    ),
                )
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = wallpaper.displayName,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = Color.White,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = wallpaper.description,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.72f),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(18.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    shape = RoundedCornerShape(24.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color.White,
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp),
                ) {
                    Text(
                        text = "Cancel",
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                Button(
                    onClick = onApply,
                    shape = RoundedCornerShape(24.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = Color.Black,
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp),
                ) {
                    if (isActive) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "Applied",
                            fontWeight = FontWeight.Bold,
                        )
                    } else {
                        Text(
                            text = "Apply",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}
