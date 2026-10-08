/**
 * Catalogue endpoints.
 *
 * These are the source-aware entry points that Home and Search use. They sit
 * alongside the existing /api/songs and /api/search routes, which are left
 * untouched so nothing that depends on them breaks.
 *
 * Every response is built from real source data at query time. No external
 * catalogue is mirrored into MongoDB.
 */

import * as registry from '../services/sources/registry.js'
import asyncHandler from '../utils/asyncHandler.js'
import ApiError from '../utils/ApiError.js'
import { sendSuccess } from '../utils/response.js'

/** Models are imported lazily so the registry stays free of import cycles. */
async function loadModels() {
  const [{ default: Song }, { default: Playlist }, { default: ListeningHistory }] = await Promise.all([
    import('../models/Song.js'),
    import('../models/Playlist.js'),
    import('../models/ListeningHistory.js'),
  ])
  return { Song, Playlist, ListeningHistory }
}

/**
 * GET /api/catalogue/sources
 * Which sources exist, whether each is available, and what it can do.
 */
export const sources = asyncHandler(async (_req, res) => {
  sendSuccess(res, { sources: registry.describeSources() })
})

/**
 * GET /api/catalogue/search?q=&limit=
 *
 * Unified music search across every available source, returning normalized
 * tracks, artists and collections. Replaces the need for a separate
 * "YouTube" tab: a single query reaches both the local library and YouTube.
 */
export const search = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) throw ApiError.badRequest('Enter something to search for')
  if (q.length > 120) throw ApiError.badRequest('Search text is too long')

  const limit = Math.min(Number(req.query.limit) || 20, 25)
  const models = await loadModels()

  const result = await registry.searchMusic({ query: q, limit, models })

  sendSuccess(res, {
    query: q,
    tracks: result.tracks,
    artists: result.artists,
    collections: result.collections,
    // Overall outcome plus a per-source breakdown, so the UI can say exactly
    // what happened instead of defaulting to "No results" for an outage.
    status: result.status,
    sourceStatus: result.sourceStatus,
    degraded: result.degraded,
  })
})

/**
 * GET /api/catalogue/home?limit=
 *
 * The rails the Home page renders. Fanned out across available sources with a
 * small, fixed number of parallel calls.
 */
export const home = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 24)
  const models = await loadModels()

  const catalogue = await registry.getHomeCatalogue({
    models,
    viewer: req.user?._id,
    limit,
  })

  sendSuccess(res, catalogue)
})

/**
 * GET /api/catalogue/track/:sourceId/:sourceTrackId
 * Resolve playback for a normalized track without persisting anything.
 */
export const resolve = asyncHandler(async (req, res) => {
  const { sourceId, sourceTrackId } = req.params
  const models = await loadModels()

  const { trackFromLocal } = await import('../services/sources/normalize.js')
  let track = null

  if (sourceId === registry.SOURCE_YOUTUBE) {
    const youtube = await import('../services/youtube.service.js')
    const [video] = await youtube.getVideos([sourceTrackId])
    if (video) {
      const { trackFromYouTube } = await import('../services/sources/normalize.js')
      track = trackFromYouTube(video)
    }
  } else {
    const doc = await models.Song.findById(sourceTrackId).lean()
    track = trackFromLocal(doc)
  }

  if (!track) throw ApiError.notFound('That track is not available')

  sendSuccess(res, {
    track,
    playback: registry.resolvePlayback(track),
  })
})

export default { sources, search, home, resolve }