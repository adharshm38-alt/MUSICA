/**
 * Jamendo provider.
 *
 * WHAT THIS IS
 * ------------
 * Jamendo is a catalogue of independently released music published under
 * Creative Commons licences. Unlike a store preview, the `audio` URL it
 * returns is the WHOLE RECORDING, so this is the first third-party source
 * that can give MUSICA a full-length track it is actually allowed to play.
 *
 * THE API
 * -------
 * One documented endpoint, one required parameter:
 *
 *   GET https://api.jamendo.com/v3.0/tracks/?client_id=...&format=json
 *
 * The response is an ENVELOPE, not a bare array:
 *
 *   { "headers": { "status": "success", "code": 0, "error_message": "" },
 *     "results": [ ... ] }
 *
 * so a naive `payload.results ?? payload` would treat an error envelope as an
 * empty catalogue and report "nothing found" for an outage.
 *
 * PARAMETERS THAT MATTER
 * ----------------------
 *  - `type=single albumtrack`  Without it the API returns ALBUM TRACKS ONLY,
 *    and a large part of Jamendo's catalogue is singles, so they would simply
 *    be invisible.
 *  - `audioformat=mp32`         The API's default is mp31, which is 96 kbps.
 *  - `include=licenses`         Adds the full licence detail for attribution.
 *
 * COMPLIANCE (Jamendo's API Terms of Use)
 * ---------------------------------------
 *  - NON-COMMERCIAL USE ONLY. Commercial use needs a licence from
 *    licensing@jamendo.com.
 *  - NO OFFLINE ACCESS. Jamendo publishes a download URL, and artists can
 *    permit it per track, but the API terms forbid an application offering
 *    offline access to the content. The download URL is therefore NEVER
 *    requested, never stored and never offered. `audiodownload_allowed` is
 *    read only so the truth can be recorded, and the audio is streamed.
 *  - ATTRIBUTION. Every track carries its own licence, which the UI shows.
 *  - The documented rate limits are respected, never circumvented.
 */

import config from '../../config/env.js'
import { SOURCE_STATUS } from '../youtube.service.js'
import { PLAYBACK_JAMENDO_STREAM } from './normalize.js'

/** Upstream host. The documented API, not user-configurable. */
const SEARCH_URL = config.jamendo.searchUrl

/**
 * Set when Jamendo rejects the credential.
 *
 * Retrying a credential Jamendo does not recognise cannot succeed, and every
 * retry spends a call on the shared rate limit. The provider therefore
 * reports itself unavailable until the server is restarted with a corrected
 * Client ID.
 */
let credentialRejected = false

/**
 * True when the provider is switched on AND a Client ID is configured.
 *
 * A missing Client ID is NOT an error to be swallowed - it means the provider
 * was never set up, so the provider reports itself unavailable and the rest
 * of the catalogue carries on working.
 */
export function isEnabled() {
  if (credentialRejected) return false
  return config.jamendo.enabled === true && Boolean(config.jamendo.clientId)
}

/**
 * True when a Client ID is present.
 *
 * Separate from isEnabled() so the health check can say WHICH of the two is
 * wrong: "not configured" and "switched off" are different problems with
 * different fixes.
 */
export function isConfigured() {
  return Boolean(config.jamendo.clientId)
}

/* ------------------------------------------------------------------ */
/* Cache + in-flight dedup                                             */
/* ------------------------------------------------------------------ */

/**
 * Success-only, bounded, TTL cache.
 *
 * The API allows roughly 20 calls per minute and the terms forbid
 * circumventing that, so the cache is not an optimisation - it is how the
 * provider stays inside its allowance.
 */
const CACHE_TTL_MS = Math.max(1, config.jamendo.cacheTtlSeconds) * 1000
const CACHE_MAX = 500
const cache = new Map()

/** In-flight dedup, so a burst of identical requests spends one call. */
const inflight = new Map()

