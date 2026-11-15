package com.music.bitchord.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MusiCommandParserTest {

    @Test
    fun testPlaybackCommands() {
        assertEquals(MusiCommand.Play, MusiCommandParser.parse("MUSI, play music."))
        assertEquals(MusiCommand.Play, MusiCommandParser.parse("play music"))
        assertEquals(MusiCommand.Play, MusiCommandParser.parse("play"))

        assertEquals(MusiCommand.Pause, MusiCommandParser.parse("MUSI, pause."))
        assertEquals(MusiCommand.Pause, MusiCommandParser.parse("pause"))

        assertEquals(MusiCommand.Resume, MusiCommandParser.parse("MUSI, resume."))
        assertEquals(MusiCommand.Resume, MusiCommandParser.parse("resume"))

        assertEquals(MusiCommand.Next, MusiCommandParser.parse("MUSI, next song."))
        assertEquals(MusiCommand.Next, MusiCommandParser.parse("next"))
        assertEquals(MusiCommand.Next, MusiCommandParser.parse("skip"))

        assertEquals(MusiCommand.Previous, MusiCommandParser.parse("MUSI, previous song."))
        assertEquals(MusiCommand.Previous, MusiCommandParser.parse("previous"))
        assertEquals(MusiCommand.Previous, MusiCommandParser.parse("back"))

        assertEquals(MusiCommand.Stop, MusiCommandParser.parse("MUSI, stop music."))
        assertEquals(MusiCommand.Stop, MusiCommandParser.parse("stop"))
    }

    @Test
    fun testSearchAndPlayCommands() {
        assertEquals(
            MusiCommand.PlaySongOrArtist("bohemian rhapsody"),
            MusiCommandParser.parse("MUSI, play bohemian rhapsody."),
        )
        assertEquals(
            MusiCommand.PlaySongOrArtist("the weeknd"),
            MusiCommandParser.parse("play the weeknd"),
        )
        assertEquals(
            MusiCommand.Search("starboy"),
            MusiCommandParser.parse("MUSI, search for starboy."),
        )
        assertEquals(
            MusiCommand.Search("shape of you"),
            MusiCommandParser.parse("search for shape of you"),
        )
    }

    @Test
    fun testLibraryAndPlaylistCommands() {
        assertEquals(
            MusiCommand.PlayFavorites,
            MusiCommandParser.parse("MUSI, play my favourites."),
        )
        assertEquals(
            MusiCommand.PlayFavorites,
            MusiCommandParser.parse("play my favorites"),
        )
        assertEquals(
            MusiCommand.PlayFavorites,
            MusiCommandParser.parse("play liked songs"),
        )
        assertEquals(
            MusiCommand.PlayPlaylist("workout hits"),
            MusiCommandParser.parse("MUSI, play my playlist workout hits."),
        )
        assertEquals(
            MusiCommand.PlayPlaylist("chill vibes"),
            MusiCommandParser.parse("play playlist chill vibes"),
        )
    }

    @Test
    fun testPhase2Examples() {
        assertEquals(
            MusiCommand.PlaySongOrArtist("believer"),
            MusiCommandParser.parse("Hey MUSI, play Believer.")
        )
        assertEquals(
            MusiCommand.PlaySongOrArtist("arijit singh"),
            MusiCommandParser.parse("Hey MUSI, play Arijit Singh.")
        )
        assertEquals(
            MusiCommand.Pause,
            MusiCommandParser.parse("Hey MUSI, pause.")
        )
        assertEquals(
            MusiCommand.Next,
            MusiCommandParser.parse("Hey MUSI, next song.")
        )
        assertEquals(
            MusiCommand.PlayFavorites,
            MusiCommandParser.parse("Hey MUSI, play my favourites.")
        )
        assertEquals(
            MusiCommand.Search("malayalam songs"),
            MusiCommandParser.parse("Hey MUSI, search for Malayalam songs.")
        )
    }
}
