package com.music.bitchord.data

import com.music.bitchord.data.model.HomeFeed
import com.music.bitchord.data.model.HomeShelf
import com.music.bitchord.data.model.MoodGenreSection
import com.music.bitchord.data.model.SearchFilter
import com.music.bitchord.data.model.SearchResult
import com.music.bitchord.data.model.ShelfItem
import com.music.bitchord.data.model.Song
import com.music.bitchord.data.model.VideoDiscoveryCache
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.data.model.VideoDiscoveryKind
import com.music.bitchord.data.model.VideoDiscoverySongRef
import com.music.bitchord.data.sources.TrackMatcher
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random

/**
 * Builds personalized and catalog-driven short-video / music-video discovery
 * items from real YouTube Music data (Home shelves + continuations, Recents,
 * Likes, UpNext, Explore charts/moods, and paginated SearchFilter.VIDEOS),
 * rotating seeds/queries and maintaining a rolling 50-video duplicate exclusion history.
 */
object VideoDiscoveryRepository {
    const val MAX_ITEMS = 12
    const val DEFAULT_REFRESH_INTERVAL_MS = 10 * 60_000L
    const val MIN_RETRY_INTERVAL_MS = 60_000L
    const val MAX_RECENT_HISTORY = 50
    private const val MAX_SEARCH_PAGES_PER_QUERY = 2
    private const val MAX_CARDS_PER_BRANCH = 4
    private const val MAX_STORED_CONTINUATIONS = 24

    enum class DiscoveryTarget {
        TOP_PREVIEW,
        DISCOVER_VIDEOS,
    }

    private val GENERAL_VIDEO_QUERIES = listOf(
        "new official music videos",
        "trending music videos",
        "live session music video",
        "acoustic performance music video",
        "indie official music video",
        "pop hits music video",
    )

    private val ARTIST_QUERY_PATTERNS = listOf(
        { artist: String -> "$artist official music video" },
        { artist: String -> "$artist music video" },
        { artist: String -> "$artist live performance video" },
        { artist: String -> "$artist new song video" },
    )

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    internal data class SearchVideosPage(
        val videos: List<Song>,
        val continuation: String? = null,
    )

    internal data class DiscoveryDeps(
        val home: suspend () -> Result<HomeFeed> = { YtMusicRepository.home() },
        val moreHome: suspend (String) -> Result<HomeFeed> = { token -> YtMusicRepository.moreHome(token) },
        val newReleases: suspend () -> Result<List<HomeShelf>> = { YtMusicRepository.homeSupplement("FEmusic_new_releases") },
        val exploreShelves: suspend () -> Result<List<HomeShelf>> = { YtMusicRepository.homeSupplement("FEmusic_explore") },
        val moodsAndGenres: suspend () -> Result<List<MoodGenreSection>> = { YtMusicRepository.moodAndGenres() },
        val moodGenreShelves: suspend (String, String?) -> Result<List<HomeShelf>> = { id, params ->
            YtMusicRepository.moodGenreShelves(id, params)
        },
        val upNext: suspend (String) -> Result<List<Song>> = { videoId -> YtMusicRepository.radio(videoId, preferVideo = true) },
        val searchVideosPage: suspend (String, String?) -> Result<SearchVideosPage> = { query, continuation ->
            val pageResult = if (!continuation.isNullOrBlank()) {
                YtMusicRepository.searchContinuation(continuation, SearchFilter.VIDEOS)
            } else {
                YtMusicRepository.searchPage(query, SearchFilter.VIDEOS)
            }
            pageResult.map { page ->
                val videos = page.rows.mapNotNull { row ->
                    when (row) {
                        is SearchResult.TopTrack -> row.song
                        is SearchResult.Track -> row.song
                        is SearchResult.Browse -> null
                    }
                }.filter { it.isVideo && it.videoId.isNotBlank() }
                SearchVideosPage(videos = videos, continuation = page.continuation)
            }
        },
        val resolveVideo: suspend (Song) -> Song? = { song -> YtMusicRepository.resolveVideo(song) },
    )

