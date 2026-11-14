package com.music.bitchord.data

/**
 * Canonical storage key for custom playlist covers so `VLPL…` and `PL…` forms
 * of the same playlist share one cover entry, while `local:*` ids stay distinct.
 */
fun normalizePlaylistCoverKey(browseId: String?): String {
    val trimmed = browseId?.trim().orEmpty()
    if (trimmed.isEmpty()) return ""
    if (trimmed.startsWith("local:")) return trimmed
    return if (trimmed.startsWith("VL") && trimmed.length > 2) trimmed.removePrefix("VL") else trimmed
}

/** Resolves a custom cover URI from this map for [browseId], or null when unset. */
fun Map<String, String>.customPlaylistCoverOf(browseId: String?): String? {
    val key = normalizePlaylistCoverKey(browseId)
    if (key.isEmpty()) return null
    return this[key] ?: this[browseId?.trim()]
}
