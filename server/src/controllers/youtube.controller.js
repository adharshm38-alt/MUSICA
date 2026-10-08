/**
 * YouTube discovery endpoints.
 *
 * These routes expose METADATA ONLY. They never return, proxy or resolve a
 * stream URL - playback is handled by the official YouTube embedded player in
 * the client.
 */

import mongoose from 'mongoose'
import * as youtube from '../services/youtube.service.js'
const { SOURCE_STATUS } = youtube
import asyncHandler from '../utils/asyncHandler.js'
import ApiError from '../utils/ApiError.js'
import { sendSuccess, sendPaginated } from '../utils/response.js'

/** Guards against anyone passing a whole album of ids in one call. */
const MAX_IDS = 50

const escapeRegex = (text = '') => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A YouTube video id is exactly 11 URL-safe characters. */
function isValidVideoId(id) {
  return /^[\w-]{11}$/.test(id)
}

/**
 * GET /api/youtube/status
 *
 * Reports one of: available | unavailable | quota_exceeded | error.
 *
 * The probe uses videos.list (1 unit) and never search.list (100 units), so
 * asking for status cannot consume the budget it is reporting on. A quota
 * failure we have already seen is answered from memory with no request at all.
 */
export const status = asyncHandler(async (_req, res) => {
  const info = await youtube.getQuotaInfo()
  const configured = youtube.isConfigured()

  sendSuccess(res, {
    configured,
    // One machine-readable state for the client to branch on.
    status: info.status || (configured ? SOURCE_STATUS.AVAILABLE : SOURCE_STATUS.UNAVAILABLE),
    // The client needs this to know whether to offer YouTube as a source.
    provider: 'youtube',
    playback: 'official-embedded-iframe-player',
    // Counters only - never any cached payload and never a credential.
    cache: youtube.getSearchCacheStats(),
    message:
      info.status === SOURCE_STATUS.QUOTA_EXCEEDED
        ? 'YouTube search quota is temporarily unavailable. Local music is still available.'
        : info.status === SOURCE_STATUS.UNAVAILABLE
          ? 'YouTube discovery is not configured on this server.'
          : info.status === SOURCE_STATUS.ERROR
            ? 'YouTube discovery could not be reached right now.'
            : 'YouTube discovery is enabled.',
  })
})

/**
 * GET /api/youtube/search?q=&maxResults=&order=
 * Music-only video search (categoryId 10).
 */
export const search = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) throw ApiError.badRequest('Enter something to search for')
  if (q.length > 100) throw ApiError.badRequest('Search text is too long')

  const page = Math.max(1, Number(req.query.page) || 1)
  const maxResults = Math.min(Number(req.query.maxResults) || 20, 25)

  // search.list is ordered and not offsettable, so we fetch a generous slice
  // once and page through it locally. That avoids burning 100 extra quota units
  // on every page change.
  const { items, fromCache } = await youtube.searchVideos(q, {
    maxResults: Math.min(maxResults * page, 25),
    order: req.query.order,
  })

  const start = (page - 1) * maxResults
  const pageItems = items.slice(start, start + maxResults)

  sendPaginated(res, {
    items: pageItems,
    total: items.length,
    page,
    limit: maxResults,
    totalPages: Math.ceil(items.length / maxResults) || 1,
    meta: { cached: fromCache, query: q },
  })
})

/**
 * GET /api/youtube/videos?ids=a,b,c
 * Metadata for specific ids, used when opening a video.
 */
export const getVideos = asyncHandler(async (req, res) => {
  const raw = String(req.query.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (!raw.length) throw ApiError.badRequest('Provide one or more video ids')
  if (raw.length > MAX_IDS) throw ApiError.badRequest(`At most ${MAX_IDS} ids per request`)

  const invalid = raw.filter((id) => !isValidVideoId(id))
  if (invalid.length) throw ApiError.badRequest('One or more YouTube video ids are not valid')

  const items = await youtube.getVideos(raw)
  sendSuccess(res, { items })
})

/**
 * GET /api/youtube/videos/:videoId
 * Metadata for a single video.
 */
export const getVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params
  if (!isValidVideoId(videoId)) throw ApiError.badRequest('That YouTube video id is not valid')

  const [video] = await youtube.getVideos([videoId])
  if (!video) throw ApiError.notFound('That video is unavailable')

  sendSuccess(res, { video })
})

/**
 * GET /api/youtube/trending?maxResults=
 * Popular music videos - the YouTube counterpart of the local Trending rail.
 */
export const trending = asyncHandler(async (req, res) => {
  const maxResults = Math.min(Number(req.query.maxResults) || 20, 25)
  const items = await youtube.trendingMusic(maxResults)
  sendSuccess(res, { items })
})

/**
 * POST /api/youtube/songs
 * Saves a YouTube video into the MUSICA library so it can appear alongside
 * first-party uploads.
 *
 * Guard rails:
 *  - the client never sends a rightsConfirmed flag; we always record
 *    rightsConfirmed: false because we do not host YouTube's audio
 *  - embed-disabled videos are refused up front, because the official
 *    player will not play them
 *  - duplicates are prevented by the unique partial index on youtubeVideoId
 */
export const saveSong = asyncHandler(async (req, res) => {
  const { videoId } = req.body
  if (!isValidVideoId(videoId)) throw ApiError.badRequest('That YouTube video id is not valid')

  const [video] = await youtube.getVideos([videoId])
  if (!video) throw ApiError.notFound('That video is unavailable')

  if (!video.embeddable) {
    throw ApiError.badRequest(
      'The creator has disabled embedding for this video, so it cannot be added to MUSICA.',
    )
  }

  // Imported lazily to avoid a circular import at module load.
  const { default: Song } = await import('../models/Song.js')

  const existing = await Song.findOne({ source: 'youtube', youtubeVideoId: videoId })
  if (existing) {
    sendSuccess(res, { song: existing, alreadySaved: true })
    return
  }

  // Duration comes from the Data API, not from probing a media stream.
  const song = await Song.create({
    title: video.title.slice(0, 120),
    artistName: (video.channelTitle || 'Unknown channel').slice(0, 80),
    source: 'youtube',
    youtubeVideoId: video.videoId,
    youtubeChannelId: video.channelId,
    youtubeChannelTitle: video.channelTitle,
    coverUrl: video.thumbnail || video.thumbnailHigh || '',
    duration: video.durationSeconds || 0,
    releaseYear: video.publishedAt ? new Date(video.publishedAt).getFullYear() : undefined,
    description: (video.description || '').slice(0, 500),
    genre: 'YouTube',
    uploadedBy: req.user._id,
    // Explicitly NOT an upload: no audio URL, no rights claim.
    audioUrl: '',
    rightsConfirmed: false,
    isActive: true,
  })

  const { default: User } = await import('../models/User.js')
  await User.updateOne({ _id: req.user._id }, { $inc: { songCount: 1 } })

  sendSuccess(res, { song, alreadySaved: false }, 201)
})

export default {
  status,
  search,
  getVideos,
  getVideo,
  trending,
  saveSong,
}