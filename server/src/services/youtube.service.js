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
 * Source status vocabulary, shared with the registry so every layer agrees on
 * what a failure actually was.
 */
export const SOURCE_STATUS = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  QUOTA_EXCEEDED: 'quota_exceeded',
  NO_RESULTS: 'no_results',
  ERROR: 'error',
}

/**
 * Google reports quota problems with an HTTP 403/429 AND a machine-readable
 * `reason` in the error body. Matching on the status code alone would mislabel
 * an invalid key or a blocked region as "quota", so the reason is what decides.
 */
const QUOTA_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceededForYou',
])

/** True when a Data API error body describes an exhausted quota. */
export function isQuotaReason(reason) {
  return QUOTA_REASONS.has(String(reason || ''))
}

/**
 * Low-level fetch against the Data API with quota/error translation.
 *
 * Throws an ApiError carrying a `sourceStatus` so callers can distinguish
 * "the quota ran out" from "the network broke" from "there is genuinely nothing
 * to show". Reporting an exhausted quota as an empty result set is what made the
 * UI claim "No results" during an outage.
 */
async function callApi(path, params = {}) {
  if (!isConfigured()) {
    const error = ApiError.internal(
      'YouTube integration is not configured. Set YOUTUBE_API_KEY in server/.env.',
    )
    error.sourceStatus = SOURCE_STATUS.UNAVAILABLE
    throw error
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
    const networkError = ApiError.internal(
      'Could not reach the YouTube API. Please try again.',
    )
    networkError.sourceStatus = SOURCE_STATUS.ERROR
    throw networkError
  }

  if (!response.ok) {
    let reason = 'YouTube API request failed'
    try {
      const body = await response.json()
      reason = body?.error?.errors?.[0]?.reason || body?.error?.message || reason
    } catch {
      /* keep the default reason */
    }

    if ((response.status === 403 || response.status === 429) && isQuotaReason(reason)) {
      const quotaError = ApiError.tooMany(
        'The external music search quota has been reached. Please try again later.',
      )
      quotaError.sourceStatus = SOURCE_STATUS.QUOTA_EXCEEDED
      quotaError.quotaReason = reason
      throw quotaError
    }

    // A 403/429 that is NOT a quota reason is something else entirely.
    if (response.status === 403 || response.status === 429) {
      const blocked = ApiError.forbidden(`YouTube API refused the request: ${reason}`)
      blocked.sourceStatus = SOURCE_STATUS.ERROR
      throw blocked
    }

    if (response.status === 400 && /key/i.test(reason)) {
      const keyError = ApiError.internal('The configured YouTube API key was rejected.')
      keyError.sourceStatus = SOURCE_STATUS.UNAVAILABLE
      throw keyError
    }

    const other = ApiError.internal(`YouTube API error: ${reason}`)
    other.sourceStatus = SOURCE_STATUS.ERROR
    throw other
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

/**
 * Cached response for search.list, keyed by the exact query parameters.
 *
 * Only SUCCESSFUL results are stored. An empty or failed response is never
 * cached, so a transient outage (including an exhausted quota) cannot poison
 * the cache and make a later, working search look empty for the full TTL.
 *
 * This caches metadata only - titles, channels, thumbnails and ids. No audio,
 * stream URL or media reference is ever produced or stored here.
 */
const SEARCH_TTL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Hard ceiling on cached entries.
 *
 * The TTL alone does not bound memory: a busy window could insert far more keys
 * than it will evict. Oldest-inserted entries are dropped once the cap is hit,
 * so the cache degrades to "less useful" rather than "unbounded".
 */
const SEARCH_CACHE_MAX = 500

const searchCache = new Map()

/**
 * Observability for quota-sensitive paths.
 *
 * Deliberately narrow: it reports the QUERY and the outcome, never the API key,
 * any authorization header, a JWT or a database URI. Anything that would be a
 * secret is kept out of the message entirely rather than redacted afterwards.
 */
export const youtubeLog = {
  cacheHit: (q) => log('debug', `youtube search cache hit  q=${truncateForLog(q)}`),
  cacheMiss: (q) => log('debug', `youtube search cache miss q=${truncateForLog(q)}`),
  request: (path, params) =>
    log('info', `youtube request ${path} ${describeParams(params)}`),
  quotaExceeded: (q, reason) =>
    log('warn', `youtube quota exceeded q=${truncateForLog(q)} reason=${reason}`),
  deduplicated: (q) => log('debug', `youtube request deduplicated q=${truncateForLog(q)}`),
  /** Answered locally from the quota hold; no upstream call was made. */
  quotaShortCircuited: (q) =>
    log('debug', `youtube skipped (quota already known exhausted) q=${truncateForLog(q)}`),
  homeCacheHit: () => log('debug', 'catalogue home cache hit'),
  homeCacheMiss: () => log('debug', 'catalogue home cache miss'),
}

/** Keeps log lines short and free of anything sensitive. */
function truncateForLog(value) {
  return String(value ?? '').slice(0, 60).replace(/\s+/g, ' ')
}

/** Logs only the parameters that change results. No keys, no headers. */
function describeParams(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${truncateForLog(v)}`)
    .join(' ')
}

function log(level, message) {
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](`[youtube] ${message}`)
}

/**
 * Short-lived "quota is gone" marker.
 *
 * search.list costs 100 units, so once Google reports the quota is spent every
 * further attempt is guaranteed to fail. Remembering that for a few minutes lets
 * the second and third calls in a single fan-out fail instantly and locally
 * instead of spending network round trips to be told the same thing again.
 */
const QUOTA_HOLD_MS = 5 * 60 * 1000
let quotaExhaustedUntil = 0

/** Records an exhausted quota so sibling calls short-circuit. */
function noteQuotaExhausted() {
  quotaExhaustedUntil = Date.now() + QUOTA_HOLD_MS
}

/** True while we already know the quota is spent; clears the marker when it lifts. */
function quotaKnownExhausted() {
  if (quotaExhaustedUntil > Date.now()) return true
  quotaExhaustedUntil = 0
  return false
}

/** Raises a quota error consistent with the one callApi would have produced. */
function quotaError() {
  const error = ApiError.tooMany(
    'The external music search quota has been reached. Please try again later.',
  )
  error.sourceStatus = SOURCE_STATUS.QUOTA_EXCEEDED
  error.quotaReason = 'quotaExceeded'
  return error
}

/**
 * Builds the cache key from EVERY parameter that can change the result set.
 *
 * A key that omits, say, regionCode would serve results for India to a
 * listener in Germany, which is both wrong and hard to debug. Fields are
 * normalised to fixed order and defaults are applied first so that an omitted
 * parameter and an explicitly-defaulted one cannot occupy two cache slots.
 */
function searchCacheKey({ query, type, maxResults, regionCode, order, safeSearch }) {
  return JSON.stringify([
    'v2',
    String(query ?? '').trim(),
    type,
    Number(maxResults) || 0,
    regionCode || 'US',
    order || 'relevance',
    safeSearch ? 'moderate' : 'none',
  ])
}

/**
 * Drops expired entries, then enforces the size ceiling.
 *
 * Map preserves insertion order, so the first key is always the oldest and is
 * the right one to evict. Re-inserting on read would keep hot entries fresh,
 * which is why the hit path below does that.
 */
function pruneSearchCache() {
  const cutoff = Date.now() - SEARCH_TTL_MS
  for (const [key, entry] of searchCache) {
    if (entry.at < cutoff) searchCache.delete(key)
  }
  while (searchCache.size > SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next()
    if (oldest.done) break
    searchCache.delete(oldest.value)
  }
}

/**
 * Reads a live cache entry, refreshing its recency.
 *
 * Returns undefined on a miss or an expired entry. Refresh-on-read makes the
 * ceiling evict genuinely cold entries rather than whatever happened to be
 * inserted first.
 */
function readCache(key, query) {
  const entry = searchCache.get(key)
  if (!entry) {
    youtubeLog.cacheMiss(query)
    return undefined
  }
  if (Date.now() - entry.at >= SEARCH_TTL_MS) {
    searchCache.delete(key)
    youtubeLog.cacheMiss(query)
    return undefined
  }
  // Re-insert to mark as most recently used.
  searchCache.delete(key)
  searchCache.set(key, entry)
  youtubeLog.cacheHit(query)
  return entry
}

/** Stores a successful result. Never call this for a failure or an empty set. */
function writeCache(key, payload) {
  searchCache.set(key, { at: Date.now(), ...payload })
  pruneSearchCache()
}

/**
 * Searches YouTube and caches both the raw ordering and the metadata.
 *
 * @returns {Promise<{items: Array, fromCache: boolean}>}
 */
export async function searchVideos(
  query,
  { maxResults = 20, order, regionCode = 'US', safeSearch = true } = {},
) {
  const limit = Math.min(Number(maxResults) || 20, config.youtube.maxResults)
  const type = ['relevance', 'rating', 'viewCount', 'date'].includes(order) ? order : 'relevance'

  const key = searchCacheKey({
    query,
    type: 'video',
    maxResults: limit,
    regionCode,
    order: type,
    safeSearch,
  })

  // The cache is consulted FIRST and deliberately so: a cached result is still
  // served during a quota outage, which is the whole value of caching. Only a
  // genuine miss falls through to the quota hold below.
  const cached = readCache(key, query)
  if (cached) return { items: cached.items, fromCache: true }

  // If a sibling call in this same fan-out already exhausted the quota, do not
  // spend another round trip to be told the same thing.
  if (quotaKnownExhausted()) {
    youtubeLog.quotaShortCircuited(query)
    throw quotaError()
  }

  // Coalesce identical concurrent searches so we only spend quota once.
  if (inflight.has(key)) {
    youtubeLog.deduplicated(query)
    return inflight.get(key)
  }

  const promise = (async () => {
    pruneSearchCache()

    // One page only. search.list pages at 100 units per call, so following
    // nextPageToken automatically would quietly multiply the cost of a single
    // user search. Another page is fetched only if a caller explicitly asks.
    let data
    try {
      youtubeLog.request('search.list', {
        q: query,
        type: 'video',
        maxResults: Math.min(limit, 50),
        regionCode,
        order: type,
      })
      data = await callApi('search', {
        part: 'snippet',
        // videoCategoryId 10 = Music. Keeps results music-only.
        videoCategoryId: '10',
        type: 'video',
        q: query,
        maxResults: Math.min(limit, 50),
        order: type,
        regionCode,
        safeSearch: safeSearch ? 'moderate' : undefined,
      })
    } catch (error) {
      // Remember an exhausted quota so the sibling playlist search short-circuits
      // instead of spending another round trip to be told the same thing.
      // Nothing is retried and nothing is cached: a quota failure is final for
      // the rest of the quota window.
      if (error?.sourceStatus === SOURCE_STATUS.QUOTA_EXCEEDED) {
        noteQuotaExhausted()
        youtubeLog.quotaExceeded(query, error.quotaReason)
      }
      throw error
    }

    const items = (data.items || [])
      .map((entry) => entry?.id?.videoId)
      .filter(Boolean)

    if (!items.length) {
      // A genuinely empty result is NOT cached. Caching it would make "this
      // search has no matches" indistinguishable from "we could not ask", and
      // would pin an empty answer for the whole TTL.
      return { items: [], fromCache: false }
    }

    // search.list gives snippets; videos.list gives duration + embeddable.
    // Artist cards are derived from these same videos upstream, so one
    // search.list + one videos.list serves Songs, Artists AND Collections
    // rather than issuing a separate search per result type.
    const details = await getVideos(items, { allowStale: true })
    // Successful results only.
    writeCache(key, { items: details })
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

/* ------------------------------------------------------------------ */
/* Playlists and channels                                              */
/*                                                                    */
/* YouTube's Data API has no album entity, so MUSICA derives its        */
/* "Collections" from real playlist metadata rather than inventing any. */
/* ------------------------------------------------------------------ */

/**
 * Search YouTube playlists -> MUSICA "Collections".
 *
 * Playlist metadata is public and returned directly by the API, so nothing
 * here is inferred. Cost is search.list = 100 units, cached for the same
 * quota reason as video search.
 */
export async function searchPlaylists(
  query,
  { maxResults = 20, regionCode = 'US', order } = {},
) {
  if (!query) return []
  const limit = Math.min(Number(maxResults) || 20, config.youtube.maxResults)
  const key = searchCacheKey({
    query,
    type: 'playlist',
    maxResults: limit,
    regionCode,
    order: order || 'relevance',
    safeSearch: true,
  })

  const cached = readCache(key, query)
  if (cached) return cached.value

  if (inflight.has(key)) {
    youtubeLog.deduplicated(query)
    return (await inflight.get(key)).value
  }

  // The sibling video search may already have found the quota spent.
  if (quotaKnownExhausted()) {
    youtubeLog.quotaShortCircuited(query)
    throw quotaError()
  }

  const promise = (async () => {
    let data
    try {
      youtubeLog.request('search.list', { q: query, type: 'playlist', maxResults: Math.min(limit, 50), regionCode })
      data = await callApi('search', {
        part: 'snippet',
        type: 'playlist',
        q: query,
        maxResults: Math.min(limit, 50),
        regionCode,
      })
    } catch (error) {
      // No retry, no cache write: a quota failure is final for this window.
      if (error?.sourceStatus === SOURCE_STATUS.QUOTA_EXCEEDED) {
        noteQuotaExhausted()
        youtubeLog.quotaExceeded(query, error.quotaReason)
      }
      throw error
    }

    const items = (data.items || [])
      .map((entry) => {
        const sn = entry?.snippet || {}
        const thumb = sn.thumbnails?.medium || sn.thumbnails?.default || {}
        return {
          kind: 'playlist',
          playlistId: entry?.id?.playlistId,
          title: sn.title || 'Untitled playlist',
          description: (sn.description || '').slice(0, 400),
          channelId: sn.channelId || '',
          channelTitle: sn.channelTitle || '',
          // search.list does NOT return videoCount for playlists, and there is no
          // album/playlist-count field we can read cheaply. Leave it null rather
          // than reporting a fabricated "0 items"; the UI omits the count when
          // it is unknown.
          itemCount: Number.isFinite(Number(sn.videoCount)) ? Number(sn.videoCount) : null,
          artwork: thumb.url || '',
          artworkHigh: sn.thumbnails?.high?.url || '',
          watchUrl: entry?.id?.playlistId
            ? `https://www.youtube.com/playlist?list=${entry.id.playlistId}`
            : null,
        }
      })
      .filter((p) => p.playlistId)

    // Successful results only, for the same reason as video search.
    if (items.length) writeCache(key, { value: items })
    return { items, fromCache: false }
  })()

  inflight.set(key, promise)
  try {
    const result = await promise
    return result.items
  } finally {
    inflight.delete(key)
  }
}

