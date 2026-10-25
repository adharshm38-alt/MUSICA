/**
 * iTunes Search API provider.
 *
 * WHY THIS EXISTS
 * ---------------
 * YouTube's Data API charges 100 units per search against a daily bucket. When
 * that bucket empties, discovery stops entirely and the app looks broken. The
 * iTunes Search API needs no key, no account and no quota purchase, and Apple's
 * published guidance allows roughly 20 calls per minute - orders of magnitude
 * more headroom - which makes it the reliable fallback that keeps search working
 * when YouTube cannot answer.
 *
 * COMPLIANCE BOUNDARY (these are requirements, not preferences)
 * ----------------------------------------------------------
 * Apple's terms allow promotional content - including song previews - only to
 * promote store content. Concretely, this module:
 *   - NEVER downloads, saves, caches or proxies audio. It stores METADATA only.
 *     The preview URL is handed to the browser, which streams it from Apple.
 *   - NEVER caches a preview response, only the JSON catalogue metadata.
 *   - NEVER presents a preview as the full recording: normalized tracks carry
 *     `isPreview: true`, `previewDurationSeconds` and `fullLengthPlayback:false`.
 *   - Every normalized track carries Apple's required attribution text and a
 *     store link so the UI can render them.
 *
 * Full-length playback remains YouTube's official embedded player, untouched.
 */

import config from '../../config/env.js'
import { SOURCE_STATUS } from '../youtube.service.js'

/** Upstream host. Apple's documented Search API. */
const SEARCH_URL = config.itunes.searchUrl
/** Apple's documented ID-based lookup endpoint (same host, documented). */
const LOOKUP_URL = 'https://itunes.apple.com/lookup'

/** True when the provider is switched on. No key, so no other gate exists. */
export function isEnabled() {
  return config.itunes.enabled === true
}

/* ------------------------------------------------------------------ */
/* Cache + in-flight dedup                                             */
/* ------------------------------------------------------------------ */

/**
 * Success-only, bounded, TTL cache for catalogue metadata.
 *
 * Bounded on purpose: an unbounded Map on a long-lived server is a leak, and
 * this process is long-lived on Render.
 */
const CACHE_TTL_MS = Math.max(1, config.itunes.cacheTtlSeconds) * 1000
const CACHE_MAX = 500
const cache = new Map()

/**
 * In-flight dedup. Without this, the 600ms client debounce plus React
 * re-renders could still produce two identical concurrent requests, and the
 * second would spend another upstream call for data already on the way.
 */
const inflight = new Map()

function cacheKey({ query, entity, limit, country }) {
  // Every parameter that can change the response is part of the key.
  return `${entity}|${country}|${limit}|${query.trim().toLowerCase()}`
}

function readCache(key) {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  // Refresh recency so the bounded eviction drops genuinely cold entries.
  cache.delete(key)
  cache.set(key, hit)
  return hit.value
}

function writeCache(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), value })
  return value
}

/* ------------------------------------------------------------------ */
/* Upstream call                                                       */
/* ------------------------------------------------------------------ */

/** Attaches a machine-readable status so the registry can classify the failure. */
function fail(message, status) {
  const error = new Error(message)
  error.sourceStatus = status
  return error
}

/**
 * Performs one upstream request.
 *
 * Apple's Search API is a public, documented GET endpoint. There is no key, so
 * there is nothing secret to leak here, and nothing to accidentally log.
 */
async function requestSearch({ query, entity, limit, country }) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('term', query)
  url.searchParams.set('entity', entity)
  url.searchParams.set('limit', String(Math.min(Math.max(1, limit), 200)))
  url.searchParams.set('country', country)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.itunes.requestTimeoutMs)

  let response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw fail('The iTunes catalogue did not respond in time.', SOURCE_STATUS.ERROR)
    }
    throw fail('The iTunes catalogue is unreachable.', SOURCE_STATUS.ERROR)
  } finally {
    clearTimeout(timer)
  }

  // Apple signals rate limiting with 403 or 429. Classifying it as a quota
  // problem keeps the UI honest: this is a limit, not "no such song".
  if (response.status === 429 || response.status === 403) {
    throw fail('The iTunes catalogue rate limit was reached.', SOURCE_STATUS.QUOTA_EXCEEDED)
  }
  if (response.status === 404) {
    throw fail('The iTunes catalogue is unavailable.', SOURCE_STATUS.UNAVAILABLE)
  }
  if (!response.ok) {
    throw fail(`The iTunes catalogue returned HTTP ${response.status}.`, SOURCE_STATUS.ERROR)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw fail('The iTunes catalogue returned a malformed response.', SOURCE_STATUS.ERROR)
  }

  // A valid envelope with no matches is NOT a failure: it is an empty result.
  if (!Array.isArray(payload?.results)) {
    throw fail('The iTunes catalogue returned an unexpected response.', SOURCE_STATUS.ERROR)
  }
  return payload.results
}

/**
 * Cache-first, dedup-first upstream fetch.
 *
 * Order matters: the in-flight check runs BEFORE the network call so that ten
 * concurrent identical searches produce exactly one upstream request.
 */
