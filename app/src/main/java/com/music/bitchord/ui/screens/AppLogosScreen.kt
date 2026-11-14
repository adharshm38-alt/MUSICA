package com.music.bitchord.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.music.bitchord.data.settings.AppLogo
import com.music.bitchord.data.settings.AppSettings

/**
 * Screen opened from Settings -> Extra Changes -> App Logos.
 *
 * Displays all six official MUSICA dotted cassette launcher icon variants
 * in user-specified order:
 * 1. Default (Red)
 * 2. Black
 * 3. Lavender
 * 4. Mint Green
 * 5. Sky Blue
 * 6. Pink
 *
 * Tapping any icon immediately applies the Android launcher icon using
 * PackageManager activity-alias switching and persists the selection.
 */
@Composable
fun AppLogosScreen(
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val activeLogo by AppSettings.appLogo.collectAsStateWithLifecycle()

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
                        text = "App Logos",
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color.White,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Choose your app icon. The selected logo will appear on your home screen and app drawer.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.68f),
                    )
                }
            }

            items(AppLogo.ALL, key = { it.id }) { logo ->
                AppLogoCard(
                    logo = logo,
                    isActive = logo == activeLogo,
                    onClick = {
                        if (logo != activeLogo) {
                            AppSettings.setAppLogo(logo)
                            AppLogo.apply(context, logo)
                            Toast.makeText(
                                context,
                                "${logo.displayName} logo applied. Launcher will update shortly.",
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                    },
                )
            }

            item(span = { GridItemSpan(2) }) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp, bottom = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    AnimatedVisibility(
                        visible = activeLogo != AppLogo.DEFAULT,
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        OutlinedButton(
                            onClick = {
                                AppSettings.setAppLogo(AppLogo.DEFAULT)
                                AppLogo.apply(context, AppLogo.DEFAULT)
                                Toast.makeText(
                                    context,
                                    "Default logo restored",
                                    Toast.LENGTH_SHORT,
                                ).show()
                            },
                            shape = RoundedCornerShape(999.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = Color.White,
                            ),
                            border = ButtonDefaults.outlinedButtonBorder.copy(
                                brush = androidx.compose.ui.graphics.SolidColor(Color.White.copy(alpha = 0.3f)),
                            ),
                            modifier = Modifier.padding(bottom = 12.dp),
                        ) {
                            Icon(
                                Icons.Rounded.Refresh,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Restore Default Logo")
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color.White.copy(alpha = 0.05f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "Note: Android launcher icons may take a few moments to refresh on your home screen. Restarting your launcher or device will apply the change immediately.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.55f),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(14.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AppLogoCard(
    logo: AppLogo,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cardShape = RoundedCornerShape(20.dp)
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
            .border(if (isActive) 2.dp else 1.dp, borderColor, cardShape)
            .clip(cardShape)
            .clickable(onClick = onClick),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(16.dp),
        ) {
            // Icon preview container (squircle shape)
            val iconShape = RoundedCornerShape(22.dp)
            Surface(
                shape = iconShape,
                color = Color.Transparent,
                modifier = Modifier
                    .size(92.dp)
                    .clip(iconShape),
            ) {
                Image(
                    painter = painterResource(logo.previewRes),
                    contentDescription = logo.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            Spacer(Modifier.height(14.dp))

            // Logo Name
            Text(
                text = logo.displayName,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(Modifier.height(3.dp))

            // Subtitle
            Text(
                text = logo.subtitle,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                color = Color.White.copy(alpha = 0.62f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(12.dp))

            // ACTIVE indicator pill or subtle Apply indicator
            if (isActive) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color.White,
                    contentColor = Color.Black,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    ) {
                        Icon(
                            Icons.Rounded.Check,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = Color.Black,
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "ACTIVE",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 10.sp,
                                letterSpacing = 0.5.sp,
                            ),
                            color = Color.Black,
                        )
                    }
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color.White.copy(alpha = 0.08f),
                    contentColor = Color.White.copy(alpha = 0.7f),
                ) {
                    Text(
                        text = "Apply",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Medium,
                            fontSize = 10.sp,
                        ),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}
