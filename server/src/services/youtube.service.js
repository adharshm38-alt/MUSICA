/**
 * YouTube Data API client (discovery only).
 *
 * SCOPE AND COMPLIANCE
 * --------------------
 * This module exists to answer two questions only:
 *   1. "What videos match this search?"  -> videos.list / search.list
 *   2. "Give me the public metadata for these ids." -> videos.list
 *
 * It deliberately does NOT, and must not, gain the ability to:
 *   - download or extract audio/video streams
 *   - resolve or cache stream URLs
 *   - proxy YouTube's media segments
 *   - strip, separate or re-host any media
 *
 * Playback is always performed by YouTube's own embedded player
 * (youtube-nocookie.com + the IFrame Player API). We only ever store the
 * small public metadata fields needed to render a card.
 *
 * QUOTA
 * -----
 * search.list costs 100 units, videos.list costs 1 unit. With Google's default
 * 10,000 units/day that is ~100 searches/day, so results are cached in MongoDB
 * and served from there whenever possible.
 */

import config from '../config/env.js'
import YouTubeVideo from '../models/YouTubeVideo.js'
import ApiError from '../utils/ApiError.js'

const BASE = 'https://www.googleapis.com/youtube/v3'

/** True when an API key is configured; features degrade gracefully without one. */
export function isConfigured() {
  return Boolean(config.youtube.apiKey)
}

/** Fields we request from videos.list - the minimum needed to render a card. */
const VIDEO_FIELDS = [
  'id',
  'snippet',
  'contentDetails',
  'statistics',
  'status',
].join(',')

/** In-memory request coalescing: identical in-flight searches share one call. */
const inflight = new Map()

/**
 * Low-level fetch against the Data API with quota/error translation.
 * Throws ApiError with a user-safe message on failure.
 */
async function callApi(path, params = {}) {
  if (!isConfigured()) {
    throw ApiError.internal(
      'YouTube integration is not configured. Set YOUTUBE_API_KEY in server/.env.',
    )
  }

  const url = new URL(`${BASE}/${path}`)
  url.searchParams.set('key', config.youtube.apiKey)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  } catch (error) {
    throw ApiError.internal('Could not reach the YouTube API. Please try again.')
  }

  if (!response.ok) {
    let reason = 'YouTube API request failed'
    try {
      const body = await response.json()
      reason = body?.error?.errors?.[0]?.reason || body?.error?.message || reason
    } catch {
      /* keep the default reason */
    }

    if (response.status === 403 || response.status === 429) {
      throw ApiError.tooMany(
        'The YouTube API quota is exhausted right now. Please try again later.',
      )
    }
    if (response.status === 400 && /key/i.test(reason)) {
      throw ApiError.internal('The configured YouTube API key was rejected.')
    }
    throw ApiError.internal(`YouTube API error: ${reason}`)
  }

  return response.json()
}

/** Parses YouTube's ISO-8601-ish "PT3M20S" duration into seconds. */
export function parseIsoDuration(iso = '') {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return 0
  const [, d, h, m, s] = match.map(Number)
  return ((d || 0) * 86400) + ((h || 0) * 3600) + ((m || 0) * 60) + (s || 0)
}

/** Keeps the largest few thumbnails and drops the rest. */
function pickThumbnails(raw = {}) {
  const order = ['maxres', 'standard', 'high', 'medium', 'default']
  const out = {}
  for (const key of order) {
    const t = raw[key]
    if (t?.url) out[key] = { url: t.url, width: t.width || 0, height: t.height || 0 }
  }
  return out
}

/** Maps one API item onto our cached document shape. */
function toDocument(item) {
  const snippet = item.snippet || {}
  const status = item.status || {}

  return {
    videoId: item.id,
    title: snippet.title || 'Unknown title',
    description: (snippet.description || '').slice(0, 2000),
    channelId: snippet.channelId || '',
    channelTitle: snippet.channelTitle || '',
    thumbnails: pickThumbnails(snippet.thumbnails),
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
    viewCount: Number(item.statistics?.viewCount) || 0,
    // `embeddable === false` means the owner/YouTube disabled embedding.
    embeddable: status.embeddable !== false,
    embedBlocked: status.embeddable === false,
    fetchedAt: new Date(),
    ttlSeconds: config.youtube.cacheTtlSeconds,
  }
}

/** Cached response for search.list, keyed by the exact query parameters. */
const SEARCH_TTL_MS = 15 * 60 * 1000 // 15 minutes

const searchCache = new Map()

function searchCacheKey(q, params) {
  return JSON.stringify({ q, ...params })
}

function pruneSearchCache() {
  const cutoff = Date.now() - SEARCH_TTL_MS
  for (const [key, entry] of searchCache) {
    if (entry.at < cutoff) searchCache.delete(key)
  }
}

/**
 * Searches YouTube and caches both the raw ordering and the metadata.
 *
 * @returns {Promise<{items: Array, fromCache: boolean}>}
 */
