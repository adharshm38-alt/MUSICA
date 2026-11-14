package com.music.bitchord.data

import com.music.bitchord.data.model.Song
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.data.model.VideoDiscoveryKind
import com.music.bitchord.data.model.artworkAt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MusicArtworkResolverTest {

    @Test
    fun testIsVideoThumbnailDetectsYouTubeThumbnails() {
        val videoUrls = listOf(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
            "https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg",
            "https://i1.ytimg.com/vi/abc12345678/sddefault.jpg",
            "https://i9.ytimg.com/vi/xyz98765432/hqdefault.jpg",
        )
        for (url in videoUrls) {
            assertTrue(MusicArtworkResolver.isVideoThumbnail(url), "Should detect as video thumbnail: $url")
        }

        val nonVideoUrls = listOf(
            "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/61e73f94-018d-5f50-50ec-8521952bc72e/3000x3000bb.jpg",
            "https://lh3.googleusercontent.com/somerandomstring=w544-h544-l90-rj",
            "https://coverartarchive.org/release/12345/front",
            null,
            "",
        )
        for (url in nonVideoUrls) {
            assertFalse(MusicArtworkResolver.isVideoThumbnail(url), "Should NOT detect as video thumbnail: $url")
        }
    }

    @Test
    fun testToMaster3000UpgradesResolution() {
        val appleThumb = "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/100x100bb.jpg"
        val appleMaster = MusicArtworkResolver.toMaster3000(appleThumb)
        assertEquals(
            "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/3000x3000bb.jpg",
            appleMaster,
        )

        val googleThumb = "https://lh3.googleusercontent.com/abc=s544"
        val googleMaster = MusicArtworkResolver.toMaster3000(googleThumb)
        assertEquals("https://lh3.googleusercontent.com/abc=s3000", googleMaster)

        // Video thumbnails must NEVER be upgraded to master artwork
        val ytVideo = "https://i.ytimg.com/vi/xyz/hqdefault.jpg"
        assertNull(MusicArtworkResolver.toMaster3000(ytVideo))
    }

    @Test
    fun testArtworkAtForAppleCdn() {
        val appleUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/100x100bb.jpg"
        // Under 1000 requests exact px
        assertEquals(
            "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/160x160bb.jpg",
            appleUrl.artworkAt(160),
        )
        // 1000+ requests 3000x3000bb master artwork
        assertEquals(
            "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/3000x3000bb.jpg",
            appleUrl.artworkAt(1200),
        )
    }

    @Test
    fun testVideoDiscoveryItemBestSongForAudioDoesNotUseVideoThumbnail() {
        val itemWithVideoThumb = VideoDiscoveryItem(
            id = "test-1",
            videoId = "dQw4w9WgXcQ",
            kind = VideoDiscoveryKind.SIMILAR_TO_ARTIST,
            label = "Similar to Rick",
            title = "Never Gonna Give You Up",
            artist = "Rick Astley",
            thumbnailUrl = "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
            musicArtworkUrl = null,
        )

        val audioSong = itemWithVideoThumb.bestSongForAudioOrLibrary()
        assertNull(audioSong.thumbnailUrl, "Audio song must not fall back to video thumbnail")
        assertTrue(audioSong.isVideo, "Fallback retains asVideoSong attributes")

        val officialArt = "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/3000x3000bb.jpg"
        val itemWithOfficialArt = itemWithVideoThumb.copy(musicArtworkUrl = officialArt)
        val audioSongWithOfficialArt = itemWithOfficialArt.bestSongForAudioOrLibrary()
        assertEquals(officialArt, audioSongWithOfficialArt.thumbnailUrl)
    }
}
