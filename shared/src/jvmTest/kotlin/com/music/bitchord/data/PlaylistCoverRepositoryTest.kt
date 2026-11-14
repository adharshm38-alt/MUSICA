package com.music.bitchord.data

import java.io.File
import java.net.URI
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlaylistCoverRepositoryTest {

    private lateinit var tempRoot: File

    @BeforeTest
    fun setUp() {
        tempRoot = Files.createTempDirectory("playlist-cover-test").toFile()
    }

    @AfterTest
    fun tearDown() {
        tempRoot.deleteRecursively()
    }

    @Test
    fun systemAndNonPlaylistBrowseIdsAreRejectedWhileUserPlaylistsAllowed() {
        val disallowed = listOf(
            null,
            "",
            "   ",
            "LM",
            "VLLM",
            "FEmusic_liked_videos",
            "FEmusic_liked_playlists",
            "SE",
            "VLSE",
            "SS",
            "local:downloads",
            "local:all",
            "local:cache",
            "local:webdav",
            "local:smb",
            "local:offline:liked",
            "local:spotify",
            "local:album:abc",
            "local:artist:xyz",
            "UC1234567890",
            "MPREb_album123",
            "OLAK5uy_album123",
        )
        for (id in disallowed) {
            assertFalse(PlaylistCoverRepository.isCustomizablePlaylistId(id), "Expected $id disallowed")
        }

        val allowed = listOf(
            "VLPLuser123",
            "PLuser123",
            "local:offline:p1234",
            "local:playlist:sp_local_999",
        )
        for (id in allowed) {
            assertTrue(PlaylistCoverRepository.isCustomizablePlaylistId(id), "Expected $id allowed")
        }
    }

    @Test
    fun setCoverCreatesManagedCopyNormalizesKeyAndDeletesSupersededFile() {
        val coversDir = File(tempRoot, "playlist_covers")
        var storedJson: String? = null
        val repo = PlaylistCoverRepository(
            coversDir = coversDir,
            readMapJson = { storedJson },
            writeMapJson = { storedJson = it },
        )

        val firstUri = repo.setCover("VLPLtest123") { out ->
            out.writeBytes(byteArrayOf(1, 2, 3, 4))
            true
        }
        assertNotNull(firstUri)
        val firstFile = File(URI.create(firstUri).path)
        assertTrue(firstFile.exists())
        assertEquals(coversDir.canonicalFile, firstFile.parentFile?.canonicalFile)
        assertEquals(firstUri, repo.getCover("VLPLtest123"))
        assertEquals(firstUri, repo.getCover("PLtest123"))
        assertEquals(firstUri, repo.covers.value.customPlaylistCoverOf("VLPLtest123"))

        val secondUri = repo.setCover("VLPLtest123") { out ->
            out.writeBytes(byteArrayOf(5, 6, 7, 8, 9))
            true
        }
        assertNotNull(secondUri)
        assertNotEquals(firstUri, secondUri)
        val secondFile = File(URI.create(secondUri).path)
        assertTrue(secondFile.exists())
        assertFalse(firstFile.exists(), "Old cover file should be removed cleanly")
        assertEquals(secondUri, repo.getCover("PLtest123"))
    }

    @Test
    fun customCoversPersistAcrossRestartsAndPruneMissingFiles() {
        val coversDir = File(tempRoot, "playlist_covers")
        var storedJson: String? = null
        val repo1 = PlaylistCoverRepository(
            coversDir = coversDir,
            readMapJson = { storedJson },
            writeMapJson = { storedJson = it },
        )

        val uriA = repo1.setCover("VLPLalpha") { it.writeBytes(byteArrayOf(10, 20)); true }!!
        val uriB = repo1.setCover("local:offline:p42") { it.writeBytes(byteArrayOf(30, 40)); true }!!

        val repo2 = PlaylistCoverRepository(
            coversDir = coversDir,
            readMapJson = { storedJson },
            writeMapJson = { storedJson = it },
        )
        assertEquals(uriA, repo2.getCover("VLPLalpha"))
        assertEquals(uriB, repo2.getCover("local:offline:p42"))

        assertTrue(File(URI.create(uriA).path).delete())
        val repo3 = PlaylistCoverRepository(
            coversDir = coversDir,
            readMapJson = { storedJson },
            writeMapJson = { storedJson = it },
        )
        assertNull(repo3.getCover("VLPLalpha"))
        assertEquals(uriB, repo3.getCover("local:offline:p42"))
    }

    @Test
    fun resetCoverDeletesOnlyTargetPlaylistCoverAndPreservesOthers() {
        val coversDir = File(tempRoot, "playlist_covers")
        var storedJson: String? = null
        val repo = PlaylistCoverRepository(
            coversDir = coversDir,
            readMapJson = { storedJson },
            writeMapJson = { storedJson = it },
        )

        val uriA = repo.setCover("local:playlist:sp_local_1") { it.writeBytes(byteArrayOf(1)); true }!!
        val uriB = repo.setCover("local:playlist:sp_local_2") { it.writeBytes(byteArrayOf(2)); true }!!

        assertTrue(repo.resetCover("local:playlist:sp_local_1"))
        assertFalse(repo.resetCover("local:playlist:sp_local_1"))
        assertNull(repo.getCover("local:playlist:sp_local_1"))
        assertFalse(File(URI.create(uriA).path).exists())
        assertEquals(uriB, repo.getCover("local:playlist:sp_local_2"))
        assertTrue(File(URI.create(uriB).path).exists())
    }

    @Test
    fun failedWriteLeavesExistingCoverUntouchedAndCleansTempFiles() {
        val coversDir = File(tempRoot, "playlist_covers")
        var storedJson: String? = null
        val repo = PlaylistCoverRepository(
            coversDir = coversDir,
            readMapJson = { storedJson },
            writeMapJson = { storedJson = it },
        )

        val existingUri = repo.setCover("PLkeepme") { it.writeBytes(byteArrayOf(7, 8, 9)); true }!!
        val failed = repo.setCover("PLkeepme") { out ->
            out.writeBytes(byteArrayOf(0))
            false
        }
        assertNull(failed)
        assertEquals(existingUri, repo.getCover("PLkeepme"))
        assertTrue(File(URI.create(existingUri).path).exists())
        assertEquals(1, coversDir.listFiles()?.size ?: 0)
    }
}
