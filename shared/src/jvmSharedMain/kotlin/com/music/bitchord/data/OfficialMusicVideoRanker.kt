package com.music.bitchord.data

import com.music.bitchord.data.model.Song
import com.music.bitchord.data.sources.TrackMatcher
import java.util.Locale

/**
 * Intelligent ranking and verification for original official music videos.
 *
 * Requirements:
 * - Prioritize official artist channels, record label channels (Sony Music, T-Series,
 *   Saregama, Zee Music, VEVO, Universal, Warner, YRF, Aditya Music, Think Music, etc.).
 * - Require exact song title match and matching artist/credits.
 * - Heavily penalize and reject movie scenes, random comedy/fight clips, fan-made edits,
 *   reaction videos, dance covers, and status clips.
 * - Prefer original music videos over unofficial reuploads.
 * - Support independent artists, singles, album tracks, and international releases as well as film songs.
 */
object OfficialMusicVideoRanker {

    private val OFFICIAL_LABEL_KEYWORDS = listOf(
        "vevo",
        "t-series",
        "tseries",
        "sony music",
        "sonymusic",
        "zee music",
        "zeemusic",
        "saregama",
        "yrf",
        "aditya music",
        "lahari music",
        "think music",
        "star music",
        "muzik247",
        "warner",
        "universal music",
        "atlantic records",
        "columbia records",
        "interscope",
        "republic records",
        "rca records",
        "spinnin",
        "eros now",
        "speed records",
        "white hill",
        "geet mp3",
        "divo",
        "records",
        "official",
        "music",
        "audio",
        "channel",
    )

    private val UNWANTED_TITLE_PATTERNS = listOf(
        Regex("""(?i)\b(scene|scenes|movie\s*clip|clips|comedy|fight|dialogue)\b"""),
        Regex("""(?i)\b(reaction|reacting|review)\b"""),
        Regex("""(?i)\b(whatsapp\s*status|status\s*video|shorts?|reels?)\b"""),
        Regex("""(?i)\b(fan\s*made|fanmade|tribute)\b"""),
        Regex("""(?i)\b(dance\s*(cover|performance)|guitar\s*cover|piano\s*cover)\b"""),
        Regex("""(?i)\b(mashup|dj\s*remix|bass\s*boosted|slowed\s*(and|&)\s*reverb)\b"""),
    )

    /**
     * Scores a candidate music video against a target song.
     * Returns a negative score (< 0) if the video is an unwanted movie clip, fan edit, or unrelated video.
     */
    fun score(candidate: Song, target: TrackMatcher.Target): Int {
        val titleLower = candidate.title.lowercase(Locale.ROOT)
        val channelLower = candidate.artist.lowercase(Locale.ROOT)

        // 1. Hard veto for movie clips, comedy scenes, reaction videos, status videos
        for (pattern in UNWANTED_TITLE_PATTERNS) {
            if (pattern.containsMatchIn(titleLower)) return -10_000
        }

        var score = 0

        // 2. Official Channel / Label verification (+1000)
        val isOfficialLabel = OFFICIAL_LABEL_KEYWORDS.any { channelLower.contains(it) }
        val primaryWantedArtist = TrackMatcher.primaryArtist(target.artist).lowercase(Locale.ROOT)
        val matchesArtistChannel = primaryWantedArtist.isNotBlank() && (
            channelLower.contains(primaryWantedArtist) || primaryWantedArtist.contains(channelLower)
        )
        if (isOfficialLabel || matchesArtistChannel) {
            score += 1000
        }

        // 3. Official Music Video markers in title (+500)
        if (titleLower.contains("official music video") || titleLower.contains("official video")) {
            score += 600
        } else if (titleLower.contains("video song") || titleLower.contains("music video")) {
            score += 350
        }

        // 4. Prefer original video over lyric video (official video > lyric video)
        if (titleLower.contains("lyric") || titleLower.contains("lyrics")) {
            score -= 100
        }

        // 5. Title match confidence using TrackMatcher core
        val wanted = TrackMatcher.searchableTitle(target.title, target.artist).lowercase(Locale.ROOT)
        val got = TrackMatcher.searchableTitle(candidate.title, candidate.artist).lowercase(Locale.ROOT)
        if (wanted.isNotBlank() && got.isNotBlank()) {
            if (wanted == got) {
                score += 500
            } else if (got.contains(wanted) || wanted.contains(got)) {
                score += 250
            } else {
                score -= 300
            }
        }

        // 6. Shared artist credit (+250)
        if (target.artist.isNotBlank() && TrackMatcher.sharesArtist(target.artist, candidate.artist)) {
            score += 250
        }

        return score
    }

    /**
     * Picks the best candidate that qualifies as an official music video.
     */
    fun best(candidates: List<Song>, target: TrackMatcher.Target): Song? {
        val scored = candidates.map { it to score(it, target) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
        return scored.firstOrNull()?.first
    }
}