    fun encodeCache(cache: VideoDiscoveryCache): String = json.encodeToString(cache)

    fun decodeCache(raw: String): VideoDiscoveryCache? =
        runCatching { json.decodeFromString<VideoDiscoveryCache>(raw) }.getOrNull()

    fun shouldRefresh(
        cache: VideoDiscoveryCache?,
        listenerIdentity: String,
        nowMs: Long,
        lastAttemptMs: Long,
        isOnline: Boolean,
        force: Boolean = false,
        refreshIntervalMs: Long = DEFAULT_REFRESH_INTERVAL_MS,
    ): Boolean {
        if (!isOnline) return false
        if (force) return (nowMs - lastAttemptMs) >= 1_500L || lastAttemptMs == 0L
        if (cache == null || cache.items.isEmpty()) {
            return (nowMs - lastAttemptMs) >= MIN_RETRY_INTERVAL_MS || lastAttemptMs == 0L
        }
        if (cache.listener != listenerIdentity) return true
        val stale = (nowMs - cache.updatedAtMs) >= refreshIntervalMs
        if (!stale) return false
        return (nowMs - lastAttemptMs) >= MIN_RETRY_INTERVAL_MS
    }

    suspend fun refresh(
        listenerIdentity: String,
        recentSongs: List<Song>,
        likedSongs: List<Song>,
        homeShelves: List<HomeShelf>,
        initialHomeContinuation: String? = null,
        extraArtists: List<String> = emptyList(),
        extraGenres: List<String> = emptyList(),
        blockedVideoIds: Set<String> = emptySet(),
        playedVideoIds: Set<String> = emptySet(),
        previousCache: VideoDiscoveryCache? = null,
        nowMs: Long = System.currentTimeMillis(),
        target: DiscoveryTarget = DiscoveryTarget.DISCOVER_VIDEOS,
    ): VideoDiscoveryCache = refreshWithDeps(
        listenerIdentity = listenerIdentity,
        recentSongs = recentSongs,
        likedSongs = likedSongs,
        homeShelves = homeShelves,
        initialHomeContinuation = initialHomeContinuation,
        extraArtists = extraArtists,
        extraGenres = extraGenres,
        blockedVideoIds = blockedVideoIds,
        playedVideoIds = playedVideoIds,
        previousCache = previousCache,
        nowMs = nowMs,
        target = target,
        deps = DiscoveryDeps(),
    )

    suspend fun refreshTopPreview(
        listenerIdentity: String,
        recentSongs: List<Song>,
        likedSongs: List<Song>,
        homeShelves: List<HomeShelf>,
        initialHomeContinuation: String? = null,
        extraArtists: List<String> = emptyList(),
        blockedVideoIds: Set<String> = emptySet(),
        playedVideoIds: Set<String> = emptySet(),
        previousCache: VideoDiscoveryCache? = null,
        nowMs: Long = System.currentTimeMillis(),
    ): VideoDiscoveryCache = refreshWithDeps(
        listenerIdentity = listenerIdentity,
        recentSongs = recentSongs,
        likedSongs = likedSongs,
        homeShelves = homeShelves,
        initialHomeContinuation = initialHomeContinuation,
        extraArtists = extraArtists,
        extraGenres = emptyList(),
        blockedVideoIds = blockedVideoIds,
        playedVideoIds = playedVideoIds,
        previousCache = previousCache,
        nowMs = nowMs,
        target = DiscoveryTarget.TOP_PREVIEW,
        deps = DiscoveryDeps(),
    )