function cacheKey({ query, limit, trackId }) {
  return trackId ? `lookup|${trackId}` : `search|${limit}|${String(query).trim().toLowerCase()}`
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

/** Attaches a machine-readable status so the registry can classify it. */
function fail(message, status, { transient = false } = {}) {
  const error = new Error(message)
  error.sourceStatus = status
  // Only a genuinely TEMPORARY failure may be retried. A rejected credential
  // or a malformed request will fail identically forever, so retrying it would
  // only waste the shared rate limit and delay the real answer.
  error.transient = transient
  return error
}

/**
 * How many times a transient failure is retried, and how long to wait.
 *
 * Small and bounded on purpose: the caller is waiting, and Jamendo's search
 * intermittently returns an empty success (see below), so one or two quick
 * retries are worth it, but a long retry loop would hold the request open.
 */
const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 250

/** Waits, so a retry does not hammer an upstream that is already struggling. */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * True when a failure is worth retrying.
 *
 * Transient: a dropped connection, a reset socket, a timeout. These clear on
 * their own, and the live testing showed the CDN resetting connections under
 * load.
 *
 * NOT transient: an invalid credential (code 5), a suspended application
 * (code 11), a rate limit, a malformed response, or a bad request. Retrying
 * any of those cannot succeed.
 */
function isRetryable(error) {
  return error?.transient === true
}

/**
 * Runs an operation, retrying transient failures with a short backoff.
 *
 * @param {() => Promise<any>} operation
 */
async function withRetry(operation) {
  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) throw error
      // Exponential backoff: 250ms, then 500ms.
      await delay(RETRY_BASE_MS * 2 ** (attempt - 1))
    }
  }
  throw lastError
}

/**
 * Performs one upstream request.
 *
 * The `client_id` is added HERE, in the server process, and nowhere else. It
 * is never logged, never returned to the client, and never reaches the
 * browser bundle.
 */
async function request({ query, limit, trackId }) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('client_id', config.jamendo.clientId)
  url.searchParams.set('format', 'json')

  if (trackId) {
    url.searchParams.set('id', String(trackId))
  } else {
    url.searchParams.set('search', String(query || '').trim())
    url.searchParams.set('limit', String(Math.min(Math.max(1, limit), 200)))
    // BOTH kinds. The API returns album tracks only unless told otherwise,
    // and singles are a large part of the catalogue.
    url.searchParams.set('type', 'single albumtrack')
  }

  // Ask for the same metadata on a re-lookup as on a search. A stream request
  // re-resolves the track by id, and without these the normalized track would
  // lose its Creative Commons licence and its correctly-sized artwork - both
  // of which the Jamendo terms require the UI to show.
  url.searchParams.set('imagesize', String(config.jamendo.imageSize))
  url.searchParams.set('include', 'licenses')

  // The rendition asked for. mp32 is VBR at good quality; the API's default
  // is mp31, which is only 96 kbps.
  url.searchParams.set('audioformat', config.jamendo.audioFormat)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.jamendo.requestTimeoutMs)

  let response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      // A timeout is temporary: the next attempt may well be the quick one.
      throw fail('The Jamendo catalogue did not respond in time.', SOURCE_STATUS.ERROR, {
        transient: true,
      })
    }
    // A reset or refused connection is the classic transient failure, and the
    // one the live testing actually hit.
    throw fail('The Jamendo catalogue is unreachable.', SOURCE_STATUS.ERROR, {
      transient: true,
    })
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 429) {
    throw fail('The Jamendo rate limit was reached.', SOURCE_STATUS.QUOTA_EXCEEDED)
  }
  if (response.status === 401 || response.status === 403) {
    // Almost always a wrong or revoked Client ID.
    throw fail('The Jamendo Client ID was rejected.', SOURCE_STATUS.UNAVAILABLE)
  }
  if (!response.ok) {
    // A server-side failure may clear; a client-side one will not.
    const transient = response.status >= 500
    throw fail(
      `The Jamendo catalogue returned HTTP ${response.status}.`,
      SOURCE_STATUS.ERROR,
      { transient },
    )
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    // Not transient: the same bytes will be the same bytes next time.
    throw fail('The Jamendo catalogue returned a malformed response.', SOURCE_STATUS.ERROR)
  }

  // The envelope. An error is reported in `headers`, not as an HTTP failure,
  // so it has to be read explicitly.
  const headers = payload?.headers
  if (headers && headers.status && String(headers.status).toLowerCase() !== 'success') {
    const message = String(headers.error_message || '').trim()
    // Jamendo publishes a numeric code for every failure. Two of them mean the
    // CREDENTIAL is the problem, not the request:
    //
    //   5  Invalid Client Id       - does not exist or cannot be validated
    //   11 Suspended Application   - the application is not allowed to use the API
    //
    // Both are configuration problems, and both need the same response from
    // us: report them as UNAVAILABLE, not as a transient error. "Try again
    // later" would be a lie, because retrying the same credential forever
    // cannot succeed. The live check proved this: a random, non-existent id
    // returns the same code 5, so a rejected credential is simply not known
    // to Jamendo.
    const code = Number(headers.code)
    const status = code === 5 || code === 11
      ? SOURCE_STATUS.UNAVAILABLE
      : code === 6
        ? SOURCE_STATUS.QUOTA_EXCEEDED
        : SOURCE_STATUS.ERROR

    if (status === SOURCE_STATUS.UNAVAILABLE) {
      // Latch it, so the provider stops asking and reports itself as not
      // usable. The latch lives in this process only, so fixing the
      // credential and restarting the server clears it.
      credentialRejected = true
    }

    throw fail(
      message || 'The Jamendo catalogue returned an error.',
      status,
    )
  }

  if (!Array.isArray(payload?.results)) {
    throw fail('The Jamendo catalogue returned an unexpected response.', SOURCE_STATUS.ERROR)
  }
  return payload.results
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Searches the Jamendo catalogue.
 *
 * @returns {Promise<{results: object[], cached: boolean}>} RAW Jamendo rows.
 *   Normalization is the caller's job, so this module stays a thin,
 *   testable transport layer.
 */
