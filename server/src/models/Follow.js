import mongoose from 'mongoose'

/** One row per (follower, following) pair. */
const followSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
)

followSchema.index({ follower: 1, following: 1 }, { unique: true, name: 'unique_follow_pair' })
followSchema.index({ following: 1, createdAt: -1 })

const Follow = mongoose.model('Follow', followSchema)

export default Follow
