package com.music.bitchord.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicLong

/**
 * Pure-JVM persistence and file-lifecycle core for custom playlist covers.
 *
 * Manages canonical browseId mappings, writes images atomically to unique
 * cache-busting filenames, cleans up superseded files, and guards system
 * playlists and non-playlist entities from customization.
 */
class PlaylistCoverRepository(
    private val coversDir: File,
    private val readMapJson: () -> String?,
    private val writeMapJson: (String) -> Unit,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
    private val state: MutableStateFlow<Map<String, String>> = MutableStateFlow(emptyMap()),
) {
    private val lock = Any()
    private val sequence = AtomicLong(0L)
    val covers: StateFlow<Map<String, String>> = state.asStateFlow()

    init {
        reload()
    }

    fun reload() {
        synchronized(lock) {
            val raw = readMapJson()
            if (raw.isNullOrBlank()) {
                state.value = emptyMap()
                return
            }
            val loaded = linkedMapOf<String, String>()
            var changed = false
            runCatching {
                val parsed = Json.decodeFromString<Map<String, String>>(raw)
                for ((rawKey, rawValue) in parsed) {
                    val value = rawValue.trim()
                    val canonical = normalizePlaylistCoverKey(rawKey)
                    if (canonical != rawKey) changed = true
                    if (canonical.isNotEmpty() && isCustomizablePlaylistId(canonical) && fileExistsForUri(value)) {
                        loaded[canonical] = value
                    } else {
                        changed = true
                    }
                }
            }.onFailure {
                changed = true
            }
            state.value = loaded
            if (changed) persistLocked(loaded)
        }
    }

    fun getCover(browseId: String?): String? = state.value.customPlaylistCoverOf(browseId)

    /**
     * Writes a new cover image via [writeImageToFile] and atomically swaps it
     * in for [browseId], removing any superseded managed cover file.
     */
    fun setCover(browseId: String?, writeImageToFile: (File) -> Boolean): String? {
        if (!isCustomizablePlaylistId(browseId)) return null
        val key = normalizePlaylistCoverKey(browseId)
        if (key.isEmpty()) return null

        coversDir.mkdirs()
        val stamp = "${clockMs()}_${sequence.incrementAndGet()}"
        val destFile = File(coversDir, "cover_${hashKey(key)}_$stamp.jpg")
        val tempFile = File(coversDir, "tmp_${hashKey(key)}_$stamp.jpg")

        val wrote = runCatching { writeImageToFile(tempFile) }.getOrDefault(false)
        if (!wrote || !tempFile.exists() || tempFile.length() <= 0L) {
            tempFile.delete()
            return null
        }
        if (!tempFile.renameTo(destFile)) {
            val copied = runCatching {
                tempFile.copyTo(destFile, overwrite = true)
                true
            }.getOrDefault(false)
            tempFile.delete()
            if (!copied || !destFile.exists() || destFile.length() <= 0L) {
                destFile.delete()
                return null
            }
        }

        val newUri = toFileUri(destFile)
        var oldUri: String? = null
        synchronized(lock) {
            oldUri = state.value[key]
            val updated = state.value.toMutableMap().apply { put(key, newUri) }
            state.value = updated
            persistLocked(updated)
        }
        if (oldUri != null && oldUri != newUri) {
            deleteManagedFile(oldUri!!)
        }
        return newUri
    }

    /** Removes any custom cover for [browseId] and deletes its managed file. */
    fun resetCover(browseId: String?): Boolean {
        val key = normalizePlaylistCoverKey(browseId)
        if (key.isEmpty()) return false
        var removedUri: String? = null
        synchronized(lock) {
            val current = state.value
            val existing = current[key] ?: return false
            removedUri = existing
            val updated = current.toMutableMap().apply { remove(key) }
            state.value = updated
            persistLocked(updated)
        }
        removedUri?.let(::deleteManagedFile)
        return true
    }

    private fun persistLocked(map: Map<String, String>) {
        writeMapJson(Json.encodeToString(map))
    }

    private fun deleteManagedFile(uriString: String) {
        val file = resolveFile(uriString) ?: return
        val coversRoot = runCatching { coversDir.canonicalFile }.getOrNull() ?: return
        val target = runCatching { file.canonicalFile }.getOrNull() ?: return
        if (target.parentFile == coversRoot && target.exists()) {
            target.delete()
        }
    }

    private fun fileExistsForUri(uriString: String): Boolean {
        val file = resolveFile(uriString) ?: return false
        return file.exists() && file.length() > 0L
    }

    private fun resolveFile(uriString: String): File? {
        if (uriString.isBlank()) return null
        return runCatching {
            val parsed = URI.create(uriString)
            if (parsed.scheme == "file" && !parsed.path.isNullOrBlank()) File(parsed.path) else null
        }.getOrNull()
    }

    private fun toFileUri(file: File): String {
        val path = file.absolutePath
        return if (path.startsWith("/")) "file://$path" else file.toURI().toString()
    }

    private fun hashKey(key: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8))
        return digest.take(12).joinToString("") { "%02x".format(it) }
    }

    companion object {
        private val SYSTEM_OR_NON_PLAYLIST_IDS = setOf(
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
        )

        /**
         * Structural guard ensuring system playlists (Liked Songs, Downloads,
         * device folders) and artist/album pages cannot receive custom covers.
         */
        fun isCustomizablePlaylistId(browseId: String?): Boolean {
            val id = browseId?.trim().orEmpty()
            if (id.isEmpty() || id in SYSTEM_OR_NON_PLAYLIST_IDS) return false
            if (id.startsWith("local:offline:")) return id != "local:offline:liked"
            if (id.startsWith("local:playlist:")) return true
            if (id.startsWith("local:")) return false
            if (id.startsWith("spotify:")) return false
            if (id.startsWith("UC") || id.startsWith("MPREb") || id.startsWith("OLAK5uy_")) return false
            val canonical = normalizePlaylistCoverKey(id)
            return canonical !in SYSTEM_OR_NON_PLAYLIST_IDS &&
                (id.startsWith("VL") || id.startsWith("PL"))
        }
    }
}