export async function searchVideos(query, { maxResults = 20, order, safeSearch = true } = {}) {
  const limit = Math.min(Number(maxResults) || 20, config.youtube.maxResults)
  const type = ['relevance', 'rating', 'viewCount', 'date'].includes(order) ? order : 'relevance'

  const key = searchCacheKey(query, { limit, type, safeSearch })
  const cached = searchCache.get(key)
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) {
    return { items: cached.items, fromCache: true }
  }

  // Coalesce identical concurrent searches so we only spend quota once.
  if (inflight.has(key)) return inflight.get(key)

  const promise = (async () => {
    pruneSearchCache()

    const data = await callApi('search', {
      part: 'snippet',
      // videoCategoryId 10 = Music. Keeps results music-only.
      videoCategoryId: '10',
      type: 'video',
      part2: undefined,
      q: query,
      maxResults: Math.min(limit, 50),
      order: type,
      safeSearch: safeSearch ? 'moderate' : undefined,
    })

    const items = (data.items || [])
      .map((entry) => entry?.id?.videoId)
      .filter(Boolean)

    if (!items.length) {
      searchCache.set(key, { at: Date.now(), items: [] })
      return { items: [], fromCache: false }
    }

    // search.list gives snippets; videos.list gives duration + embeddable.
    const details = await getVideos(items, { allowStale: true })
    searchCache.set(key, { at: Date.now(), items: details })
    return { items: details, fromCache: false }
  })()

  inflight.set(key, promise)
  try {
    return await promise
  } finally {
    inflight.delete(key)
  }
}

/** True when a cached document is still inside its TTL. */
function isFresh(doc) {
  if (!doc?.fetchedAt) return false
  const ttl = (doc.ttlSeconds || config.youtube.cacheTtlSeconds) * 1000
  return Date.now() - new Date(doc.fetchedAt).getTime() < ttl
}

/**
 * Fetches metadata for a list of video ids, serving fresh cache entries
 * without spending quota and only calling the API for the rest.
 *
 * @param {string[]} videoIds
 * @param {{allowStale?: boolean}} options
 */
export async function getVideos(videoIds, { allowStale = false } = {}) {
  const ids = [...new Set((videoIds || []).filter(Boolean))]
  if (!ids.length) return []

  const cached = await YouTubeVideo.find({ videoId: { $in: ids } }).exec()

  const byId = new Map(cached.map((doc) => [doc.videoId, doc]))
  const missing = ids.filter((id) => {
    const doc = byId.get(id)
    if (!doc) return true
    if (isFresh(doc)) return false
    // Embed-blocked videos never change; never refetch them.
    if (doc.embedBlocked) return false
    return !allowStale
  })

  if (missing.length) {
    const CHUNK = 50 // videos.list accepts at most 50 ids per call
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK)
      const data = await callApi('videos', {
        part: 'snippet,contentDetails,statistics,status',
        id: chunk.join(','),
        maxResults: 50,
      })

      const docs = (data.items || []).map(toDocument)
      if (docs.length) {
        await YouTubeVideo.bulkWrite(
          docs.map((doc) => ({
            updateOne: {
              filter: { videoId: doc.videoId },
              update: { $set: doc },
              upsert: true,
            },
          })),
          { ordered: false },
        )
        for (const doc of docs) byId.set(doc.videoId, doc)
      }

      // Ids YouTube did not return are either deleted or private. Record them
      // as blocked so we stop asking about them.
      const returned = new Set(docs.map((d) => d.videoId))
      const gone = chunk
        .filter((id) => !returned.has(id))
        .map((id) => ({
          updateOne: {
            filter: { videoId: id },
            update: {
              $setOnInsert: {
                videoId: id,
                title: 'Unavailable video',
                embedBlocked: true,
                fetchedAt: new Date(),
              },
            },
            upsert: true,
          },
        }))
      if (gone.length) await YouTubeVideo.bulkWrite(gone, { ordered: false })
    }
  }

  // Preserve the caller's ordering rather than database order.
  return ids.map((id) => byId.get(id)).filter(Boolean).map(present)
}

/** Normalises a Mongoose doc (or plain object) into the public API shape. */
function present(doc) {
  const o = typeof doc.toJSON === 'function' ? doc.toJSON() : doc
  return {
    _id: o._id,
    videoId: o.videoId,
    title: o.title,
    description: o.description,
    channelId: o.channelId,
    channelTitle: o.channelTitle,
    thumbnail: o.thumbnails?.medium?.url || o.thumbnails?.high?.url || '',
    thumbnailHigh: o.thumbnails?.high?.url || o.thumbnails?.maxres?.url || '',
    durationSeconds: o.durationSeconds || 0,
    publishedAt: o.publishedAt,
    viewCount: o.viewCount || 0,
    embeddable: o.embedBlocked ? false : o.embeddable !== false,
    // The privacy-preserving embed host, used by the official player.
    embedUrl: o.videoId ? `https://www.youtube-nocookie.com/embed/${o.videoId}` : null,
    watchUrl: o.videoId ? `https://www.youtube.com/watch?v=${o.videoId}` : null,
    source: 'youtube',
  }
}

/**
 * Popular music videos, used as the YouTube equivalent of "Trending Now".
 * Sourced from a Music chart playlist rather than by scraping anything.
 */
export async function trendingMusic(maxResults = 20) {
  const data = await callApi('videos', {
    part: 'snippet,contentDetails,statistics,status',
    chart: 'mostPopular',
    videoCategoryId: '10',
    regionCode: 'US',
    maxResults: Math.min(Number(maxResults) || 20, 50),
  })
  return (data.items || []).map(toDocument).map(present)
}

/** Simple health/quotas probe, useful for the admin screen and diagnostics. */
export async function getQuotaInfo() {
  if (!isConfigured()) return { configured: false }
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&maxResults=0&key=${config.youtube.apiKey}`,
    { signal: AbortSignal.timeout(8000) },
  )
  // A 200 with no items still proves the key works; the quota endpoint needs
  // a separate key type, so we report availability rather than exact units.
  return { configured: true, reachable: response.ok }
}

export default {
  isConfigured,
  searchVideos,
  getVideos,
  trendingMusic,
  getQuotaInfo,
  parseIsoDuration,
}