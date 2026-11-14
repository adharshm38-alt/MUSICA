package com.music.bitchord.data

import com.music.bitchord.data.SongInfoParser.find
import com.music.bitchord.data.SongInfoParser.obj
import com.music.bitchord.data.SongInfoParser.str
import com.music.bitchord.data.SongInfoParser.text
import com.music.bitchord.data.model.Song
import com.music.bitchord.data.model.VideoDiscoveryItem
import com.music.bitchord.data.model.VideoDiscoverySongRef
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import org.jsoup.Jsoup
import java.util.concurrent.ConcurrentHashMap

internal data class WatchCreatorMetadata(
    val channelId: String? = null,
    val creatorName: String? = null,
    val avatarUrl: String? = null,
    val subscriberCountText: String? = null,
    val subscribed: Boolean? = null,
    val hashtags: List<String> = emptyList(),
    val durationSeconds: Int? = null,
)

/**
 * Fetches real creator metadata, real `#hashtags`, and the official corresponding
 * catalogue song for a discovered music video on demand. Never fabricates metadata.
 */
object VideoDiscoveryMetadata {
    private val cache = ConcurrentHashMap<String, VideoDiscoveryItem>()
    private val videoIdPattern = Regex("[A-Za-z0-9_-]{11}")
    private val hashtagRegex = Regex("""(?<!\w)(#[A-Za-z0-9_]{2,40})""")

    suspend fun enrich(item: VideoDiscoveryItem): VideoDiscoveryItem {
        cache[item.videoId]?.let { cached ->
            if (cached.metadataLoaded) {
                return item.copy(
                    artist = cached.artist.ifBlank { item.artist },
                    artistBrowseId = cached.artistBrowseId ?: item.artistBrowseId,
                    creatorAvatarUrl = cached.creatorAvatarUrl ?: item.creatorAvatarUrl,
                    subscriberCountText = cached.subscriberCountText ?: item.subscriberCountText,
                    subscribed = cached.subscribed ?: item.subscribed,
                    hashtags = if (cached.hashtags.isNotEmpty()) cached.hashtags else item.hashtags,
                    durationSeconds = cached.durationSeconds ?: item.durationSeconds,
                    correspondingSong = cached.correspondingSong ?: item.correspondingSong,
                    musicArtworkUrl = cached.musicArtworkUrl ?: item.musicArtworkUrl,
                    metadataLoaded = true,
                )
            }
        }
        return withContext(Dispatchers.IO) {
            if (!videoIdPattern.matches(item.videoId)) {
                return@withContext item.copy(metadataLoaded = true)
            }
            coroutineScope {
                val watchDeferred = async {
                    attempt {
                        parseWatchHtml(SongInfoRepository.fetchWatchHtml(item.videoId), item.videoId)
                    }.getOrNull()
                }
                val trackDeferred = async {
                    attempt {
                        val videoSong = item.asVideoSong()
                        val audio = YtMusicRepository.resolveAudio(videoSong)
                        if (audio.videoId != videoSong.videoId) {
                            audio
                        } else {
                            YtMusicRepository.trackLinks(item.videoId).getOrNull() ?: audio
                        }
                    }.getOrNull()
                }
                val watch = watchDeferred.await()
                val resolvedSong = trackDeferred.await()

                val resolvedArtist = watch?.creatorName?.takeIf { it.isNotBlank() }
                    ?: resolvedSong?.artist?.takeIf { it.isNotBlank() }
                    ?: item.artist

                val officialArt = attempt {
                    MusicArtworkResolver.resolveArtwork(
                        title = resolvedSong?.title ?: item.title,
                        artist = resolvedArtist,
                        album = resolvedSong?.albumName,
                        existingThumbnail = resolvedSong?.thumbnailUrl?.takeIf { !MusicArtworkResolver.isVideoThumbnail(it) },
                    )
                }.getOrNull()

                val artistBrowseId = resolvedSong?.artistId
                    ?: item.artistBrowseId
                    ?: watch?.channelId

                // If channel/artist browseId exists and we still lack avatar or subscription state,
                // query YtMusicRepository.artistPage once for authoritative YTM artist header data.
                val artistPage = if (artistBrowseId != null &&
                    (watch?.avatarUrl == null || watch.subscribed == null)
                ) {
                    attempt { YtMusicRepository.artistPage(artistBrowseId).getOrNull() }.getOrNull()
                } else {
                    null
                }

                val enriched = item.copy(
                    artist = watch?.creatorName?.takeIf { it.isNotBlank() }
                        ?: artistPage?.name?.takeIf { it.isNotBlank() }
                        ?: item.artist,
                    artistBrowseId = artistPage?.subscription?.channelId ?: artistBrowseId,
                    creatorAvatarUrl = watch?.avatarUrl ?: artistPage?.thumbnailUrl ?: item.creatorAvatarUrl,
                    subscriberCountText = watch?.subscriberCountText
                        ?: artistPage?.subscriberCountText
                        ?: item.subscriberCountText,
                    subscribed = artistPage?.subscription?.subscribed ?: watch?.subscribed ?: item.subscribed,
                    hashtags = watch?.hashtags?.takeIf { it.isNotEmpty() } ?: item.hashtags,
                    durationSeconds = watch?.durationSeconds ?: item.durationSeconds,
                    correspondingSong = resolvedSong?.let(VideoDiscoverySongRef::fromSong)
                        ?: item.correspondingSong
                        ?: VideoDiscoverySongRef.fromSong(item.asVideoSong()),
                    musicArtworkUrl = officialArt ?: item.musicArtworkUrl,
                    metadataLoaded = true,
                )
                cache[item.videoId] = enriched
                enriched
            }
        }
    }