    internal suspend fun refreshWithDeps(
        listenerIdentity: String,
        recentSongs: List<Song>,
        likedSongs: List<Song>,
        homeShelves: List<HomeShelf>,
        initialHomeContinuation: String? = null,
        extraArtists: List<String> = emptyList(),
        extraGenres: List<String> = emptyList(),
        blockedVideoIds: Set<String> = emptySet(),
        playedVideoIds: Set<String> = emptySet(),
        previousCache: VideoDiscoveryCache? = null,
        nowMs: Long = System.currentTimeMillis(),
        target: DiscoveryTarget = DiscoveryTarget.DISCOVER_VIDEOS,
        deps: DiscoveryDeps,
    ): VideoDiscoveryCache = coroutineScope {
        val sameListenerCache = previousCache?.takeIf { it.listener == listenerIdentity }
        val rotationCursor = (sameListenerCache?.rotationCursor ?: -1) + 1
        val currentItems = sameListenerCache?.items.orEmpty()
        val currentIds = currentItems.mapTo(HashSet()) { it.videoId }
        val recentHistory = sameListenerCache?.recentVideoIds.orEmpty()
        val excludedIds = (blockedVideoIds + currentIds + recentHistory + playedVideoIds).toHashSet()
        val savedContinuations = sameListenerCache?.searchContinuations.orEmpty()
        val nextContinuations = ConcurrentHashMap<String, String>(savedContinuations)

        var initialHomeToken: String? = initialHomeContinuation
        val loadedHome = if (homeShelves.isNotEmpty()) {
            homeShelves
        } else {
            val feed = attempt { deps.home().getOrNull() }.getOrNull()
            initialHomeToken = feed?.continuation ?: initialHomeToken
            feed?.shelves.orEmpty()
        }

        // Advance FEmusic_home continuation across refreshes when available so new Home
        // video shelves/mixes are surfaced rather than only page 1.
        var nextHomeToken: String? = sameListenerCache?.homeContinuation ?: initialHomeToken
        val pagedHomeShelves = if (!nextHomeToken.isNullOrBlank()) {
            val more = attempt { deps.moreHome(nextHomeToken!!).getOrNull() }.getOrNull()
            if (more != null && more.shelves.isNotEmpty()) {
                nextHomeToken = more.continuation ?: initialHomeToken
                more.shelves
            } else {
                nextHomeToken = initialHomeToken
                emptyList()
            }
        } else {
            emptyList()
        }

        val allHomeShelves = (pagedHomeShelves + loadedHome)
            .distinctBy { it.title to it.items.firstOrNull()?.videoId }

        val songSeeds = rotate(
            buildSongSeeds(recentSongs, likedSongs, allHomeShelves),
            rotationCursor,
        )
        val artistSeeds = rotate(
            buildArtistSeeds(recentSongs, likedSongs, extraArtists, allHomeShelves),
            rotationCursor * 2,
        )
        val queryPatternOffset = rotationCursor % ARTIST_QUERY_PATTERNS.size

        // Wave 1: diverse parallel branches using rotated seeds & persisted continuation tokens.
        val songBranches = songSeeds.take(3).mapIndexed { idx, seed ->
            async {
                val upNextTracks = attempt { deps.upNext(seed.videoId).getOrDefault(emptyList()) }
                    .getOrDefault(emptyList())
                    .filter { it.videoId.isNotBlank() && it.videoId != seed.videoId }
                    .let { tracks -> rotate(tracks, rotationCursor) }

                val prioritizedTracks = upNextTracks.filterNot { it.videoId in excludedIds } +
                    upNextTracks.filter { it.videoId in excludedIds }

                val videos = mutableListOf<Pair<Song, Song?>>()
                val seenLocal = HashSet<String>()
                for (candidate in prioritizedTracks.take(8)) {
                    if (videos.size >= MAX_CARDS_PER_BRANCH) break
                    val resolved = attempt { deps.resolveVideo(candidate) }.getOrNull()
                    if (resolved != null && resolved.videoId.isNotBlank() && seenLocal.add(resolved.videoId)) {
                        if (resolved.videoId !in excludedIds) {
                            videos += resolved to candidate
                        }
                    }
                }
                if (videos.size < 2) {
                    val searchQuery = "${seed.title} ${seed.artist} official music video"
                    val searched = searchPaginated(
                        query = searchQuery,
                        deps = deps,
                        savedContinuations = savedContinuations,
                        nextContinuations = nextContinuations,
                        excludedIds = excludedIds,
                        maxFreshDesired = MAX_CARDS_PER_BRANCH - videos.size,
                    )
                    searched.videos
                        .filter { it.videoId != seed.videoId && seenLocal.add(it.videoId) }
                        .forEach { v ->
                            videos += v to seed.takeIf { v.title.contains(it.title, ignoreCase = true) }
                        }
                }
                videos.mapNotNull { (video, companion) ->
                    toItem(
                        video = video,
                        kind = VideoDiscoveryKind.SIMILAR_TO_SONG,
                        label = "Similar to ${seed.title}",
                        seedName = seed.title,
                        companionSong = companion,
                        rankTag = "song_${rotationCursor}_$idx",
                    )
                }
            }
        }

        val artistBranches = artistSeeds.take(3).mapIndexed { idx, artistSeed ->
            async {
                val pattern = ARTIST_QUERY_PATTERNS[(queryPatternOffset + idx) % ARTIST_QUERY_PATTERNS.size]
                val query = pattern(artistSeed)
                val searched = searchPaginated(
                    query = query,
                    deps = deps,
                    savedContinuations = savedContinuations,
                    nextContinuations = nextContinuations,
                    excludedIds = excludedIds,
                    maxFreshDesired = MAX_CARDS_PER_BRANCH,
                )
                searched.videos.mapNotNull { video ->
                    toItem(
                        video = video,
                        kind = VideoDiscoveryKind.SIMILAR_TO_ARTIST,
                        label = "Similar to $artistSeed",
                        seedName = artistSeed,
                        companionSong = null,
                        rankTag = "artist_${rotationCursor}_$idx",
                    )
                }
            }
        }

        val homeVideoBranch = async {
            val rawHomeVideos = allHomeShelves.flatMap { it.items }
                .filter { it.isVideo && !it.videoId.isNullOrBlank() }
                .distinctBy { it.videoId }
            val freshHome = rawHomeVideos.filterNot { it.videoId in excludedIds }
            val pool = (freshHome + rawHomeVideos.filter { it.videoId in excludedIds })
                .take(MAX_CARDS_PER_BRANCH * 2)
            pool.mapNotNull { shelfItem ->
                toShelfVideoItem(shelfItem, VideoDiscoveryKind.TRENDING_VIDEOS, "Trending videos")
            }
        }

        val catalogBranch = async {
            val releasesDeferred = async {
                attempt { deps.newReleases().getOrDefault(emptyList()) }.getOrDefault(emptyList())
            }
            val exploreDeferred = async {
                attempt { deps.exploreShelves().getOrDefault(emptyList()) }.getOrDefault(emptyList())
            }
            val releases = releasesDeferred.await()
            val explore = exploreDeferred.await()
            val shelfVideos = (explore + releases).flatMap { it.items }
                .filter { it.isVideo && !it.videoId.isNullOrBlank() }
                .distinctBy { it.videoId }
            val rotatedShelfVideos = rotate(shelfVideos, rotationCursor)
            val mapped = (
                rotatedShelfVideos.filterNot { it.videoId in excludedIds } +
                    rotatedShelfVideos.filter { it.videoId in excludedIds }
                )
                .take(MAX_CARDS_PER_BRANCH * 2)
                .mapNotNull { shelfItem ->
                    toShelfVideoItem(shelfItem, VideoDiscoveryKind.PICKED_FOR_YOU, "Picked for you")
                }
                .toMutableList()

            if (mapped.count { it.videoId !in excludedIds } < 2) {
                val releaseSeeds = (explore + releases).flatMap { it.items }
                    .mapNotNull { it.toSong() }
                    .distinctBy { it.videoId }
                    .let { rotate(it, rotationCursor) }
                val fallbackQuery = releaseSeeds.firstOrNull()?.let { "${it.title} ${it.artist} music video" }
                    ?: GENERAL_VIDEO_QUERIES[rotationCursor % GENERAL_VIDEO_QUERIES.size]
                val searched = searchPaginated(
                    query = fallbackQuery,
                    deps = deps,
                    savedContinuations = savedContinuations,
                    nextContinuations = nextContinuations,
                    excludedIds = excludedIds,
                    maxFreshDesired = MAX_CARDS_PER_BRANCH,
                )
                searched.videos.mapNotNullTo(mapped) { v ->
                    toItem(
                        video = v,
                        kind = VideoDiscoveryKind.TRENDING_VIDEOS,
                        label = "Trending videos",
                        seedName = v.artist,
                        companionSong = null,
                        rankTag = "trending_${rotationCursor}",
                    )
                }
            }
            mapped
        }

        val wave1 = buildList {
            if (target == DiscoveryTarget.TOP_PREVIEW) {
                // Top Preview for You specializes in Similar Artist & Similar Song previews
                songBranches.forEach { addAll(it.await()) }
                artistBranches.forEach { addAll(it.await()) }
                if (isEmpty()) {
                    addAll(homeVideoBranch.await())
                }
            } else {
                // Discover Music Videos specializes in Catalog, Trending & Genre Discovery
                addAll(homeVideoBranch.await())
                addAll(catalogBranch.await())
                songBranches.forEach { addAll(it.await()) }
                artistBranches.forEach { addAll(it.await()) }
            }
        }

        val wave1Fresh = wave1
            .filter { it.videoId !in excludedIds && it.thumbnailUrl.isNotBlank() }
            .distinctBy { it.videoId }

        // Wave 2: If Wave 1 still has fewer than MAX_ITEMS fresh videos, query extra rotated
        // artists, real Mood & Genre categories, and rotated general music-video queries.
        val wave2 = if (wave1Fresh.size < MAX_ITEMS) {
            fetchExtraDiverseWave(
                needed = MAX_ITEMS - wave1Fresh.size,
                rotationCursor = rotationCursor,
                artistSeeds = artistSeeds.drop(3),
                extraGenres = extraGenres,
                excludedIds = excludedIds + wave1Fresh.map { it.videoId },
                savedContinuations = savedContinuations,
                nextContinuations = nextContinuations,
                deps = deps,
            )
        } else {
            emptyList()
        }

        val allEligible = (wave1 + wave2)
            .filter { it.videoId !in blockedVideoIds && it.thumbnailUrl.isNotBlank() }
            .distinctBy { it.videoId }
            .distinctBy { cleanTrackKey(it.title, it.artist) }

        val freshEligible = allEligible.filterNot { it.videoId in excludedIds }

        val selected: List<VideoDiscoveryItem> = if (freshEligible.isNotEmpty()) {
            interleaveAndShuffle(
                items = freshEligible,
                limit = MAX_ITEMS,
                seed = nowMs xor rotationCursor.toLong(),
            )
        } else {
            rankRecycledLeastRecent(
                candidates = allEligible.filter { it.videoId !in currentIds },
                recentHistory = recentHistory,
            ).take(MAX_ITEMS)
        }

        // Preserve existing cached recommendations on complete failure / offline return
        // without corrupting updatedAtMs, rotationCursor, or pagination state.
        if (selected.isEmpty()) {
            return@coroutineScope VideoDiscoveryCache(
                updatedAtMs = sameListenerCache?.updatedAtMs ?: 0L,
                listener = listenerIdentity,
                items = currentItems,
                recentVideoIds = recentHistory,
                rotationCursor = sameListenerCache?.rotationCursor ?: 0,
                searchContinuations = savedContinuations,
                homeContinuation = sameListenerCache?.homeContinuation,
            )
        }

        val finalItems = selected
            .distinctBy { it.videoId }
            .distinctBy { cleanTrackKey(it.title, it.artist) }
            .take(MAX_ITEMS)
        val updatedHistory = (finalItems.map { it.videoId } + recentHistory)
            .distinct()
            .take(MAX_RECENT_HISTORY)

        val prunedContinuations = pruneContinuations(nextContinuations)

        VideoDiscoveryCache(
            updatedAtMs = nowMs,
            listener = listenerIdentity,
            items = finalItems,
            recentVideoIds = updatedHistory,
            rotationCursor = rotationCursor,
            searchContinuations = prunedContinuations,
            homeContinuation = nextHomeToken,
        )
    }

