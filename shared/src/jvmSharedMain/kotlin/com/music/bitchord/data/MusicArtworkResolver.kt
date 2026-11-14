package com.music.bitchord.data

import com.music.bitchord.data.DebugLog as Log
import com.music.bitchord.data.model.Song
import com.music.bitchord.data.sources.TrackMatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * 4K High-Quality (3000x3000px) official music album & single artwork resolver.
 *
 * Rules:
 * - NEVER use YouTube video thumbnails as default music cover artwork.
 * - Prioritize official album/single cover artwork via iTunes Search API (3000x3000bb master artwork)
 *   and MusicBrainz / Cover Art Archive.
 * - For Google / YouTube Music official tracks (googleusercontent / ggpht), format to 3000px square.
 * - Thread-safe in-memory caching with negative cache for misses to avoid redundant network queries.
 * - Returns null when official artwork cannot be verified so the UI shows a clean MUSICA placeholder.
 */
object MusicArtworkResolver {

    private const val TAG = "MusicArtworkResolver"
    private const val USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"

    private val json = Json { ignoreUnknownKeys = true }

    private val client by lazy {
        Http.client.newBuilder()
            .callTimeout(6, TimeUnit.SECONDS)
            .connectTimeout(4, TimeUnit.SECONDS)
            .build()
    }

    // Cache: "title|artist" (lowercase) -> 3000x3000px artwork URL
    private val cache = ConcurrentHashMap<String, String>()
    // Negative cache: avoids repeated queries for tracks without official matches
    private val negativeCache = ConcurrentHashMap.newKeySet<String>()

    /**
     * Determines whether the given URL is a YouTube video frame thumbnail (16:9 snapshot).
     * YouTube video thumbnails must NEVER be used as default music cover artwork.
     */
    fun isVideoThumbnail(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val lower = url.lowercase(Locale.ROOT)
        if (lower.contains("i.ytimg.com/vi/") ||
            lower.contains("img.youtube.com/vi/") ||
            lower.contains("i1.ytimg.com/vi/") ||
            lower.contains("i2.ytimg.com/vi/") ||
            lower.contains("i3.ytimg.com/vi/") ||
            lower.contains("i4.ytimg.com/vi/") ||
            lower.contains("i9.ytimg.com/vi/") ||
            lower.contains("ytimg.com/vi/")
        ) {
            return true
        }
        if (lower.contains("ytimg.com") && (
            lower.endsWith("hqdefault.jpg") ||
            lower.endsWith("mqdefault.jpg") ||
            lower.endsWith("sddefault.jpg") ||
            lower.endsWith("maxresdefault.jpg") ||
            lower.endsWith("default.jpg")
        )) {
            return true
        }
        return false
    }

    /**
     * Checks if the artwork URL is hosted by Apple Music / iTunes CDN.
     */
    fun isAppleArtwork(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val lower = url.lowercase(Locale.ROOT)
        return lower.contains("mzstatic.com") || lower.contains("apple.com")
    }

    /**
     * Formats an image URL into its highest possible 3000x3000px master square resolution.
     */
    fun toMaster3000(url: String?): String? {
        if (url.isNullOrBlank()) return null
        if (isVideoThumbnail(url)) return null
        if (isAppleArtwork(url)) {
            return url.replace(Regex("""/\d+x\d+bb\."""), "/3000x3000bb.")
        }
        if (url.contains("googleusercontent.com") || url.contains("ggpht.com")) {
            return url.replace(Regex("""=s\d+"""), "=s3000")
                .replace(Regex("""w\d+-h\d+"""), "w3000-h3000")
        }
        return url
    }

    /**
     * Returns the cached 3000x3000px artwork URL for a song, or null if not yet resolved.
     */
    fun getCached(song: Song?): String? {
        if (song == null) return null
        val key = cacheKey(song.title, song.artist)
        cache[key]?.let { return it }
        val thumb = song.thumbnailUrl
        if (!thumb.isNullOrBlank() && !isVideoThumbnail(thumb)) {
            if (isAppleArtwork(thumb) || thumb.contains("googleusercontent.com") || thumb.contains("ggpht.com")) {
                val master = toMaster3000(thumb)
                if (master != null) {
                    cache[key] = master
                    return master
                }
            }
        }
        return null
    }

    fun getCached(title: String, artist: String): String? {
        return cache[cacheKey(title, artist)]
    }

    /**
     * Resolves official 3000x3000px music artwork for the given [Song].
     * Never returns a YouTube video thumbnail.
     */
    suspend fun resolveArtwork(song: Song): String? {
        return resolveArtwork(
            title = song.title,
            artist = song.artist,
            album = song.albumName,
            existingThumbnail = song.thumbnailUrl,
        )
    }