    fun updateSubscriptionCache(videoId: String, subscribed: Boolean) {
        cache[videoId]?.let { existing ->
            cache[videoId] = existing.copy(subscribed = subscribed)
        }
    }

    internal fun clearCache() {
        cache.clear()
    }

    internal fun parseWatchHtml(html: String, videoId: String): WatchCreatorMetadata? {
        val scripts = Jsoup.parse(html).select("script").map { it.data() }
        val player = scripts.firstNotNullOfOrNull { SongInfoParser.extract(it, "ytInitialPlayerResponse") }
            ?: return null
        val details = player.obj("videoDetails")
        if (details.str("videoId") != videoId) return null

        val data = scripts.firstNotNullOfOrNull { SongInfoParser.extract(it, "ytInitialData") }
        val owner = data?.find("videoOwnerRenderer")?.firstOrNull()
        val ownerTitle = owner?.get("title") as? JsonObject
        val ownerTitleText = ownerTitle?.text()
        val ownerNavBrowseId = (ownerTitle?.get("runs") as? JsonArray)
            ?.firstOrNull()
            ?.let { it as? JsonObject }
            ?.obj("navigationEndpoint")
            ?.obj("browseEndpoint")
            ?.str("browseId")
            ?: (owner?.get("navigationEndpoint") as? JsonObject)
                ?.obj("browseEndpoint")
                ?.str("browseId")

        val avatarUrl = ((owner?.get("thumbnail") as? JsonObject)?.get("thumbnails") as? JsonArray)
            ?.mapNotNull { it as? JsonObject }
            ?.maxByOrNull { (it["width"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 0 }
            ?.str("url")
            ?.takeIf { it.startsWith("http") }

        val subscribeRenderer = owner
            ?.find("subscribeButtonRenderer")
            ?.firstOrNull()
            ?: data?.find("subscribeButtonRenderer")?.firstOrNull()
        val subChannelId = subscribeRenderer?.str("channelId")
        val subscribed = (subscribeRenderer?.get("subscribed") as? JsonPrimitive)?.booleanOrNull

        val subscriberText = owner?.get("subscriberCountText")?.text()

        val superTitleTags = data?.find("videoPrimaryInfoRenderer")
            ?.firstOrNull()
            ?.let { it["superTitleLink"] as? JsonObject }
            ?.let { it["runs"] as? JsonArray }
            ?.mapNotNull { run ->
                (run as? JsonObject)?.str("text")?.trim()?.takeIf {
                    it.startsWith("#") && it.length in 3..42 && !it.drop(1).all(Char::isDigit)
                }
            }.orEmpty()

        val descTags = details.str("shortDescription")
            ?.let { desc ->
                hashtagRegex.findAll(desc)
                    .map { it.groupValues[1] }
                    .filter { tag -> !tag.drop(1).all(Char::isDigit) }
                    .toList()
            }.orEmpty()

        val dedupedTags = LinkedHashMap<String, String>()
        (superTitleTags + descTags).forEach { tag ->
            dedupedTags.putIfAbsent(tag.lowercase(), tag)
        }

        val lengthSeconds = details.str("lengthSeconds")?.toIntOrNull()?.takeIf { it > 0 }

        return WatchCreatorMetadata(
            channelId = ownerNavBrowseId ?: subChannelId ?: details.str("channelId"),
            creatorName = ownerTitleText ?: details.str("author"),
            avatarUrl = avatarUrl,
            subscriberCountText = subscriberText,
            subscribed = subscribed,
            hashtags = dedupedTags.values.take(5),
            durationSeconds = lengthSeconds,
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