    private suspend fun searchPaginated(
        query: String,
        deps: DiscoveryDeps,
        savedContinuations: Map<String, String>,
        nextContinuations: ConcurrentHashMap<String, String>,
        excludedIds: Set<String>,
        maxFreshDesired: Int,
    ): SearchVideosPage {
        val collected = mutableListOf<Song>()
        val seenIds = HashSet<String>()
        var cursor: String? = savedContinuations[query]
        var nextTokenToPersist: String? = null
        var pagesFetched = 0

        while (pagesFetched < MAX_SEARCH_PAGES_PER_QUERY) {
            val result = attempt { deps.searchVideosPage(query, cursor) }.getOrNull()
            var page = result?.getOrNull()
            // Expired continuation token? Fall back cleanly to fresh page 1.
            if (page == null && cursor != null && pagesFetched == 0) {
                cursor = null
                page = attempt { deps.searchVideosPage(query, null).getOrNull() }.getOrNull()
            }
            if (page == null) break
            pagesFetched++
            page.videos.forEach { song ->
                if (song.videoId.isNotBlank() && seenIds.add(song.videoId)) {
                    collected += song
                }
            }
            nextTokenToPersist = page.continuation
            val freshCount = collected.count { it.videoId !in excludedIds }
            if (freshCount >= maxFreshDesired || nextTokenToPersist.isNullOrBlank()) {
                break
            }
            cursor = nextTokenToPersist
        }

        if (!nextTokenToPersist.isNullOrBlank()) {
            nextContinuations[query] = nextTokenToPersist
        } else {
            nextContinuations.remove(query)
        }

        val ordered = (
            collected.filterNot { it.videoId in excludedIds } +
                collected.filter { it.videoId in excludedIds }
            ).take(MAX_CARDS_PER_BRANCH.coerceAtLeast(maxFreshDesired))
        return SearchVideosPage(videos = ordered, continuation = nextTokenToPersist)
    }