/**
 * Channel metadata lookup. channels.list costs 1 unit, which makes it cheap
 * enough to run on each search so an artist card has a real name and avatar.
 * Memoised per process because channel identity is effectively immutable.
 */
const channelCache = new Map()

export async function getChannels(channelIds) {
  const ids = [...new Set((channelIds || []).filter(Boolean))]
  if (!ids.length) return []

  const resolved = new Map()
  const missing = []

  for (const id of ids) {
    if (channelCache.has(id)) resolved.set(id, channelCache.get(id))
    else missing.push(id)
  }

  if (missing.length) {
    const CHUNK = 50 // channels.list accepts at most 50 ids
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK)
      const data = await callApi('channels', {
        part: 'snippet,statistics',
        id: chunk.join(','),
        maxResults: 50,
      })
      for (const item of data.items || []) {
        const sn = item.snippet || {}
        const stats = item.statistics || {}
        const thumb = sn.thumbnails?.medium || sn.thumbnails?.default || {}
        const shaped = {
          kind: 'channel',
          channelId: item.id,
          title: sn.title || 'Unknown channel',
          description: (sn.description || '').slice(0, 400),
          customUrl: sn.customUrl || '',
          artwork: thumb.url || '',
          artworkHigh: sn.thumbnails?.high?.url || '',
          subscriberCount: Number(stats.subscriberCount) || 0,
          videoCount: Number(stats.videoCount) || 0,
          watchUrl: `https://www.youtube.com/channel/${item.id}`,
        }
        channelCache.set(item.id, shaped)
        resolved.set(item.id, shaped)
      }
    }
  }

  return ids.map((id) => resolved.get(id)).filter(Boolean)
}

