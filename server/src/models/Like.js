import mongoose from 'mongoose'

/**
 * One row per (user, song) pair. The unique compound index is what makes
 * "like" idempotent - pressing like twice can never create two records.
 */
const likeSchema = new mongoose.Schema(
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
      index: true,
    },
  },
  { timestamps: true },
)

likeSchema.index({ user: 1, song: 1 }, { unique: true, name: 'unique_user_song_like' })
likeSchema.index({ song: 1, createdAt: -1 })

const Like = mongoose.model('Like', likeSchema)

export default Like
