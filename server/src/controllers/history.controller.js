import ListeningHistory, { HISTORY_LIMIT } from '../models/ListeningHistory.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/response.js'
import { decorateWithLikes } from '../utils/decorate.js'

/**
 * GET /api/history - newest first, capped at HISTORY_LIMIT rows.
 * Rows are upserts (one per user+song), so this stays small and useful.
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(HISTORY_LIMIT, Math.max(1, Number(req.query.limit) || 30))

  const entries = await ListeningHistory.find({ user: req.user._id })
    .sort({ lastPlayedAt: -1 })
    .limit(limit)
    .populate({ path: 'song', match: { isActive: true } })
    .lean()

  const songs = entries.filter((entry) => entry.song).map((entry) => entry.song)

  sendSuccess(res, {
    songs: await decorateWithLikes(songs, req.user._id),
    entries: entries.map((entry) => ({
      songId: entry.song?._id,
      lastPlayedAt: entry.lastPlayedAt,
      playCount: entry.playCount,
    })),
  })
})

/** DELETE /api/history - clear the whole history. */
export const clearHistory = asyncHandler(async (req, res) => {
  await ListeningHistory.deleteMany({ user: req.user._id })
  sendSuccess(res, { message: 'Listening history cleared' })
})

/** DELETE /api/history/:songId - remove one entry. */
export const removeFromHistory = asyncHandler(async (req, res) => {
  await ListeningHistory.deleteOne({
    user: req.user._id,
    song: req.params.songId,
  })
  sendSuccess(res, { message: 'Removed from history' })
})

export default { getHistory, clearHistory, removeFromHistory }
