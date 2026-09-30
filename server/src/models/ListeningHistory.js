import mongoose from 'mongoose'

export const HISTORY_LIMIT = 200

/**
 * Recently-played history, one row per (user, song).
 *
 * The unique compound index plus the controller's `upsert` means repeated
 * plays of the same song update the existing row (bumping `playCount` and
 * `lastPlayedAt`) instead of creating duplicates. After every insert we
 * trim the list back to HISTORY_LIMIT rows so a user's history stays a
 * useful, bounded "recently played" shelf rather than an endless log.
 */
const listeningHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    song: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      required: true,
    },
    lastPlayedAt: { type: Date, default: Date.now },
    playCount: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
)

listeningHistorySchema.index(
  { user: 1, song: 1 },
  { unique: true, name: 'unique_user_song_history' },
)
// Serves the "Recently Played, newest first" query.
listeningHistorySchema.index({ user: 1, lastPlayedAt: -1 })

const ListeningHistory = mongoose.model('ListeningHistory', listeningHistorySchema)

export default ListeningHistory
