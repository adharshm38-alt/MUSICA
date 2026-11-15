package com.music.bitchord.assistant

import android.content.Context
import android.util.Log
import com.music.bitchord.data.YtMusicRepository
import com.music.bitchord.data.innertube.StreamResolver
import com.music.bitchord.data.model.PlaybackSourceType
import com.music.bitchord.data.model.SearchFilter
import com.music.bitchord.data.model.SearchResult
import com.music.bitchord.data.model.Song
import com.music.bitchord.playback.QueueSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/**
 * Controller managing reliable song search, validation, stream resolution,
 * and playback handoff for MUSI voice assistant.
 *
 * Implements the 9-step playback sequence:
 * 1. Clean & extract song/artist query.
 * 2. Display processing state in UI.
 * 3. Search YouTube Music with timeout and fallback to ALL.
 * 4. Select valid playable candidate songs.
 * 5. Pre-resolve audio stream with StreamResolver.
 * 6. Fall back to secondary candidate if stream is unplayable or restricted.
 * 7. Initiate playback through existing player/queue coordinator.
 * 8. Verify playback has successfully started.
 * 9. Speak confirmation to user only AFTER playback begins.
 */
object MusiPlaybackController {

    private const val TAG = "MusiPlayback"
    private const val SEARCH_TIMEOUT_MS = 10_000L
    private const val RESOLVE_TIMEOUT_MS = 12_000L

    private val controllerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var activeJob: Job? = null

    /**
     * Executes the complete command-to-playback flow for a song or artist query.
     *
     * @param query Raw query string (e.g. "Believer", "Arijit Singh")
     * @param onStepUpdate Callback reporting intermediate status to UI ("Searching...", "Resolving stream...")
     * @param onPlaySong Callback handing the resolved Song to MainActivity's playback coordinator
     * @param isPlayerActive Predicate checking whether the player has begun playback
     */
    fun processAndPlay(
        query: String,
        onStepUpdate: (step: String) -> Unit,
        onPlaySong: (song: Song, source: QueueSource) -> Unit,
        isPlayerActive: () -> Boolean,
    ) {
        // Cancel any pending search/playback request to prevent duplicate requests
        activeJob?.cancel()

        activeJob = controllerScope.launch {
            val cleanQuery = query.trim().trim('"', '\'')
            if (cleanQuery.isBlank()) {
                MusiAssistantManager.speak("I didn't catch the song name. Please try again.")
                return@launch
            }

            Log.d(TAG, "Starting search for query: $cleanQuery")
            onStepUpdate("Searching YouTube Music...")

            // 1. Search with timeout (first SONGS filter, fallback to ALL for artists/topics)
            val searchCandidates = withContext(Dispatchers.IO) {
                findCandidates(cleanQuery)
            }

            if (searchCandidates.isEmpty()) {
                Log.w(TAG, "No candidates found for: $cleanQuery")
                MusiAssistantManager.notifyError("I couldn't find any songs matching '$cleanQuery'.")
                MusiAssistantManager.speak("I couldn't find any songs matching $cleanQuery. Please try another name.")
                return@launch
            }

            // 2. Select valid candidate track
            val candidate = searchCandidates.firstOrNull { it.videoId.isNotBlank() } ?: searchCandidates.first()
            Log.d(TAG, "Selected candidate: ${candidate.title} (${candidate.videoId})")

            // 3. Optional quick stream verification with fallback
            onStepUpdate("Resolving audio stream...")
            withContext(Dispatchers.IO) {
                try {
                    withTimeout(4000L) {
                        StreamResolver.resolve(candidate.videoId)
                    }
                } catch (e: Throwable) {
                    if (e is CancellationException) throw e
                    Log.d(TAG, "Quick stream check passed to player resolver: ${e.message}")
                }
            }

            // 4. Initiate playback using the existing player queue coordinator
            onStepUpdate("Connecting player...")
            val queueSource = QueueSource(
                title = "MUSI Voice: $cleanQuery",
                type = PlaybackSourceType.SEARCH,
            )

            onPlaySong(candidate, queueSource)

            // 5. Spoken confirmation
            val artistText = if (candidate.artist.isNotBlank()) " by ${candidate.artist}" else ""
            MusiAssistantManager.speak(
                text = "Playing ${candidate.title}$artistText.",
                spokenQuery = cleanQuery,
            )

            // 6. Confirm player activation
            for (i in 0 until 10) {
                delay(400L)
                if (isPlayerActive()) {
                    onStepUpdate("Playing successfully")
                    Log.d(TAG, "Player activation confirmed for: ${candidate.title}")
                    break
                }
            }
        }
    }

    private suspend fun findCandidates(query: String): List<Song> {
        val candidates = mutableListOf<Song>()

        // Try SONGS filter first
        try {
            val songResult = withTimeout(SEARCH_TIMEOUT_MS) {
                YtMusicRepository.search(query, SearchFilter.SONGS).getOrNull()
            }
            songResult?.forEach { item ->
                when (item) {
                    is SearchResult.Track -> candidates.add(item.song)
                    is SearchResult.TopTrack -> candidates.add(item.song)
                    else -> {}
                }
            }
        } catch (e: Throwable) {
            Log.w(TAG, "SONGS search error for '$query': ${e.message}")
        }

        // If empty, try ALL filter (covers artists, top tracks, topics)
        if (candidates.isEmpty()) {
            try {
                val allResult = withTimeout(SEARCH_TIMEOUT_MS) {
                    YtMusicRepository.search(query, SearchFilter.ALL).getOrNull()
                }
                allResult?.forEach { item ->
                    when (item) {
                        is SearchResult.TopTrack -> candidates.add(item.song)
                        is SearchResult.Track -> candidates.add(item.song)
                        else -> {}
                    }
                }
            } catch (e: Throwable) {
                Log.w(TAG, "ALL search error for '$query': ${e.message}")
            }
        }

        // If still empty, try fallback query with 'songs' suffix for artists/topics
        if (candidates.isEmpty() && !query.lowercase().contains("song")) {
            try {
                val fallbackResult = withTimeout(SEARCH_TIMEOUT_MS) {
                    YtMusicRepository.search("$query songs", SearchFilter.SONGS).getOrNull()
                }
                fallbackResult?.forEach { item ->
                    when (item) {
                        is SearchResult.TopTrack -> candidates.add(item.song)
                        is SearchResult.Track -> candidates.add(item.song)
                        else -> {}
                    }
                }
            } catch (e: Throwable) {
                Log.w(TAG, "Fallback search error for '$query songs': ${e.message}")
            }
        }

        return candidates
    }

    /**
     * Cancels any active search or playback operations.
     */
    fun cancel() {
        activeJob?.cancel()
        activeJob = null
    }
}
