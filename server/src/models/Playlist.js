import mongoose from 'mongoose'

const songRef = {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Song',
  required: true,
}

const playlistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Playlist name is required'],
      trim: true,
      maxlength: [100, 'Playlist name must be at most 100 characters'],
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Ordered so the user can reorder tracks.
    songs: { type: [songRef], default: [] },
    isPublic: { type: Boolean, default: true },
    coverUrl: { type: String, default: '' },
    coverKey: { type: String, default: '' },
    likeCount: { type: Number, default: 0, min: 0 },
    playCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v
        return ret
      },
    },
  },
)

playlistSchema.virtual('songCount').get(function songCount() {
  return this.songs?.length ?? 0
})

playlistSchema.index({ owner: 1, createdAt: -1 })
playlistSchema.index({ isPublic: 1, updatedAt: -1 })
playlistSchema.index({ name: 'text', description: 'text' }, { name: 'playlist_search_index' })

const Playlist = mongoose.model('Playlist', playlistSchema)

export default Playlist
