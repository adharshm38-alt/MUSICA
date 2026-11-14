package com.music.bitchord.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Wallpaper
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.music.bitchord.ui.icons.SfIcons

/**
 * Screen opened from Settings -> "Extra Changes".
 *
 * Contains:
 * 1. App Logos -> Choose your app icon
 * 2. Backgrounds -> Custom wallpapers & themes
 */
@Composable
fun ExtraChangesScreen(
    onOpenAppLogos: () -> Unit,
    onOpenBackgrounds: () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding),
    ) {
        SettingsPageTitle("Extra Changes")

        SettingsGroup(header = "Personalization") {
            SettingsRow(
                icon = SfIcons.Apps,
                title = "App Logos",
                subtitle = "Choose your app icon",
                onClick = onOpenAppLogos,
            )
            RowDivider()
            SettingsRow(
                icon = Icons.Rounded.Wallpaper,
                title = "Backgrounds",
                subtitle = "Custom wallpapers & themes",
                onClick = onOpenBackgrounds,
            )
        }
    }
}
