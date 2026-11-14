package com.music.bitchord.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.music.bitchord.R

/**
 * Full-screen About MUSICA details page opened from Settings → About → Details.
 * Reuses Settings' card, divider, and typography tokens so it integrates as a
 * native surface in MUSICA.
 */
@Composable
fun AboutDetailsScreen(
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(contentPadding),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GROUP_INSET)
                .padding(top = 12.dp, bottom = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.musica_about_logo),
                contentDescription = "MUSICA Logo",
                modifier = Modifier.size(84.dp),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                text = "MUSICA",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.W800,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Version 1.0.0",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }

        AboutCopyGroup(
            header = "ABOUT MUSICA",
            body = "MUSICA is a modern music application designed to make discovering and enjoying music simple, seamless, and enjoyable. It brings music discovery, playlists, and a personalized listening experience together in one platform.",
        )

        AboutCopyGroup(
            header = "OUR MISSION",
            body = "To bring music discovery and listening together through innovative technology and a simple, enjoyable user experience.",
        )

        AboutCopyGroup(
            header = "OUR VISION",
            body = "To build a modern and reliable music platform that connects listeners with the music they love.",
        )

        SettingsGroup(header = "CREATED BY") {
            CreatorDetailRow(label = "Name", value = "Adarsh M")
            DetailCardDivider()
            CreatorDetailRow(label = "Role", value = "Founder & Creator of MUSICA")
            DetailCardDivider()
            CreatorDetailRow(label = "Description", value = "Independent App Developer")
            DetailCardDivider()
            CreatorDetailRow(label = "Location", value = "Kerala, India")
            DetailCardDivider()
            CreatorDetailRow(label = "Project", value = "MUSICA")
            DetailCardDivider()
            CreatorDetailRow(
                label = "GitHub",
                value = "adharshm38-alt",
                iconPainter = painterResource(R.drawable.ic_github),
                onClick = { runCatching { uriHandler.openUri("https://github.com/adharshm38-alt") } },
            )
        }

        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun AboutCopyGroup(
    header: String,
    body: String,
) {
    SettingsGroup(header = header) {
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground,
            lineHeight = 20.sp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = ROW_INSET, vertical = 14.dp),
        )
    }
}

@Composable
private fun DetailCardDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(start = ROW_INSET),
        thickness = 0.5.dp,
        color = MaterialTheme.colorScheme.outline,
    )
}

@Composable
private fun CreatorDetailRow(
    label: String,
    value: String,
    iconPainter: Painter? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .heightIn(min = 52.dp)
            .padding(horizontal = ROW_INSET, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (iconPainter != null) {
            Icon(
                painter = iconPainter,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.size(ICON_SIZE),
            )
            Spacer(Modifier.width(ICON_GAP))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
        if (onClick != null) {
            Spacer(Modifier.width(4.dp))
            Chevron()
        }
    }
}