/**
 * Build artist records from a set of videos, de-duplicating by channel so a
 * search for one artist yields one artist card rather than one per video.
 * Uses only real channel metadata.
 */
export async function getArtistsFromVideos(videos, { maxArtists = 12 } = {}) {
  const channelIds = [...new Set((videos || []).map((v) => v.channelId).filter(Boolean))]
  if (!channelIds.length) return []

  const channels = await getChannels(channelIds.slice(0, maxArtists))
  const byId = new Map(channels.map((c) => [c.channelId, c]))

  return channels.map((channel) => {
    const related = videos.filter((v) => v.channelId === channel.channelId)
    return {
      ...channel,
      trackCount: related.length,
      topTrackId: related[0]?.videoId || null,
      topTrackTitle: related[0]?.title || null,
    }
  })
}

/**
 * Simple health/quota probe, useful for the admin screen and diagnostics.
 *
 * Uses videos.list (1 unit), never search.list (100 units), so checking status
 * cannot itself consume the budget it is reporting on. If the key is missing it
 * reports unavailable without making any request at all.
 */
export async function getQuotaInfo() {
  if (!isConfigured()) {
    return { configured: false, status: SOURCE_STATUS.UNAVAILABLE }
  }

  // A quota failure we have already observed is reported without a new call.
  if (quotaKnownExhausted()) {
    return { configured: true, status: SOURCE_STATUS.QUOTA_EXCEEDED, probe: 'cached' }
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&maxResults=0&key=${config.youtube.apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    )

    if (!response.ok) {
      let reason = ''
      try {
        const body = await response.json()
        reason = body?.error?.errors?.[0]?.reason || ''
      } catch {
        /* keep the default */
      }
      const status = isQuotaReason(reason)
        ? SOURCE_STATUS.QUOTA_EXCEEDED
        : SOURCE_STATUS.ERROR
      if (status === SOURCE_STATUS.QUOTA_EXCEEDED) noteQuotaExhausted()
      return { configured: true, status, httpStatus: response.status, reason: reason || undefined }
    }

    return { configured: true, status: SOURCE_STATUS.AVAILABLE }
  } catch {
    return { configured: true, status: SOURCE_STATUS.ERROR }
  }
}

/**
 * Cache counters for diagnostics and tests.
 *
 * Counts only. It exposes no cached payload, so nothing that came back from
 * YouTube - and certainly no credential - can leak through it.
 */
export function getSearchCacheStats() {
  const now = Date.now()
  let live = 0
  for (const entry of searchCache.values()) {
    if (now - entry.at < SEARCH_TTL_MS) live += 1
  }
  return {
    entries: searchCache.size,
    liveEntries: live,
    inflight: inflight.size,
    ttlMs: SEARCH_TTL_MS,
    maxEntries: SEARCH_CACHE_MAX,
    quotaKnownExhausted: quotaKnownExhausted(),
  }
}

export default {
  isConfigured,
  searchVideos,
  searchPlaylists,
  getVideos,
  getChannels,
  getArtistsFromVideos,
  trendingMusic,
  getQuotaInfo,
  getSearchCacheStats,
  parseIsoDuration,
  isQuotaReason,
  SOURCE_STATUS,
  youtubeLog,
  /** Test seam: clears caches and the quota marker. */
  __resetSearchState() {
    searchCache.clear()
    inflight.clear()
    quotaExhaustedUntil = 0
  },
}