    private suspend fun fetchExtraDiverseWave(
        needed: Int,
        rotationCursor: Int,
        artistSeeds: List<String>,
        extraGenres: List<String>,
        excludedIds: Set<String>,
        savedContinuations: Map<String, String>,
        nextContinuations: ConcurrentHashMap<String, String>,
        deps: DiscoveryDeps,
    ): List<VideoDiscoveryItem> = coroutineScope {
        val tasks = mutableListOf<kotlinx.coroutines.Deferred<List<VideoDiscoveryItem>>>()

        artistSeeds.take(2).forEachIndexed { idx, artistSeed ->
            tasks += async {
                val pattern = ARTIST_QUERY_PATTERNS[(rotationCursor + idx + 1) % ARTIST_QUERY_PATTERNS.size]
                val query = pattern(artistSeed)
                val searched = searchPaginated(
                    query = query,
                    deps = deps,
                    savedContinuations = savedContinuations,
                    nextContinuations = nextContinuations,
                    excludedIds = excludedIds,
                    maxFreshDesired = MAX_CARDS_PER_BRANCH,
                )
                searched.videos.mapNotNull { video ->
                    toItem(
                        video = video,
                        kind = VideoDiscoveryKind.SIMILAR_TO_ARTIST,
                        label = "More from $artistSeed",
                        seedName = artistSeed,
                        companionSong = null,
                        rankTag = "artist_wave2_${rotationCursor}_$idx",
                    )
                }
            }
        }

        tasks += async {
            val sections = attempt { deps.moodsAndGenres().getOrDefault(emptyList()) }
                .getOrDefault(emptyList())
            val moods = sections.flatMap { it.items }.filter { it.browseId.isNotBlank() }
            val chosenGenreName: String?
            val shelfItems = if (moods.isNotEmpty()) {
                val mood = moods[rotationCursor % moods.size]
                chosenGenreName = mood.title
                val shelves = attempt {
                    deps.moodGenreShelves(mood.browseId, mood.params).getOrDefault(emptyList())
                }.getOrDefault(emptyList())
                shelves.flatMap { it.items }
                    .filter { it.isVideo && !it.videoId.isNullOrBlank() && it.videoId !in excludedIds }
            } else {
                chosenGenreName = null
                emptyList()
            }

            if (shelfItems.isNotEmpty()) {
                shelfItems.take(MAX_CARDS_PER_BRANCH).mapNotNull { shelfItem ->
                    toShelfVideoItem(
                        item = shelfItem,
                        kind = VideoDiscoveryKind.PICKED_FOR_YOU,
                        label = chosenGenreName?.let { "$it Videos" } ?: "Picked for you",
                    )
                }
            } else {
                val category = extraGenres.takeIf { it.isNotEmpty() }
                    ?.let { it[rotationCursor % it.size] }
                    ?: chosenGenreName
                val query = if (!category.isNullOrBlank()) {
                    "$category music video"
                } else {
                    GENERAL_VIDEO_QUERIES[(rotationCursor + needed) % GENERAL_VIDEO_QUERIES.size]
                }
                val searched = searchPaginated(
                    query = query,
                    deps = deps,
                    savedContinuations = savedContinuations,
                    nextContinuations = nextContinuations,
                    excludedIds = excludedIds,
                    maxFreshDesired = MAX_CARDS_PER_BRANCH,
                )
                searched.videos.mapNotNull { v ->
                    toItem(
                        video = v,
                        kind = VideoDiscoveryKind.PICKED_FOR_YOU,
                        label = category?.let { "$it Videos" } ?: "Picked for you",
                        seedName = category ?: v.artist,
                        companionSong = null,
                        rankTag = "genre_wave2_${rotationCursor}",
                    )
                }
            }
        }

        tasks.awaitAll().flatten()
    }

