import api from './api'

/**
 * Lyrics access.
 *
 * MUSICA does not have a lyrics provider yet, and this module deliberately does
 * NOT invent one. There is no scraping of lyric sites, no guessing from a title,
 * and no placeholder text presented as if it were real lyrics - a wrong lyric
 * is worse than none, and licensing matters.
 *
 * What this does provide is the complete client/server shape so a provider can
 * be added later without touching the player UI:
 *
 *   GET /api/songs/:id/lyrics
 *     -> { available: false, reason: 'not_configured' }   (today)
 *     -> { available: true,  lines: [{ time, text }] }     (when a provider exists)
 *
 * The player renders "Lyrics aren't available for this track yet." whenever
 * `available` is false, and shows real synced lines when it is true.
 */

/** Reason codes the server may report when lyrics cannot be served. */
export const LYRICS_UNAVAILABLE_REASONS = {
  NOT_CONFIGURED: 'not_configured',
  NOT_FOUND: 'not_found',
  INSTRUMENTAL: 'instrumental',
  UNAVAILABLE: 'unavailable',
}

export const lyricsService = {
  /**
   * Fetches lyrics for one track.
   *
   * Never throws: an unavailable lyrics service is a normal state, not an error,
   * and the UI has a defined message for it. A network problem resolves to the
   * same shape so the player has exactly one branch to handle.
   *
   * @returns {Promise<{available: boolean, reason?: string, lines: Array, synced: boolean}>}
   */
  async forSong(songId) {
    const empty = { available: false, reason: LYRICS_UNAVAILABLE_REASONS.UNAVAILABLE, lines: [], synced: false }

    if (!songId) return empty

    try {
      const response = await api.get(`/songs/${songId}/lyrics`)
      const payload = response?.data?.data

      // Defensive: only trust a well-formed payload, and never accept text that
      // did not come from the server as if it were lyrics.
      if (!payload?.available || !Array.isArray(payload.lines) || payload.lines.length === 0) {
        return { ...empty, reason: payload?.reason || LYRICS_UNAVAILABLE_REASONS.NOT_FOUND }
      }

      const lines = payload.lines
        .filter((line) => line && typeof line.text === 'string' && line.text.trim())
        .map((line) => ({
          text: line.text,
          time: Number.isFinite(Number(line.time)) ? Number(line.time) : null,
        }))

      if (!lines.length) {
        return { ...empty, reason: LYRICS_UNAVAILABLE_REASONS.NOT_FOUND }
      }

      return { available: true, lines, synced: lines.some((line) => line.time !== null) }
    } catch {
      // Includes 404 (endpoint not implemented yet) and any network failure.
      return empty
    }
  },
}

export default lyricsService