import api from './api'

/**
 * Catalogue client.
 *
 * Talks to the source-aware /api/catalogue endpoints, which fan out across every
 * available music source (the local library and YouTube) and return normalized
 * tracks, artists and collections.
 *
 * Because the fan-out happens server-side, the client never needs to know which
 * sources exist, and adding one later requires no change here.
 *
 * The Google API key never reaches the browser: every call goes to our own
 * Express backend.
 */
/**
 * Short-lived client-side cache for catalogue responses.
 *
 * Navigating Home -> Search -> Home re-mounts those components, and without this
 * every remount re-issued the same requests. Because each search that reaches
 * YouTube spends a `search.list` call, a listener browsing normally could spend
 * the whole daily allowance clicking between two pages.
 *
 * Only SUCCESSFUL responses are stored. A failure - including an exhausted
 * quota - is never cached, so a transient outage does not pin a bad answer for
 * the whole TTL.
 *
 * Bounded by entry count so a long session cannot grow it without limit.
 */
const CACHE_TTL_MS = 30 * 60 * 1000
const CACHE_MAX = 120
const responseCache = new Map()

function cacheRead(key) {
  const entry = responseCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at >= CACHE_TTL_MS) {
    responseCache.delete(key)
    return undefined
  }
  responseCache.delete(key)
  responseCache.set(key, entry)
  return entry.value
}

function cacheWrite(key, value) {
  responseCache.set(key, { at: Date.now(), value })
  while (responseCache.size > CACHE_MAX) {
    const oldest = responseCache.keys().next()
    if (oldest.done) break
    responseCache.delete(oldest.value)
  }
}

/** Normalises a query so "Blur" and "blur " share one cache slot. */
const normaliseQuery = (q) => String(q ?? '').trim().toLowerCase()

export const catalogueService = {
  /** Which sources are available right now. */
  sources: () => api.get('/catalogue/sources').then((r) => r.data.data.sources),

  /**
   * Unified search across all sources: { tracks, artists, collections }.
   *
   * A cache hit resolves without a network request at all. `config.signal` is
   * accepted so a superseded search can be aborted rather than merely ignored.
   */
  search: ({ q, limit = 20 }, config = {}) => {
    const key = `search:${normaliseQuery(q)}:${limit}`
    const cached = cacheRead(key)
    if (cached) return Promise.resolve(cached)

    return api
      .get('/catalogue/search', { params: { q, limit }, signal: config.signal })
      .then((r) => {
        cacheWrite(key, r.data.data)
        return r.data.data
      })
  },

  /** Home rails: { popular, collections, recent, sources }. */
  home: (limit = 12) => {
    const key = `home:${limit}`
    const cached = cacheRead(key)
    if (cached) return Promise.resolve(cached)

    return api.get('/catalogue/home', { params: { limit } }).then((r) => {
      cacheWrite(key, r.data.data)
      return r.data.data
    })
  },

  /** Resolve the playback route for one track. */
  resolve: (sourceId, sourceTrackId) =>
    api
      .get(`/catalogue/track/${sourceId}/${sourceTrackId}`)
      .then((r) => r.data.data),

  /** Test seam: empties the client cache. */
  __clearCache: () => responseCache.clear(),
}

/** True when a track plays through YouTube's official embedded player. */
export const isRemoteTrack = (track) => track?.sourceId === 'youtube'

/** True when a track is first-party audio we host ourselves. */
export const isLocalTrack = (track) => track?.sourceId === 'local'

/**
 * Formats a duration in seconds as m:ss (or h:mm:ss for long items).
 * Returns '' for unknown durations so the UI can omit it rather than print 0:00.
 */
export function formatDuration(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export default catalogueService