    private fun interleaveAndShuffle(
        items: List<VideoDiscoveryItem>,
        limit: Int,
        seed: Long,
    ): List<VideoDiscoveryItem> {
        if (items.size <= 1) return items.take(limit)
        val rng = Random(seed)
        val byLabel = items.groupBy { it.label }
            .values
            .map { group -> group.shuffled(rng).take(MAX_CARDS_PER_BRANCH) }
            .shuffled(rng)

        val balanced = mutableListOf<VideoDiscoveryItem>()
        val maxRound = byLabel.maxOfOrNull { it.size } ?: 0
        for (round in 0 until maxRound) {
            for (bucket in byLabel) {
                if (round < bucket.size && balanced.size < limit) {
                    balanced += bucket[round]
                }
            }
        }
        return balanced.distinctBy { it.videoId }.take(limit)
    }

    private fun rankRecycledLeastRecent(
        candidates: List<VideoDiscoveryItem>,
        recentHistory: List<String>,
    ): List<VideoDiscoveryItem> {
        if (candidates.isEmpty()) return emptyList()
        val recencyIndex = recentHistory.withIndex().associate { (index, id) -> id to index }
        return candidates
            .distinctBy { it.videoId }
            .sortedByDescending { item -> recencyIndex[item.videoId] ?: Int.MAX_VALUE }
    }