export async function searchTracks({ query, limit = 20 } = {}) {
  if (!isEnabled()) {
    throw fail(
      credentialRejected
        ? 'Jamendo rejected this Client ID. Correct it in server/.env and restart the server.'
        : isConfigured()
          ? 'The Jamendo catalogue is switched off.'
          : 'No Jamendo Client ID is configured on the server.',
      SOURCE_STATUS.UNAVAILABLE,
    )
  }

  const trimmed = String(query || '').trim()
  if (trimmed.length < 2) return { results: [], cached: true }

  const key = cacheKey({ query: trimmed, limit })
  const cached = readCache(key)
  if (cached !== undefined) return { results: cached, cached: true }

  const pending = inflight.get(key)
  if (pending) return { results: await pending, cached: true }

  const request_ = withRetry(async (attempt) => {
    const results = await request({ query: trimmed, limit })

    // JAMENDO INTERMITTENTLY RETURNS AN EMPTY SUCCESS.
    //
    // Live testing showed the SAME query returning three rows on one call and
    // zero rows on the next, with `code: 0` and `status: "success"` both
    // times. A zero-length success is therefore not a real "nothing matches" -
    // it is the upstream being flaky, and treating it as a genuine empty
    // result would blank the search for the listener.
    //
    // It is retried a couple of times. If every attempt comes back empty,
    // that IS treated as an empty result, because a provider that genuinely
    // has nothing must be allowed to say so.
    if (!results.length && attempt < MAX_ATTEMPTS) {
      throw fail('The Jamendo catalogue returned an empty page.', SOURCE_STATUS.ERROR, {
        transient: true,
      })
    }
    return results
  })
    .then((results) => {
      // ONLY a non-empty answer is cached.
      //
      // Live device testing found the bug this prevents: Jamendo returned an
      // empty success for a track that exists, the retry logic correctly
      // treated that as flaky, and then this cache recorded the empty page as
      // the truth for thirty minutes. A real, playable track answered "not
      // available" until the server was restarted. Since an empty success is
      // documented above as unreliable, it must never be promoted to a cached
      // fact. Asking again is cheap; a wrong answer is not.
      if (results.length) writeCache(key, results)
      return results
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, request_)
  return { results: await request_, cached: false }
}

/**
 * Resolves ONE track by its Jamendo id.
 *
 * The right mechanism for a re-lookup, because Jamendo's ids are stable and
 * a title search could return a different recording.
 *
 * @returns {Promise<object|null>} the RAW Jamendo row, or null if it is gone.
 */
export async function lookupTrack({ trackId } = {}) {
  if (!isEnabled()) {
    throw fail(
      credentialRejected
        ? 'Jamendo rejected this Client ID. Correct it in server/.env and restart the server.'
        : isConfigured()
          ? 'The Jamendo catalogue is switched off.'
          : 'No Jamendo Client ID is configured on the server.',
      SOURCE_STATUS.UNAVAILABLE,
    )
  }

  const id = String(trackId || '').trim()
  if (!/^\d+$/.test(id)) return null

  const key = cacheKey({ trackId: id })
  const cached = readCache(key)
  if (cached !== undefined) return cached[0] || null

  const pending = inflight.get(key)
  if (pending) return (await pending)[0] || null

  const request_ = withRetry(async (attempt) => {
    const results = await request({ trackId: id })
    // The same intermittent empty success applies to an id lookup, so it gets
    // the same treatment. On the LAST attempt an empty result is accepted as
    // the truth: the track may genuinely have been removed from Jamendo, and
    // "not in this catalogue" is a normal answer, not a failure.
    if (!results.length && attempt < MAX_ATTEMPTS) {
      throw fail('The Jamendo catalogue returned an empty page.', SOURCE_STATUS.ERROR, {
        transient: true,
      })
    }
    return results
  })
    .then((results) => {
      // Same rule as searchTracks, and the one that actually bit us on the
      // device: an empty id lookup is NOT proof the track is gone, because
      // Jamendo also returns an empty success when it is merely flaky. Caching
      // that turned one bad reply into a track that could not be played for
      // thirty minutes.
      if (results.length) writeCache(key, results)
      return results
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, request_)
  return (await request_)[0] || null
}

/**
 * A real health check.
 *
 * It makes one live call, and it BYPASSES the cache: a provider that died
 * five minutes ago would still answer "available" from a cached search, and
 * telling the listener everything is fine when it is not is worse than saying
 * nothing.
 */
export async function health() {
  if (!isConfigured()) {
    return {
      ok: false,
      status: SOURCE_STATUS.UNAVAILABLE,
      message: 'No Jamendo Client ID is configured on the server.',
    }
  }
  if (!isEnabled()) {
    return {
      ok: false,
      status: SOURCE_STATUS.UNAVAILABLE,
      message: 'The Jamendo catalogue is switched off.',
    }
  }

  if (credentialRejected) {
    return {
      ok: false,
      status: SOURCE_STATUS.UNAVAILABLE,
      message: 'Jamendo rejected this Client ID. Correct it in server/.env and restart the server.',
    }
  }

  const startedAt = Date.now()
  try {
    const results = await request({ query: 'music', limit: 1 })
    return {
      ok: true,
      status: SOURCE_STATUS.AVAILABLE,
      message: `Jamendo is reachable and returned ${results.length} result${results.length === 1 ? '' : 's'}.`,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      status: error?.sourceStatus || SOURCE_STATUS.ERROR,
      message: error?.message || 'The Jamendo catalogue could not be reached.',
      latencyMs: Date.now() - startedAt,
    }
  }
}

/** Diagnostics for /catalogue/status and tests. */
export function getStats() {
  return {
    enabled: isEnabled(),
    configured: isConfigured(),
    provider: 'jamendo',
    playback: PLAYBACK_JAMENDO_STREAM,
    cache: {
      entries: cache.size,
      inflight: inflight.size,
      ttlMs: CACHE_TTL_MS,
      maxEntries: CACHE_MAX,
    },
  }
}

/** Test hook: drops cached metadata and in-flight entries. */
export function resetCache() {
  cache.clear()
  inflight.clear()
  credentialRejected = false
}

export const jamendoLog = {
  provider: 'jamendo',
  getStats,
  resetCache,
}

export default {
  isEnabled,
  isConfigured,
  searchTracks,
  lookupTrack,
  health,
  getStats,
  resetCache,
}
