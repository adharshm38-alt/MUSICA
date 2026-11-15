package com.music.bitchord.assistant

import java.util.Locale

/**
 * Lightweight, robust natural language command interpreter for MUSI.
 * Handles both wake-word prefixed commands ("MUSI, play music") and
 * direct commands spoken after tapping the microphone button.
 */
object MusiCommandParser {

    fun parse(rawInput: String?): MusiCommand {
        if (rawInput.isNullOrBlank()) {
            return MusiCommand.Unknown("")
        }

        // Clean input: lowercase, trim, remove common trailing/leading punctuation
        var text = rawInput.trim().lowercase(Locale.ROOT)
            .replace(Regex("[,.!?]+$"), "")
            .replace(Regex("^[,.!?]+"), "")
            .trim()

        // Strip wake words / prefixes:
        // "musi, ...", "hey musi, ...", "ok musi, ...", "okay musi, ..."
        val prefixes = listOf("hey musi", "ok musi", "okay musi", "hi musi", "musi")
        for (prefix in prefixes) {
            if (text == prefix) {
                return MusiCommand.Greeting
            }
            if (text.startsWith("$prefix ")) {
                text = text.removePrefix("$prefix ").trim()
                break
            } else if (text.startsWith("$prefix, ")) {
                text = text.removePrefix("$prefix, ").trim()
                break
            }
        }

        // Clean any punctuation left after prefix removal
        text = text.trim(',', ' ', '.', '!', '?')

        if (text.isBlank() || text in listOf("hello", "hi", "hey", "who are you", "what can you do")) {
            return MusiCommand.Greeting
        }

        // 1. Playback Controls
        // Play / Resume
        if (text in listOf("play music", "play the music", "start music", "play song", "play songs")) {
            return MusiCommand.Play
        }
        if (text in listOf("resume", "resume music", "continue", "continue music")) {
            return MusiCommand.Resume
        }
        if (text == "play") {
            return MusiCommand.Play
        }

        // Pause
        if (text in listOf("pause", "pause music", "pause the music", "pause song", "pause playback", "hold")) {
            return MusiCommand.Pause
        }

        // Next
        if (text in listOf("next song", "next track", "next", "skip", "skip song", "skip track", "play next", "play next song")) {
            return MusiCommand.Next
        }

        // Previous
        if (text in listOf("previous song", "previous track", "previous", "prev song", "prev", "back", "go back", "last song")) {
            return MusiCommand.Previous
        }

        // Stop
        if (text in listOf("stop music", "stop the music", "stop song", "stop playback", "stop")) {
            return MusiCommand.Stop
        }

        // 2. Library & Playlists
        // Play favourites / liked songs
        val favRegex = Regex("^(play\\s+(my\\s+)?(favourites|favorites|liked|liked\\s+songs|favourite\\s+songs|favorite\\s+songs))$")
        if (favRegex.matches(text)) {
            return MusiCommand.PlayFavorites
        }

        // Play playlist [name]
        val playlistPrefixes = listOf(
            "play my playlist ",
            "play playlist ",
            "play the playlist ",
            "start my playlist ",
            "start playlist ",
        )
        for (pPrefix in playlistPrefixes) {
            if (text.startsWith(pPrefix)) {
                val name = text.removePrefix(pPrefix).trim().trim('"', '\'')
                if (name.isNotBlank()) {
                    return MusiCommand.PlayPlaylist(name)
                }
            }
        }

        // 3. Search for [song / artist]
        val searchPrefixes = listOf("search for ", "search for song ", "search song ", "search ")
        for (sPrefix in searchPrefixes) {
            if (text.startsWith(sPrefix)) {
                val query = text.removePrefix(sPrefix).trim().trim('"', '\'')
                if (query.isNotBlank()) {
                    return MusiCommand.Search(query)
                }
            }
        }

        // 4. Play [song / artist]
        if (text.startsWith("play ")) {
            val query = text.removePrefix("play ").trim().trim('"', '\'')
            if (query.isNotBlank()) {
                if (query in listOf("my favourites", "my favorites", "favourites", "favorites", "liked songs", "liked")) {
                    return MusiCommand.PlayFavorites
                }
                return MusiCommand.PlaySongOrArtist(query)
            }
        }

        return MusiCommand.Unknown(text)
    }
}
