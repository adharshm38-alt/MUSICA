package com.music.bitchord.assistant

/**
 * Commands recognized by MUSI Voice Assistant.
 */
sealed interface MusiCommand {
    /** Play or start music. */
    object Play : MusiCommand

    /** Pause currently playing music. */
    object Pause : MusiCommand

    /** Resume paused music. */
    object Resume : MusiCommand

    /** Skip to the next track. */
    object Next : MusiCommand

    /** Skip back to the previous track. */
    object Previous : MusiCommand

    /** Stop music playback. */
    object Stop : MusiCommand

    /** Play user's liked / favourite songs. */
    object PlayFavorites : MusiCommand

    /** Play a specific playlist by name. */
    data class PlayPlaylist(val name: String) : MusiCommand

    /** Search for a song or artist and play it. */
    data class PlaySongOrArtist(val query: String) : MusiCommand

    /** Search for a song. */
    data class Search(val query: String) : MusiCommand

    /** Friendly greeting ("Hello", "Who are you"). */
    object Greeting : MusiCommand

    /** Unrecognized speech input. */
    data class Unknown(val rawText: String) : MusiCommand
}
