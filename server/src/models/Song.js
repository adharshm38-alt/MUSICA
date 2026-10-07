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

    // ---- Where this song comes from ----
    // 'upload'  = a first-party file the user owns (existing MUSICA behaviour)
    // 'youtube' = discovered via YouTube and played through the official
    //             embedded player. YouTube audio is NEVER downloaded,
    //             extracted or re-hosted; we only store public metadata.
    source: {
      type: String,
      enum: ['upload', 'youtube'],
      default: 'upload',
      index: true,
    },

    // Set only when source === 'youtube'.
    youtubeVideoId: { type: String, default: '', index: true },
    youtubeChannelId: { type: String, default: '' },
    youtubeChannelTitle: { type: String, default: '' },

    // ---- Media (stored on disk / object storage, not in MongoDB) ----
    // Required for source === 'upload'. Empty for YouTube tracks, which are
    // streamed from YouTube's own embed rather than from our own disk.
    audioUrl: { type: String, default: '' },
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
      default: false,
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

/**
 * Source-aware validation.
 *
 * The two media paths have mutually exclusive requirements, and getting this
 * wrong is a legal problem, not just a data problem:
 *
 *  - source === 'upload'  must have an audioUrl AND an explicit
 *    rightsConfirmed, because the user asserts they own/are licensed for the
 *    audio we host ourselves.
 *  - source === 'youtube' must have a youtubeVideoId and must NOT claim
 *    rightsConfirmed - we never host YouTube's audio, so the "I own this"
 *    attestation is meaningless and misleading if set.
 */
songSchema.pre('validate', function validateSource(next) {
  const source = this.source || 'upload'

  if (source === 'upload') {
    if (!this.audioUrl) {
      return next(new Error('Audio file is required for uploaded songs'))
    }
    if (!this.rightsConfirmed) {
      return next(new Error('You must confirm you have the rights to this recording'))
    }
  } else if (source === 'youtube') {
    if (!this.youtubeVideoId) {
      return next(new Error('A YouTube video id is required for YouTube songs'))
    }
    if (!/^[\w-]{11}$/.test(this.youtubeVideoId)) {
      return next(new Error('That YouTube video id is not valid'))
    }
    // We do not host YouTube audio, so we must never claim to own it.
    this.rightsConfirmed = false
    this.audioUrl = ''
  }

  return next()
})

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

// A YouTube video can only be stored once.
songSchema.index(
  { youtubeVideoId: 1 },
  {
    unique: true,
    partialFilterExpression: { source: 'youtube', youtubeVideoId: { $type: 'string', $ne: '' } },
    name: 'unique_youtube_video',
  },
)

// Exposes the canonical YouTube watch URL alongside our own audioUrl so the
// client can link out and attribute the creator correctly.
songSchema.virtual('youtubeWatchUrl').get(function youtubeWatchUrl() {
  if (this.source !== 'youtube' || !this.youtubeVideoId) return null
  return `https://www.youtube.com/watch?v=${this.youtubeVideoId}`
})

const Song = mongoose.model('Song', songSchema)

export default Song