async function cachedSearch({ query, entity, limit, country, bypassCache = false }) {
  const key = cacheKey({ query, entity, limit, country })

  // A HEALTH CHECK MUST NOT READ THE CACHE.
  //
  // The catalogue caches for 30 minutes, which is right for search and wrong
  // for a liveness probe: a provider that died five minutes ago would still
  // answer "available" from the cache, and the listener would be told
  // everything is fine when it is not. A probe asks what is happening NOW.
  if (!bypassCache) {
    const cached = readCache(key)
    if (cached !== undefined) return { results: cached, cached: true }
  }

  const pending = inflight.get(key)
  if (pending) return { results: await pending, cached: true }

  const request = requestSearch({ query, entity, limit, country })
    .then((results) => {
      // Only successful responses are cached; a failure must not be sticky.
      writeCache(key, results)
      return results
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, request)
  return { results: await request, cached: false }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Song results. `entity=song` is the only entity that carries a previewUrl.
 *
 * @returns {Promise<object[]>} RAW iTunes results. Normalization is the
 * caller's job, so this module stays a thin, testable transport layer.
 */
export async function searchSongs({ query, limit = 20, country, bypassCache = false } = {}) {
  if (!isEnabled()) throw fail('The iTunes catalogue is switched off.', SOURCE_STATUS.UNAVAILABLE)

  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return { results: [], cached: true }

  return cachedSearch({
    query: trimmed,
    entity: 'song',
    limit: Math.min(limit || config.itunes.maxResults, config.itunes.maxResults),
    country: normalizeCountry(country),
    bypassCache,
  })
}

/** Artist results. Best-effort: never allowed to fail a search on its own. */
export async function searchArtists({ query, limit = 8, country } = {}) {
  if (!isEnabled()) throw fail('The iTunes catalogue is switched off.', SOURCE_STATUS.UNAVAILABLE)

  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return { results: [], cached: true }

  return cachedSearch({
    query: trimmed,
    entity: 'musicArtist',
    limit: Math.min(limit, config.itunes.maxResults),
    country: normalizeCountry(country),
  })
}

/**
 * Apple exposes no trending endpoint. This is stated rather than faked with a
 * hard-coded list, which would go stale and misrepresent itself as live data.
 */
export function supportsTrending() {
  return false
}

/** Apple uses two-letter storefront codes. Anything else falls back to config. */
function normalizeCountry(country) {
  const value = String(country || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(value) ? value : config.itunes.country
}

/** Diagnostics for /catalogue/status and tests. */
export function getStats() {
  return {
    enabled: isEnabled(),
    provider: 'itunes',
    playback: 'apple-hosted-preview',
    cache: {
      entries: cache.size,
      inflight: inflight.size,
      ttlMs: CACHE_TTL_MS,
      maxEntries: CACHE_MAX,
    },
  }
}

/**
 * Resolves ONE track by its Apple trackId, using Apple's documented ID-based
 * `lookup` endpoint.
 *
 * This exists because MUSICA persists no iTunes data: a track is re-resolved
 * from Apple at query time. Searching by title would be the wrong tool here
 * (titles are not unique, and a re-search could return a different recording),
 * so the ID lookup is the correct mechanism.
 *
 * @returns {Promise<object|null>} the RAW iTunes result, or null if gone.
 */
export async function lookupTrack({ trackId, country } = {}) {
  if (!isEnabled()) throw fail('The iTunes catalogue is switched off.', SOURCE_STATUS.UNAVAILABLE)

  const id = String(trackId || '').trim()
  if (!/^\d+$/.test(id)) return null

  const key = `lookup|${normalizeCountry(country)}|${id}`

  const cached = readCache(key)
  if (cached !== undefined) return cached[0] || null

  const pending = inflight.get(key)
  if (pending) return (await pending)[0] || null

  const url = new URL(LOOKUP_URL)
  url.searchParams.set('id', id)
  url.searchParams.set('entity', 'song')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.itunes.requestTimeoutMs)

  const request = (async () => {
    let response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw fail('The iTunes catalogue did not respond in time.', SOURCE_STATUS.ERROR)
      }
      throw fail('The iTunes catalogue is unreachable.', SOURCE_STATUS.ERROR)
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 429 || response.status === 403) {
      throw fail('The iTunes catalogue rate limit was reached.', SOURCE_STATUS.QUOTA_EXCEEDED)
    }
    if (!response.ok) {
      throw fail(`The iTunes catalogue returned HTTP ${response.status}.`, SOURCE_STATUS.ERROR)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw fail('The iTunes catalogue returned a malformed response.', SOURCE_STATUS.ERROR)
    }
    if (!Array.isArray(payload?.results)) {
      throw fail('The iTunes catalogue returned an unexpected response.', SOURCE_STATUS.ERROR)
    }
    return payload.results
  })()
    .then((results) => {
      writeCache(key, results)
      return results
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, request)
  return (await request)[0] || null
}

/** Test hook: drops cached metadata and in-flight entries. */
export function resetCache() {
  cache.clear()
  inflight.clear()
}

export const itunesLog = {
  provider: 'itunes',
  getStats,
  resetCache,
}

export default {
  isEnabled,
  searchSongs,
  searchArtists,
  lookupTrack,
  supportsTrending,
  getStats,
  resetCache,
}