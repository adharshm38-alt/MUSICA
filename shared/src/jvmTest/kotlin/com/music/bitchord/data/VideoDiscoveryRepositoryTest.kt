package com.music.bitchord.data

import com.music.bitchord.data.model.HomeFeed
import com.music.bitchord.data.model.HomeShelf
import com.music.bitchord.data.model.ShelfItem
import com.music.bitchord.data.model.Song
import com.music.bitchord.data.model.VideoDiscoveryCache
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.data.model.VideoDiscoveryKind
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoDiscoveryRepositoryTest {

    @Test
    fun `shouldRefresh respects online state, TTL, cooldown and account changes`() {
        val now = 10_000_000L
        val sampleItem = VideoDiscoveryItem(
            id = "song_0:vidA",
            videoId = "vidA",
            kind = VideoDiscoveryKind.SIMILAR_TO_SONG,
            label = "Similar to Track A",
            title = "Video A",
            artist = "Artist A",
            thumbnailUrl = "https://img.example/a.jpg",
        )
        val freshCache = VideoDiscoveryCache(
            updatedAtMs = now - 60_000L,
            listener = "acct_1",
            items = listOf(sampleItem),
        )

        assertFalse(
            VideoDiscoveryRepository.shouldRefresh(
                cache = null,
                listenerIdentity = "acct_1",
                nowMs = now,
                lastAttemptMs = 0L,
                isOnline = false,
            ),
        )

        assertTrue(
            VideoDiscoveryRepository.shouldRefresh(
                cache = null,
                listenerIdentity = "acct_1",
                nowMs = now,
                lastAttemptMs = 0L,
                isOnline = true,
            ),
        )

        assertFalse(
            VideoDiscoveryRepository.shouldRefresh(
                cache = freshCache,
                listenerIdentity = "acct_1",
                nowMs = now,
                lastAttemptMs = now - 300_000L,
                isOnline = true,
            ),
        )

        assertTrue(
            VideoDiscoveryRepository.shouldRefresh(
                cache = freshCache,
                listenerIdentity = "acct_2",
                nowMs = now,
                lastAttemptMs = now - 300_000L,
                isOnline = true,
            ),
        )

        assertTrue(
            VideoDiscoveryRepository.shouldRefresh(
                cache = freshCache.copy(
                    updatedAtMs = now - VideoDiscoveryRepository.DEFAULT_REFRESH_INTERVAL_MS - 1_000L,
                ),
                listenerIdentity = "acct_1",
                nowMs = now,
                lastAttemptMs = now - 120_000L,
                isOnline = true,
            ),
        )

        assertFalse(
            VideoDiscoveryRepository.shouldRefresh(
                cache = freshCache.copy(
                    updatedAtMs = now - VideoDiscoveryRepository.DEFAULT_REFRESH_INTERVAL_MS - 1_000L,
                ),
                listenerIdentity = "acct_1",
                nowMs = now,
                lastAttemptMs = now - 5_000L,
                isOnline = true,
            ),
        )
    }

    @Test
    fun `refreshWithDeps prioritizes real videos and rotates unseen items ahead of recent history`() = runBlocking {
        val recent = listOf(
            Song(videoId = "seedSong1", title = "Blinding Lights", artist = "The Weeknd", thumbnailUrl = "https://img/seed1.jpg"),
        )
        val homeShelves = listOf(
            HomeShelf(
                title = "Videos for you",
                items = listOf(
                    ShelfItem(
                        title = "Home Clip",
                        subtitle = "Creator X",
                        thumbnailUrl = "https://img/homeclip.jpg",
                        videoId = "vidOld1",
                        browseId = null,
                        isVideo = true,
                    ),
                ),
            ),
        )
        val deps = VideoDiscoveryRepository.DiscoveryDeps(
            home = { Result.success(HomeFeed(homeShelves, continuation = null)) },
            moreHome = { _ -> Result.success(HomeFeed(emptyList(), continuation = null)) },
            newReleases = { Result.success(emptyList()) },
            exploreShelves = { Result.success(emptyList()) },
            moodsAndGenres = { Result.success(emptyList()) },
            moodGenreShelves = { _, _ -> Result.success(emptyList()) },
            upNext = { _ ->
                Result.success(
                    listOf(
                        Song(videoId = "relOld", title = "Old Match", artist = "Artist One", thumbnailUrl = "https://img/rel1.jpg"),
                        Song(videoId = "relNew", title = "Fresh Match", artist = "Artist Two", thumbnailUrl = "https://img/rel2.jpg"),
                    ),
                )
            },
            resolveVideo = { song ->
                when (song.videoId) {
                    "relOld" -> song.copy(videoId = "vidOld1", isVideo = true)
                    "relNew" -> song.copy(videoId = "vidFresh1", isVideo = true)
                    else -> null
                }
            },
            searchVideosPage = { query, _ ->
                Result.success(
                    VideoDiscoveryRepository.SearchVideosPage(
                        videos = listOf(
                            Song(
                                videoId = if (query.contains("The Weeknd")) "vidFreshArtist" else "vidTrending1",
                                title = "Official Music Video",
                                artist = "The Weeknd",
                                thumbnailUrl = "https://img/search.jpg",
                                isVideo = true,
                            ),
                        ),
                        continuation = null,
                    ),
                )
            },
        )
        val prev = VideoDiscoveryCache(
            updatedAtMs = 1_000L,
            listener = "user1",
            items = emptyList(),
            recentVideoIds = listOf("vidOld1"),
            rotationCursor = -1,
        )

        val cache = VideoDiscoveryRepository.refreshWithDeps(
            listenerIdentity = "user1",
            recentSongs = recent,
            likedSongs = emptyList(),
            homeShelves = homeShelves,
            previousCache = prev,
            nowMs = 5_000L,
            deps = deps,
        )

        val ids = cache.items.map { it.videoId }
        assertEquals(ids.distinct().size, ids.size)
        assertFalse("vidOld1" in ids)
        assertTrue("vidFresh1" in ids)
        val freshItem = cache.items.first { it.videoId == "vidFresh1" }
        assertEquals("Similar to Blinding Lights", freshItem.label)
        assertEquals("relNew", freshItem.correspondingSong?.videoId)
    }

    @Test
    fun `refreshWithDeps advances search and home continuations and avoids repeating page 1`() = runBlocking {
        val page1Videos = (1..4).map { i ->
            Song(
                videoId = "page1_$i",
                title = "Page 1 Video $i",
                artist = "Artist $i",
                thumbnailUrl = "https://img/p1_$i.jpg",
                isVideo = true,
            )
        }
        val page2Videos = (1..6).map { i ->
            Song(
                videoId = "page2_$i",
                title = "Page 2 Video $i",
                artist = "Artist $i",
                thumbnailUrl = "https://img/p2_$i.jpg",
                isVideo = true,
            )
        }
        val observedTokens = mutableListOf<String?>()
        val observedHomeTokens = mutableListOf<String>()

        val deps = VideoDiscoveryRepository.DiscoveryDeps(
            home = { Result.success(HomeFeed(emptyList(), continuation = "home_tok_1")) },
            moreHome = { token ->
                observedHomeTokens += token
                Result.success(
                    HomeFeed(
                        shelves = listOf(
                            HomeShelf(
                                title = "Deeper Home Videos",
                                items = listOf(
                                    ShelfItem(
                                        title = "Home Deep Clip",
                                        subtitle = "Creator Deep",
                                        thumbnailUrl = "https://img/home_deep.jpg",
                                        videoId = "homeDeep_1",
                                        browseId = null,
                                        isVideo = true,
                                    ),
                                ),
                            ),
                        ),
                        continuation = "home_tok_2",
                    ),
                )
            },
            newReleases = { Result.success(emptyList()) },
            exploreShelves = { Result.success(emptyList()) },
            moodsAndGenres = { Result.success(emptyList()) },
            moodGenreShelves = { _, _ -> Result.success(emptyList()) },
            upNext = { _ -> Result.success(emptyList()) },
            resolveVideo = { _ -> null },
            searchVideosPage = { _, token ->
                observedTokens += token
                if (token == null) {
                    Result.success(VideoDiscoveryRepository.SearchVideosPage(page1Videos, continuation = "tok_page_2"))
                } else {
                    Result.success(VideoDiscoveryRepository.SearchVideosPage(page2Videos, continuation = "tok_page_3"))
                }
            },
        )

        val recent = listOf(
            Song(videoId = "seed1", title = "Track One", artist = "Artist Alpha", thumbnailUrl = "https://img/s1.jpg"),
            Song(videoId = "seed2", title = "Track Two", artist = "Artist Beta", thumbnailUrl = "https://img/s2.jpg"),
        )

        // Refresh #1 sees page 1 & saves continuation tokens; Refresh #2 uses continuation instead of repeating page 1!
        val first = VideoDiscoveryRepository.refreshWithDeps(
            listenerIdentity = "user1",
            recentSongs = recent,
            likedSongs = emptyList(),
            homeShelves = emptyList(),
            previousCache = null,
            nowMs = 10_000L,
            deps = deps,
        )
        assertTrue(first.items.isNotEmpty())
        assertEquals("home_tok_2", first.homeContinuation)

        val second = VideoDiscoveryRepository.refreshWithDeps(
            listenerIdentity = "user1",
            recentSongs = recent,
            likedSongs = emptyList(),
            homeShelves = emptyList(),
            previousCache = first,
            nowMs = 20_000L + VideoDiscoveryRepository.DEFAULT_REFRESH_INTERVAL_MS,
            deps = deps,
        )
        val firstIds = first.items.map { it.videoId }.toSet()
        val secondIds = second.items.map { it.videoId }.toSet()
        assertTrue(secondIds.isNotEmpty())
        assertTrue((firstIds intersect secondIds).isEmpty())
        assertTrue(observedHomeTokens.contains("home_tok_1"))
        assertTrue(observedTokens.any { it == "tok_page_2" })
        assertTrue(second.rotationCursor > first.rotationCursor)
    }

    @Test
    fun `refreshWithDeps maintains 50 item history and keeps previous cache on failure`() = runBlocking {
        val oldItems = listOf(
            VideoDiscoveryItem(
                id = "old:vOld",
                videoId = "vOld",
                kind = VideoDiscoveryKind.TRENDING_VIDEOS,
                label = "Trending videos",
                title = "Old Video",
                artist = "Old Artist",
                thumbnailUrl = "https://img/old.jpg",
            ),
        )
        val longHistory = (1..55).map { "hist_$it" }
        val prev = VideoDiscoveryCache(
            updatedAtMs = 5_000L,
            listener = "user1",
            items = oldItems,
            recentVideoIds = longHistory,
            rotationCursor = 2,
        )

        val failingDeps = VideoDiscoveryRepository.DiscoveryDeps(
            home = { Result.failure(RuntimeException("offline")) },
            moreHome = { _ -> Result.failure(RuntimeException("offline")) },
            newReleases = { Result.failure(RuntimeException("offline")) },
            exploreShelves = { Result.failure(RuntimeException("offline")) },
            moodsAndGenres = { Result.failure(RuntimeException("offline")) },
            moodGenreShelves = { _, _ -> Result.failure(RuntimeException("offline")) },
            upNext = { _ -> Result.failure(RuntimeException("offline")) },
            resolveVideo = { null },
            searchVideosPage = { _, _ -> Result.failure(RuntimeException("offline")) },
        )

        val failedResult = VideoDiscoveryRepository.refreshWithDeps(
            listenerIdentity = "user1",
            recentSongs = emptyList(),
            likedSongs = emptyList(),
            homeShelves = emptyList(),
            previousCache = prev,
            nowMs = 900_000L,
            deps = failingDeps,
        )
        assertEquals(oldItems, failedResult.items)
        assertEquals(5_000L, failedResult.updatedAtMs)
        assertEquals(2, failedResult.rotationCursor)

        // Now verify history caps cleanly at 50 when fresh items succeed.
        val freshDeps = failingDeps.copy(
            searchVideosPage = { _, _ ->
                Result.success(
                    VideoDiscoveryRepository.SearchVideosPage(
                        videos = listOf(
                            Song(
                                videoId = "brandNewVid",
                                title = "Brand New Video",
                                artist = "Fresh Artist",
                                thumbnailUrl = "https://img/new.jpg",
                                isVideo = true,
                            ),
                        ),
                    ),
                )
            },
        )
        val okResult = VideoDiscoveryRepository.refreshWithDeps(
            listenerIdentity = "user1",
            recentSongs = emptyList(),
            likedSongs = emptyList(),
            homeShelves = emptyList(),
            previousCache = prev,
            nowMs = 950_000L,
            deps = freshDeps,
        )
        assertTrue("brandNewVid" in okResult.items.map { it.videoId })
        assertFalse("vOld" in okResult.items.map { it.videoId })
        assertEquals(VideoDiscoveryRepository.MAX_RECENT_HISTORY, okResult.recentVideoIds.size)
        assertEquals("brandNewVid", okResult.recentVideoIds.first())
    }

    @Test
    fun `encodeCache and decodeCache round-trip cleanly`() {
        val cache = VideoDiscoveryCache(
            updatedAtMs = 42_000L,
            listener = "guest",
            items = listOf(
                VideoDiscoveryItem(
                    id = "artist_0:vid1",
                    videoId = "vid1",
                    kind = VideoDiscoveryKind.SIMILAR_TO_ARTIST,
                    label = "Similar to Daft Punk",
                    title = "Around The World (Official Video)",
                    artist = "Daft Punk",
                    hashtags = listOf("#DaftPunk", "#Electronic"),
                    thumbnailUrl = "https://img/dp.jpg",
                ),
            ),
            recentVideoIds = listOf("vid1"),
        )
        val encoded = VideoDiscoveryRepository.encodeCache(cache)
        val decoded = VideoDiscoveryRepository.decodeCache(encoded)
        assertNotNull(decoded)
        assertEquals(cache, decoded)
    }

    @Test
    fun `parseWatchHtml extracts real creator avatar, browseId, subscription and hashtags without fabrication`() {
        val html = """
            <html><head><script>
            var ytInitialPlayerResponse = {
              "videoDetails": {
                "videoId": "abc12345678",
                "title": "Test Song (Official Music Video)",
                "lengthSeconds": "214",
                "channelId": "UCrealChannel99",
                "author": "Real Artist",
                "shortDescription": "Stream now #OfficialVideo #SynthPop #2026 #1"
              }
            };
            var ytInitialData = {
              "contents": {
                "twoColumnWatchNextResults": {
                  "results": {
                    "results": {
                      "contents": [
                        {
                          "videoPrimaryInfoRenderer": {
                            "superTitleLink": {
                              "runs": [
                                {"text": "#NewMusic"},
                                {"text": " "},
                                {"text": "#OfficialVideo"}
                              ]
                            }
                          }
                        },
                        {
                          "videoSecondaryInfoRenderer": {
                            "owner": {
                              "videoOwnerRenderer": {
                                "thumbnail": {
                                  "thumbnails": [
                                    {"url": "https://yt3.ggpht.com/avatar_small.jpg", "width": 48},
                                    {"url": "https://yt3.ggpht.com/avatar_hd.jpg", "width": 176}
                                  ]
                                },
                                "title": {
                                  "runs": [
                                    {
                                      "text": "Real Artist VEVO",
                                      "navigationEndpoint": {
                                        "browseEndpoint": {"browseId": "UCrealChannel99"}
                                      }
                                    }
                                  ]
                                },
                                "subscriberCountText": {"simpleText": "3.4M subscribers"}
                              }
                            },
                            "subscribeButton": {
                              "subscribeButtonRenderer": {
                                "channelId": "UCrealChannel99",
                                "subscribed": true
                              }
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            };
            </script></head><body></body></html>
        """.trimIndent()

        val parsed = VideoDiscoveryMetadata.parseWatchHtml(html, "abc12345678")
        assertNotNull(parsed)
        assertEquals("UCrealChannel99", parsed?.channelId)
        assertEquals("Real Artist VEVO", parsed?.creatorName)
        assertEquals("https://yt3.ggpht.com/avatar_hd.jpg", parsed?.avatarUrl)
        assertEquals("3.4M subscribers", parsed?.subscriberCountText)
        assertEquals(true, parsed?.subscribed)
        assertEquals(214, parsed?.durationSeconds)
        // Super-title hashtags preserved cleanly; numeric-only "#1"/"#2026" filtered out; case-insensitive dedup applied.
        assertEquals(listOf("#NewMusic", "#OfficialVideo", "#SynthPop"), parsed?.hashtags)
    }

    @Test
    fun `bestSongForAudioOrLibrary resolves companion song when present and falls back to video song`() {
        val companionSong = com.music.bitchord.data.model.VideoDiscoverySongRef(
            videoId = "audio_12345",
            title = "Midnight City",
            artist = "M83",
            thumbnailUrl = "https://img.example/m83_art.jpg",
            artistId = "UCartistM83",
            albumId = "MPREb_albumM83",
            albumName = "Hurry Up, We're Dreaming",
            durationText = "4:04",
        )

        val itemWithCompanion = VideoDiscoveryItem(
            id = "top_preview_1",
            videoId = "video_99999",
            kind = VideoDiscoveryKind.PICKED_FOR_YOU,
            label = "Top Preview",
            title = "Midnight City (Official Video)",
            artist = "M83",
            thumbnailUrl = "https://img.example/m83_video_thumb.jpg",
            correspondingSong = companionSong,
        )

        val resolvedFromCompanion = itemWithCompanion.bestSongForAudioOrLibrary()
        assertEquals("audio_12345", resolvedFromCompanion.videoId)
        assertEquals("Midnight City", resolvedFromCompanion.title)
        assertEquals("M83", resolvedFromCompanion.artist)
        assertEquals("https://img.example/m83_art.jpg", resolvedFromCompanion.thumbnailUrl)
        assertEquals("MPREb_albumM83", resolvedFromCompanion.albumId)
        assertEquals("Hurry Up, We're Dreaming", resolvedFromCompanion.albumName)

        val itemWithoutCompanion = VideoDiscoveryItem(
            id = "top_preview_2",
            videoId = "video_standalone",
            kind = VideoDiscoveryKind.TRENDING_VIDEOS,
            label = "Trending",
            title = "Live Performance Video",
            artist = "Acoustic Session",
            thumbnailUrl = "https://img.example/live_thumb.jpg",
            correspondingSong = null,
        )

        val fallbackResolved = itemWithoutCompanion.bestSongForAudioOrLibrary()
        assertEquals("video_standalone", fallbackResolved.videoId)
        assertEquals("Live Performance Video", fallbackResolved.title)
        assertEquals("Acoustic Session", fallbackResolved.artist)
        assertTrue(fallbackResolved.isVideo)
    }

    @Test
    fun `canonicalVideoThumbnail produces correct video thumbnails`() {
        assertEquals(
            "https://i.ytimg.com/vi/vid123/hqdefault.jpg",
            VideoDiscoveryRepository.canonicalVideoThumbnail("vid123", null),
        )
        assertEquals(
            "https://i.ytimg.com/vi/vid123/hqdefault.jpg",
            VideoDiscoveryRepository.canonicalVideoThumbnail("vid123", "https://img.example/album_art.jpg"),
        )
        assertEquals(
            "https://i.ytimg.com/vi/vid123/maxresdefault.jpg",
            VideoDiscoveryRepository.canonicalVideoThumbnail("vid123", "https://i.ytimg.com/vi/vid123/maxresdefault.jpg"),
        )
    }
}
