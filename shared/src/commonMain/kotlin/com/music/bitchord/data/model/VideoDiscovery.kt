package com.music.bitchord.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class VideoDiscoveryKind {
    SIMILAR_TO_SONG,
    SIMILAR_TO_ARTIST,
    TRENDING_VIDEOS,
    PICKED_FOR_YOU,
}

@Serializable
data class VideoDiscoverySongRef(
    val videoId: String,
    val title: String,
    val artist: String,
    val thumbnailUrl: String? = null,
    val artistId: String? = null,
    val albumId: String? = null,
    val albumName: String? = null,
    val durationText: String? = null,
) {
    fun toSong(): Song = Song(
        videoId = videoId,
        title = title,
        artist = artist,
        thumbnailUrl = thumbnailUrl,
        durationText = durationText,
        artistId = artistId,
        albumId = albumId,
        albumName = albumName,
    )

    companion object {
        fun fromSong(song: Song): VideoDiscoverySongRef = VideoDiscoverySongRef(
            videoId = song.videoId,
            title = song.title,
            artist = song.artist,
            thumbnailUrl = song.thumbnailUrl,
            artistId = song.artistId,
            albumId = song.albumId,
            albumName = song.albumName,
            durationText = song.durationText,
        )
    }
}

@Serializable
data class VideoDiscoveryItem(
    val id: String,
    val videoId: String,
    val kind: VideoDiscoveryKind,
    val label: String,
    val title: String,
    val artist: String,
    val artistBrowseId: String? = null,
    val creatorAvatarUrl: String? = null,
    val subscriberCountText: String? = null,
    val subscribed: Boolean? = null,
    val hashtags: List<String> = emptyList(),
    val thumbnailUrl: String,
    val seedName: String = "",
    val durationText: String? = null,
    val durationSeconds: Int? = null,
    val correspondingSong: VideoDiscoverySongRef? = null,
    val metadataLoaded: Boolean = false,
    val musicArtworkUrl: String? = null,
) {
    fun asVideoSong(): Song = Song(
        videoId = videoId,
        title = title,
        artist = artist,
        thumbnailUrl = thumbnailUrl,
        durationText = durationText,
        artistId = artistBrowseId,
        isVideo = true,
        isVideoOrigin = true,
    )

    fun bestSongForAudioOrLibrary(): Song {
        val base = correspondingSong?.toSong() ?: asVideoSong()
        val cleanArt = musicArtworkUrl
            ?: base.thumbnailUrl?.takeIf { !it.contains("ytimg.com/vi/") }
        return base.copy(
            thumbnailUrl = cleanArt,
        )
    }
}

@Serializable
data class VideoDiscoveryCache(
    val updatedAtMs: Long,
    val listener: String,
    val items: List<VideoDiscoveryItem>,
    val recentVideoIds: List<String> = emptyList(),
    val rotationCursor: Int = 0,
    val searchContinuations: Map<String, String> = emptyMap(),
    val homeContinuation: String? = null,
)