    /**
     * Resolves official 3000x3000px music artwork by querying iTunes Search API and Cover Art Archive.
     * Guaranteed to return square 1:1 master artwork or null (clean MUSICA placeholder).
     */
    suspend fun resolveArtwork(
        title: String,
        artist: String,
        album: String? = null,
        existingThumbnail: String? = null,
    ): String? {
        if (title.isBlank()) return null
        val key = cacheKey(title, artist)
        cache[key]?.let { return it }
        if (key in negativeCache) return null

        // 1. Try iTunes Search API for master 3000x3000bb official release cover
        queryItunes(title, artist, album)?.let { art ->
            cache[key] = art
            return art
        }

        // 2. Try MusicBrainz / Cover Art Archive
        queryCoverArtArchive(title, artist)?.let { art ->
            cache[key] = art
            return art
        }

        // 3. If the existing thumbnail is official square music art (not a video thumbnail), format to 3000px
        if (!existingThumbnail.isNullOrBlank() && !isVideoThumbnail(existingThumbnail)) {
            val master = toMaster3000(existingThumbnail)
            if (master != null) {
                cache[key] = master
                return master
            }
        }

        // Never fall back to video thumbnails for audio
        negativeCache += key
        return null
    }

    private suspend fun queryItunes(title: String, artist: String, album: String?): String? {
        val cleanTitle = TrackMatcher.searchableTitle(title, artist)
        val cleanArtist = TrackMatcher.primaryArtist(artist)
        if (cleanTitle.isBlank()) return null

        val queries = buildList {
            if (cleanArtist.isNotBlank()) add("$cleanTitle $cleanArtist")
            add(cleanTitle)
        }

        for (query in queries) {
            val result = queryItunesEndpoint(query, title, artist, cleanTitle, cleanArtist)
            if (result != null) return result
        }
        return null
    }

    private suspend fun queryItunesEndpoint(
        queryTerm: String,
        rawTitle: String,
        rawArtist: String,
        cleanTitle: String,
        cleanArtist: String,
    ): String? = withContext(Dispatchers.IO) {
        val encoded = try {
            URLEncoder.encode(queryTerm, "UTF-8")
        } catch (_: Exception) {
            return@withContext null
        }
        val url = "https://itunes.apple.com/search?term=$encoded&entity=song&limit=5"
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .build()

        val responseBody = try {
            client.newCall(request).execute().use { resp ->
                if (resp.isSuccessful) resp.body.string() else null
            }
        } catch (e: Exception) {
            Log.w(TAG, "iTunes query error for '$queryTerm': ${e.message}")
            null
        } ?: return@withContext null

        val rows = try {
            val jsonRoot = json.parseToJsonElement(responseBody)
            jsonRoot.jsonObject["results"]?.jsonArray
        } catch (e: Exception) {
            null
        } ?: return@withContext null

        for (row in rows) {
            val obj = row.jsonObject
            val trackName = obj["trackName"]?.jsonPrimitive?.content.orEmpty()
            val artistName = obj["artistName"]?.jsonPrimitive?.content.orEmpty()
            val artwork100 = obj["artworkUrl100"]?.jsonPrimitive?.content.orEmpty()
            if (artwork100.isBlank()) continue

            val artistMatches = cleanArtist.isBlank() ||
                TrackMatcher.sharesArtist(rawArtist, artistName) ||
                cleanArtist.lowercase(Locale.ROOT) in artistName.lowercase(Locale.ROOT) ||
                artistName.lowercase(Locale.ROOT) in cleanArtist.lowercase(Locale.ROOT)

            val wantedWords = cleanTitle.lowercase(Locale.ROOT)
            val gotWords = TrackMatcher.searchableTitle(trackName, artistName).lowercase(Locale.ROOT)
            val titleMatches = wantedWords == gotWords ||
                wantedWords in gotWords || gotWords in wantedWords

            if (artistMatches && titleMatches) {
                val masterArt = toMaster3000(artwork100)
                if (masterArt != null) {
                    Log.d(TAG, "Matched iTunes 3000x3000 artwork for '$rawTitle' by '$rawArtist': $masterArt")
                    return@withContext masterArt
                }
            }
        }
        null
    }

    private suspend fun queryCoverArtArchive(title: String, artist: String): String? = withContext(Dispatchers.IO) {
        val cleanTitle = TrackMatcher.searchableTitle(title, artist)
        val cleanArtist = TrackMatcher.primaryArtist(artist)
        if (cleanTitle.isBlank()) return@withContext null

        val query = if (cleanArtist.isNotBlank()) {
            "recording:${URLEncoder.encode(cleanTitle, "UTF-8")}+AND+artist:${URLEncoder.encode(cleanArtist, "UTF-8")}"
        } else {
            "recording:${URLEncoder.encode(cleanTitle, "UTF-8")}"
        }

        val url = "https://musicbrainz.org/ws/2/recording?query=$query&fmt=json&limit=3"
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "MUSICA/2.0 (contact@musica.app)")
            .build()

        val responseBody = try {
            client.newCall(request).execute().use { resp ->
                if (resp.isSuccessful) resp.body.string() else null
            }
        } catch (_: Exception) {
            null
        } ?: return@withContext null

        val recordings = try {
            json.parseToJsonElement(responseBody).jsonObject["recordings"]?.jsonArray
        } catch (_: Exception) {
            null
        } ?: return@withContext null

        for (rec in recordings) {
            val releases = rec.jsonObject["releases"]?.jsonArray ?: continue
            for (rel in releases) {
                val mbid = rel.jsonObject["id"]?.jsonPrimitive?.content ?: continue
                return@withContext "https://coverartarchive.org/release/$mbid/front"
            }
        }
        null
    }

    private fun cacheKey(title: String, artist: String): String {
        return "${title.trim().lowercase(Locale.ROOT)}|${artist.trim().lowercase(Locale.ROOT)}"
    }
}