    private fun pruneContinuations(map: Map<String, String>): Map<String, String> {
        if (map.size <= MAX_STORED_CONTINUATIONS) return map
        return map.entries.toList().takeLast(MAX_STORED_CONTINUATIONS).associate { it.key to it.value }
    }

    private fun <T> rotate(list: List<T>, offset: Int): List<T> {
        if (list.size <= 1) return list
        val shift = ((offset % list.size) + list.size) % list.size
        if (shift == 0) return list
        return list.drop(shift) + list.take(shift)
    }

    private fun buildSongSeeds(
        recentSongs: List<Song>,
        likedSongs: List<Song>,
        homeShelves: List<HomeShelf>,
    ): List<Song> {
        val raw = recentSongs.filter { it.localUri == null && it.videoId.isNotBlank() } +
            likedSongs.filter { it.localUri == null && it.videoId.isNotBlank() } +
            homeShelves.flatMap { it.items }.mapNotNull { it.toSong() }
        return raw.distinctBy { it.videoId }.take(16)
    }

    private fun buildArtistSeeds(
        recentSongs: List<Song>,
        likedSongs: List<Song>,
        extraArtists: List<String>,
        homeShelves: List<HomeShelf>,
    ): List<String> {
        val names = buildList {
            extraArtists.mapNotNull(::cleanArtist).forEach(::add)
            recentSongs.mapNotNull { cleanArtist(it.artist) }.forEach(::add)
            likedSongs.mapNotNull { cleanArtist(it.artist) }.forEach(::add)
            homeShelves.flatMap { it.items }.mapNotNull { cleanArtist(it.subtitle) }.forEach(::add)
        }
        return names.distinctBy { it.lowercase() }.take(16)
    }

