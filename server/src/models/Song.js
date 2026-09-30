import mongoose from 'mongoose'

const songSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [120, 'Title must be at most 120 characters'],
    },
    // Free-text artist name so users can add anyone as a guest artist.
    artistName: {
      type: String,
      required: [true, 'Artist name is required'],
      trim: true,
      maxlength: [80, 'Artist name must be at most 80 characters'],
    },
    // Set when the song is uploaded by a registered account (the owner).
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Optional link to a registered artist profile on MUSICA.
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    album: { type: String, trim: true, maxlength: 120, default: '' },
    genre: { type: String, trim: true, maxlength: 40, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    releaseYear: {
      type: Number,
      min: [1900, 'Release year looks invalid'],
      max: [new Date().getFullYear() + 1, 'Release year cannot be in the future'],
      default: () => new Date().getFullYear(),
    },

    // ---- Media (stored on disk / object storage, not in MongoDB) ----
    audioUrl: { type: String, required: [true, 'Audio file is required'] },
    audioKey: { type: String, default: '' },
    audioMimeType: { type: String, default: 'audio/mpeg' },
    audioSizeBytes: { type: Number, default: 0 },
    duration: { type: Number, default: 0, min: 0 }, // seconds

    coverUrl: { type: String, default: '' },
    coverKey: { type: String, default: '' },

    // ---- Public metrics ----
    playCount: { type: Number, default: 0, min: 0 },
    likeCount: { type: Number, default: 0, min: 0 },

    // ---- Moderation ----
    // Uploader confirms they own or are licensed to distribute this audio.
    rightsConfirmed: {
      type: Boolean,
      required: [true, 'You must confirm you have the rights to this recording'],
    },
    rightsNote: { type: String, default: '', maxlength: 300 },
    isActive: { type: Boolean, default: true },
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

// ---- Indexes ----
// Weighted text index powers the search bar. `title^3` means a title match
// ranks far above a genre match.
songSchema.index({ title: 'text', artistName: 'text', album: 'text', genre: 'text' }, {
  weights: { title: 3, artistName: 2, album: 1, genre: 1 },
  name: 'song_search_index',
})
// Sorted feeds: recently added, trending, most played.
songSchema.index({ isActive: 1, createdAt: -1 })
songSchema.index({ isActive: 1, playCount: -1 })
songSchema.index({ isActive: 1, likeCount: -1 })
songSchema.index({ genre: 1, createdAt: -1 })

const Song = mongoose.model('Song', songSchema)

export default Song
