package com.music.bitchord.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.music.bitchord.data.MusicArtworkResolver
import com.music.bitchord.data.model.Song
import com.music.bitchord.data.remote.RemoteArtworkStore

/**
 * A drawable art URL for [song]:
 * - Resolves official 3000x3000px music album/single artwork via [MusicArtworkResolver].
 * - Never uses YouTube video thumbnails as default music cover artwork.
 * - Extracts embedded picture for local/remote library files.
 * - Falls back cleanly so the player shows a clean MUSICA placeholder.
 */
@Composable
fun rememberRemoteArtworkUrl(song: Song?): String? {
    val context = LocalContext.current
    val key = song?.videoId
    val cachedArt = remember(key, song?.title, song?.artist) {
        MusicArtworkResolver.getCached(song)
    }
    var resolved by remember(key, song?.title, song?.artist) {
        mutableStateOf(
            cachedArt ?: song?.thumbnailUrl?.takeIf { !MusicArtworkResolver.isVideoThumbnail(it) }
        )
    }
    LaunchedEffect(key, song?.title, song?.artist) {
        if (song == null) return@LaunchedEffect
        if (song.videoId.startsWith("webdav:") || song.videoId.startsWith("smb:")) {
            if (song.thumbnailUrl == null) {
                resolved = RemoteArtworkStore.resolveArt(context, song)
            }
        } else {
            val art = MusicArtworkResolver.resolveArtwork(song)
            if (art != null) {
                resolved = art
            } else if (MusicArtworkResolver.isVideoThumbnail(resolved)) {
                resolved = null
            }
        }
    }
    return resolved
}