    private fun cleanTrackKey(title: String, artist: String): String {
        val cleanTitle = TrackMatcher.searchableTitle(title, artist).lowercase(Locale.ROOT).trim()
        val cleanArtist = TrackMatcher.primaryArtist(artist).lowercase(Locale.ROOT).trim()
        return "$cleanTitle|$cleanArtist"
    }

    private fun cleanArtist(raw: String): String? {
        val candidate = raw
            .substringBefore("•")
            .substringBefore("·")
            .substringBefore(" & ")
            .substringBefore(",")
            .trim()
        return candidate.takeIf {
            it.isNotBlank() &&
                !it.equals("Unknown artist", ignoreCase = true) &&
                !it.contains("views", ignoreCase = true) &&
                !it.contains("subscribers", ignoreCase = true)
        }
    }

    private fun ShelfItem.toSong(): Song? {
        val vid = videoId?.takeIf { it.isNotBlank() } ?: return null
        return Song(
            videoId = vid,
            title = title,
            artist = subtitle.substringBefore("•").substringBefore("·").trim().ifBlank { subtitle },
            thumbnailUrl = thumbnailUrl,
            artistId = browseId,
            isVideo = isVideo,
        )
    }

    fun canonicalVideoThumbnail(videoId: String, existingUrl: String?): String {
        if (videoId.isBlank()) return existingUrl.orEmpty()
        val trimmed = existingUrl?.trim().orEmpty()
        if (trimmed.isNotBlank() &&
            (trimmed.contains("i.ytimg.com/vi/") || trimmed.contains("img.youtube.com/vi/")) &&
            !trimmed.endsWith("/default.jpg")
        ) {
            return trimmed
        }
        return "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
    }

    private fun toShelfVideoItem(
        item: ShelfItem,
        kind: VideoDiscoveryKind,
        label: String,
    ): VideoDiscoveryItem? {
        val vid = item.videoId?.takeIf { it.isNotBlank() } ?: return null
        val thumb = canonicalVideoThumbnail(vid, item.thumbnailUrl)
        val artist = item.subtitle.substringBefore("•").substringBefore("·").trim().ifBlank { item.subtitle }
        return VideoDiscoveryItem(
            id = "${kind.name.lowercase()}:$vid",
            videoId = vid,
            kind = kind,
            label = label,
            title = item.title,
            artist = artist,
            artistBrowseId = item.browseId?.takeIf { it.startsWith("UC") },
            thumbnailUrl = thumb,
            seedName = artist,
        )
    }

    private fun toItem(
        video: Song,
        kind: VideoDiscoveryKind,
        label: String,
        seedName: String,
        companionSong: Song?,
        rankTag: String,
    ): VideoDiscoveryItem? {
        val thumb = canonicalVideoThumbnail(video.videoId, video.thumbnailUrl)
        return VideoDiscoveryItem(
            id = "$rankTag:${video.videoId}",
            videoId = video.videoId,
            kind = kind,
            label = label,
            title = video.title,
            artist = video.artist,
            artistBrowseId = video.artistId,
            thumbnailUrl = thumb,
            seedName = seedName,
            durationText = video.durationText,
            correspondingSong = companionSong?.let(VideoDiscoverySongRef::fromSong),
        )
    }

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e)
    }
}
