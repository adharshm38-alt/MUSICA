import mongoose from 'mongoose'

/**
 * Minimal cache of public YouTube video metadata.
 *
 * WHY THIS EXISTS
 * ---------------
 * The YouTube Data API quota is the binding constraint: a search costs 100
 * units while a single videos.list lookup costs 1. With the default 10,000
 * units/day that is only ~100 user searches/day, so every lookup has to be
 * served from cache whenever possible.
 *
 * WHAT IS DELIBERATELY NOT STORED
 * -------------------------------
 * No audio, no video file, no stream URL, no media segments, nothing derived
 * from YouTube's media servers. We only keep the small set of public metadata
 * fields the UI needs to render a result card, and we never persist anything
 * that would let the app re-host or extract the content. Playback always
 * happens inside YouTube's own official embedded player.
 */
const youTubeVideoSchema = new mongoose.Schema(
  {
    // YouTube's own 11-character id. The stable key for a video.
    videoId: {
      type: String,
      required: true,
      unique: true,
      match: [/^[\w-]{11}$/, 'Invalid YouTube video id'],
    },

    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 2000 },

    // Creator attribution. We keep this so the UI can always credit the
    // original channel rather than presenting the work as MUSICA's own.
    channelId: { type: String, default: '', index: true },
    channelTitle: { type: String, default: '' },

    thumbnails: {
      default: {},
      // Only the small set of thumbnails the Data API documents.
      of: {
        default: {},
        type: new mongoose.Schema(
          {
            url: { type: String, default: '' },
            width: { type: Number, default: 0 },
            height: { type: Number, default: 0 },
          },
          { _id: false },
        ),
      },
    },

    durationSeconds: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },

    // Whether the uploader marked it as embeddable. The Data API's
    // `embeddable` flag tells us if the IFrame Player API will accept it;
    // honouring it up front avoids handing users a player that refuses.
    embeddable: { type: Boolean, default: true },

    // Set when YouTube reports the video as embed-disabled.
    embedBlocked: { type: Boolean, default: false },

    // Cache bookkeeping for quota management. Indexed below via
    // schema.index() rather than `index: true`, to avoid a duplicate warning.
    fetchedAt: { type: Date, default: Date.now },
    ttlSeconds: { type: Number, default: 86400 }, // 24h default
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

// Expired entries are the ones worth refetching.
youTubeVideoSchema.index({ fetchedAt: 1 })
// Search results are re-ranked by view count / recency.
youTubeVideoSchema.index({ viewCount: -1 })
youTubeVideoSchema.index({ publishedAt: -1 })

// Convenience: a canonical watch URL for attribution / external links.
youTubeVideoSchema.virtual('watchUrl').get(function watchUrl() {
  return `https://www.youtube.com/watch?v=${this.videoId}`
})

// The privacy-preserving embed host. youtube-nocookie.com does not set
// advertising cookies until the user actually plays the video.
youTubeVideoSchema.virtual('embedUrl').get(function embedUrl() {
  return `https://www.youtube-nocookie.com/embed/${this.videoId}`
})

const YouTubeVideo = mongoose.model('YouTubeVideo', youTubeVideoSchema)

export default YouTubeVideo