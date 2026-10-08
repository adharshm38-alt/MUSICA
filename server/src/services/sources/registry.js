/**
 * Source Manager.
 *
 * One place that knows which music sources exist, whether each is available
 * right now, in what order they should be consulted, and how playback is
 * resolved for a normalized Track.
 *
 * Design rules:
 *  - Adding a source must not require touching Home, Search or the player.
 *  - A source that is unconfigured or failing must never break the page; the
 *    manager degrades to whatever is still available.
 *  - resolvePlayback() only ever returns a reference to an AUTHORIZED playback
 *    route (a first-party audio file, or YouTube's official embedded player).
 *    No source here may extract, download, rip, cache or separate third-party
 *    audio, and none of them returns a stream URL.
 */

import config from '../../config/env.js'
import * as youtube from '../youtube.service.js'
const { youtubeLog } = youtube

/**
 * Source status vocabulary. Shared with the client so the UI can say precisely
 * what happened instead of collapsing every failure into "No results".
 */
export const SOURCE_STATUS = youtube.SOURCE_STATUS
import {
  SOURCE_LOCAL,
  SOURCE_YOUTUBE,
  PLAYBACK_LOCAL_AUDIO,
  PLAYBACK_YOUTUBE_EMBED,
  trackFromLocal,
  trackFromYouTube,
  artistFromYouTube,
  collectionFromYouTube,
  collectionFromLocal,
  groupArtistsFromTracks,
} from './normalize.js'

/* ------------------------------------------------------------------ */
/* Local library source: first-party, user-owned music in MongoDB      */
/* ------------------------------------------------------------------ */

const localSource = {
  id: SOURCE_LOCAL,
  name: 'MUSICA Library',
  kind: 'local',

  // Consulted first: it is the only source whose audio we host, and it is
  // always available once the database is up.
  priority: 100,

  capabilities: {
    search: true,
    artists: true,
    collections: true,
    trending: true,
    regions: false,
    offline: true,
  },

  isAvailable() {
    return true
  },

  /** Tracks from the local library. Injected models keep this module testable. */
  async search({ query, limit = 20, models }) {
    const { Song } = models
    const trimmed = (query || '').trim()
    if (!trimmed) return []

    const docs = await Song.find(
      { isActive: true, $text: { $search: trimmed } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean()

    return docs.map((doc) => trackFromLocal(doc))
  },

  async trending({ limit = 12, models }) {
    const { Song } = models
    const docs = await Song.find({ isActive: true })
      .sort({ playCount: -1, likeCount: -1 })
      .limit(limit)
      .lean()
    return docs.map((doc) => trackFromLocal(doc))
  },

  async recent({ limit = 12, models }) {
    const { Song } = models
    const docs = await Song.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    return docs.map((doc) => trackFromLocal(doc))
  },

  async collections({ limit = 12, models }) {
    const { Playlist } = models
    const docs = await Playlist.find({ isPublic: true })
      .sort({ playCount: -1, updatedAt: -1 })
      .limit(limit)
      .populate('owner', 'displayName username')
      .lean()

    return docs.map((doc) =>
      collectionFromLocal(doc, {
        ownerName: doc.owner?.displayName || doc.owner?.username || '',
        songCount: doc.songs?.length ?? 0,
      }),
    )
  },
}

/* ------------------------------------------------------------------ */
/* YouTube source: discovery metadata + official embedded playback     */
/* ------------------------------------------------------------------ */

/**
 * Compliance boundary for this source, stated once and enforced by the shape of
 * the adapter: it exposes video/channel/playlist METADATA and an embed
 * reference. It has no code path that could obtain audio.
 */
const youtubeSource = {
  id: SOURCE_YOUTUBE,
  name: 'YouTube Music',
  kind: 'remote',

  // Lower priority than the local library: MUSICA's own music comes first.
  priority: 50,

  capabilities: {
    search: true,
    artists: true,
    collections: true,
    trending: true,
    // The Data API exposes no language/region facet, so worldwide discovery is
    // driven by query text rather than an API filter.
    regions: false,
    offline: false,
  },

  isAvailable() {
    return youtube.isConfigured()
  },

  /**
   * Music search. Returns normalized tracks, artists and collections from the
   * real API. A failure here is contained by the manager.
   */
  async search({ query, limit = 20 }) {
    const trimmed = (query || '').trim()
    if (!trimmed) return { tracks: [], artists: [], collections: [] }

    // Videos come first because one search.list feeds Songs AND the Artist
    // cards (channels come from the same results), and Collections reuse the
    // second call. Running them together keeps it to two upstream searches
    // rather than one per result type.
    const [{ items: videos }, playlists] = await Promise.all([
      youtube.searchVideos(trimmed, { maxResults: limit }),
      // Playlists are best-effort: failing to list collections must not blank
      // out the songs. A quota failure on the video search surfaces through the
      // video call above, so suppressing it here is safe.
      youtube
        .searchPlaylists(trimmed, { maxResults: Math.min(limit, 10) })
        .catch(() => []),
    ])

    const tracks = videos.map((v) => trackFromYouTube(v)).filter(Boolean)

    let artists = []
    try {
      const channels = await youtube.getArtistsFromVideos(videos, { maxArtists: 8 })
      artists = channels.map((c) => artistFromYouTube(c, {
        trackCount: videos.filter((v) => v.channelId === c.channelId).length,
        topTrackId: videos.find((v) => v.channelId === c.channelId)?.videoId || null,
        topTrackTitle: videos.find((v) => v.channelId === c.channelId)?.title || null,
      }))
    } catch {
      // Fall back to grouping on the video metadata we already hold, so the
      // Artists rail still renders something truthful.
      artists = groupArtistsFromTracks(tracks, { maxArtists: 8 })
    }

    return {
      tracks,
      artists,
      collections: playlists.map(collectionFromYouTube).filter(Boolean),
    }
  },

  async trending({ limit = 12 }) {
    const videos = await youtube.trendingMusic(limit)
    return videos.map((v) => trackFromYouTube(v)).filter(Boolean)
  },

  async collections() {
    return []
  },
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

const SOURCES = [localSource, youtubeSource]

/** Sources ordered by priority, highest first. */
export function getSources({ onlyAvailable = true } = {}) {
  return SOURCES
    .filter((source) => (onlyAvailable ? source.isAvailable() : true))
    .sort((a, b) => b.priority - a.priority)
}

export function getSource(id) {
  return SOURCES.find((source) => source.id === id) || null
}

/** Public description of every source, for the client and for diagnostics. */
export function describeSources() {
  return SOURCES.map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.kind,
    available: source.isAvailable(),
    priority: source.priority,
    capabilities: source.capabilities,
  }))
}

/**
 * Runs `fn` against each available source in priority order and keeps whatever
 * succeeds. One failing or unconfigured source must never take down the page.
 *
 * @param {string} method the source method to call
 * @param {object} params passed straight through
 * @param {{models?: object, tolerance?: number}} [opts]
 */
async function fanOut(method, params, { models } = {}) {
  const results = []
  const failures = []

  const ordered = getSources()
  const settled = await Promise.allSettled(
    // Return the RAW source value. Wrapping it in { sourceId, value } here and
    // then reading entry.value as the payload silently handed searchMusic an
    // object instead of the array, so every source looked empty.
    ordered.map((source) => source[method]({ ...params, models })),
  )

  // Promise.allSettled preserves input order, so each outcome pairs back to the
  // source that produced it.
  settled.forEach((entry, index) => {
    const sourceId = ordered[index].id
    if (entry.status === 'fulfilled') {
      results.push({ sourceId, value: entry.value })
      return
    }
    // Classify the failure so the caller can tell "quota spent" from "network
    // down" from "not configured". The source service attaches sourceStatus;
    // anything without one is a generic error.
    const reason = entry.reason
    failures.push({
      sourceId,
      status: reason?.sourceStatus || SOURCE_STATUS.ERROR,
      message: String(reason?.message || reason || 'Unknown error'),
    })
  })

  // Restore priority order, which Promise.allSettled does not guarantee.
  results.sort((a, b) => {
    const rank = (id) => ordered.findIndex((s) => s.id === id)
    return rank(a.sourceId) - rank(b.sourceId)
  })

  return { results, failures }
}

/**
 * Unified music search across every available source.
 *
 * Each source is classified independently so the UI can distinguish:
 *   - available       : it answered
 *   - no_results      : it answered, and genuinely has nothing
 *   - quota_exceeded  : the upstream quota ran out (not an empty result)
 *   - unavailable     : not configured
 *   - error           : network / upstream failure
 *
 * A source that failed never removes another source's results: local music keeps
 * working while an external source is down.
 *
 * @returns {{tracks, artists, collections, sourceStatus, status, degraded}}
 */
export async function searchMusic({ query, limit = 20, models }) {
  const { results, failures } = await fanOut('search', { query, limit }, { models })

  const tracks = []
  const artists = []
  const collections = []
  const sourceStatus = {}

  // Record every source's outcome, starting from the ones that failed.
  for (const failure of failures) {
    const id = failure.sourceId || 'unknown'
    sourceStatus[id] = failure.status
  }

  for (const { sourceId, value } of results) {
    if (sourceId === SOURCE_YOUTUBE) {
      tracks.push(...(value.tracks || []))
      artists.push(...(value.artists || []))
      collections.push(...(value.collections || []))
    } else {
      tracks.push(...(Array.isArray(value) ? value : value.tracks || []))
      if (value.artists) artists.push(...value.artists)
      if (value.collections) collections.push(...value.collections)
    }
  }

  for (const { sourceId, value } of results) {
    const produced =
      sourceId === SOURCE_YOUTUBE
        ? (value.tracks?.length || 0) + (value.artists?.length || 0) + (value.collections?.length || 0)
        : (Array.isArray(value) ? value.length : 0)
    sourceStatus[sourceId] = produced > 0 ? SOURCE_STATUS.AVAILABLE : SOURCE_STATUS.NO_RESULTS
  }

  // Overall status, worst-first: a quota problem is more urgent than an outage,
  // and an outage is more urgent than "nothing matched".
  const statuses = Object.values(sourceStatus)
  let status = SOURCE_STATUS.AVAILABLE
  if (statuses.includes(SOURCE_STATUS.QUOTA_EXCEEDED)) status = SOURCE_STATUS.QUOTA_EXCEEDED
  else if (statuses.includes(SOURCE_STATUS.ERROR)) status = SOURCE_STATUS.ERROR
  else if (statuses.includes(SOURCE_STATUS.UNAVAILABLE)) status = SOURCE_STATUS.UNAVAILABLE
  else if (statuses.length && statuses.every((s) => s === SOURCE_STATUS.NO_RESULTS)) {
    status = SOURCE_STATUS.NO_RESULTS
  }

  // No result at all and no external source spoke for itself -> a real miss.
  if (!tracks.length && !artists.length && !collections.length) {
    if (status === SOURCE_STATUS.AVAILABLE) status = SOURCE_STATUS.NO_RESULTS
  }

  return {
    tracks,
    artists,
    collections,
    sourceStatus,
    status,
    degraded: statuses.some((s) => s !== SOURCE_STATUS.AVAILABLE && s !== SOURCE_STATUS.NO_RESULTS),
  }
}

/**
 * Assembles the Home catalogue from every available source.
 *
 * Deliberately issued as a small, fixed number of parallel calls rather than
 * one per rail per source, so opening Home cannot fan out into dozens of
 * upstream requests.
 */
/**
 * Cache for the assembled Home catalogue.
 *
 * Home is the most-visited page, and every rail in it is derived from the same
 * handful of upstream calls. Without this, every mount of the Home page - and
 * every React re-render that refetched - repeated the work and spent quota for
 * data that had not changed in the last few minutes.
 *
 * Keyed per viewer because "recently played" is viewer-specific. Anonymous
 * visitors share the `anon` bucket.
 */
const HOME_TTL_MS = 10 * 60 * 1000
const homeCache = new Map()
const HOME_CACHE_MAX = 100

function homeCacheKey(viewer, limit) {
  return `${viewer ? String(viewer._id || viewer) : 'anon'}:${limit}`
}

function readHomeCache(key) {
  const entry = homeCache.get(key)
  if (!entry) {
    youtubeLog.homeCacheMiss()
    return undefined
  }
  if (Date.now() - entry.at >= HOME_TTL_MS) {
    homeCache.delete(key)
    youtubeLog.homeCacheMiss()
    return undefined
  }
  homeCache.delete(key)
  homeCache.set(key, entry)
  youtubeLog.homeCacheHit()
  return entry.value
}

function writeHomeCache(key, value) {
  homeCache.set(key, { at: Date.now(), value })
  while (homeCache.size > HOME_CACHE_MAX) {
    const oldest = homeCache.keys().next()
    if (oldest.done) break
    homeCache.delete(oldest.value)
  }
}

/** Test seam: drops the Home cache. */
export function __resetHomeCache() {
  homeCache.clear()
}

export async function getHomeCatalogue({ models, viewer, limit = 12 }) {
  const cacheKey = homeCacheKey(viewer, limit)
  const cachedHome = readHomeCache(cacheKey)
  if (cachedHome) return cachedHome

  const sources = getSources()

  // Every rail below is derived from this one call per source. Previously
  // `trending` was invoked three times (once for the Popular rail, once for
  // Collections, and again inside the Artists job), which tripled the upstream
  // cost of loading Home for identical data.
  const trendingBySource = new Map()
  const collectionsBySource = new Map()

  await Promise.all(
    sources.map(async (source) => {
      const [tracks, cols] = await Promise.all([
        source.trending({ limit, models }).catch(() => []),
        source.collections({ limit: 8, models }).catch(() => []),
      ])
      trendingBySource.set(source.id, tracks)
      collectionsBySource.set(source.id, cols)
    }),
  )

  const tracks = []
  for (const source of sources) tracks.push(...(trendingBySource.get(source.id) || []))

  const jobs = []

  // Artists are derived from the same trending tracks that feed the Popular
  // rail, then enriched with real channel metadata where the source provides
  // it. Deriving them here means Home costs no extra upstream request for the
  // local library, and at most one channels.list (1 unit) for YouTube.
  jobs.push(
    (async () => {
      let artists = []
      const ytTracks = tracks.filter((t) => t.sourceId === SOURCE_YOUTUBE)
      if (ytTracks.length) {
        try {
          const channels = await youtube.getArtistsFromVideos(
            ytTracks.map((t) => ({
              videoId: t.sourceTrackId,
              channelId: t.artistId,
              channelTitle: t.artist,
            })),
            { maxArtists: 10 },
          )
          artists = channels
            .map((c) =>
              artistFromYouTube(c, {
                trackCount: ytTracks.filter((t) => t.artistId === c.channelId).length,
                topTrackId: ytTracks.find((t) => t.artistId === c.channelId)?.sourceTrackId,
                topTrackTitle: ytTracks.find((t) => t.artistId === c.channelId)?.title,
              }),
            )
            // Attach each artist's own channel avatar to their derived card.
            .map((a) => {
              const t = ytTracks.find((x) => x.artistId === a.sourceArtistId)
              return t?.youtubeChannelArtwork ? { ...a, artwork: t.youtubeChannelArtwork } : a
            })
        } catch {
          artists = groupArtistsFromTracks(tracks, { maxArtists: 10 })
        }
      } else {
        artists = groupArtistsFromTracks(tracks, { maxArtists: 10 })
      }
      return ['artists', SOURCE_YOUTUBE, artists]
    })().catch(() => ['artists', SOURCE_YOUTUBE, []]),
  )

  // Recently played is viewer-specific and local-only.
  if (viewer) {
    jobs.push(
      (async () => {
        const { ListeningHistory } = models
        const rows = await ListeningHistory.find({ user: viewer })
          .sort({ lastPlayedAt: -1 })
          .limit(limit)
          .populate({ path: 'song', match: { isActive: true } })
          .lean()
        const seen = new Set()
        const tracks = []
        for (const row of rows) {
          if (!row.song) continue
          const id = String(row.song._id)
          if (seen.has(id)) continue
          seen.add(id)
          const { trackFromLocal } = await import('./normalize.js')
          tracks.push(trackFromLocal(row.song))
        }
        return ['recent', SOURCE_LOCAL, tracks]
      })().catch(() => ['recent', SOURCE_LOCAL, []]),
    )
  }

  const settled = await Promise.allSettled(jobs)
  const buckets = {
    popular: tracks,
    collections: [...collectionsBySource.values()].flat(),
    recent: [],
    artists: [],
  }

  for (const entry of settled) {
    if (entry.status !== 'fulfilled') continue
    const [bucket, , value] = entry.value
    if (Array.isArray(value)) buckets[bucket].push(...value)
  }

  // Deduplicate across sources, keeping first occurrence (priority order).
  const dedupe = (items, keyFn) => {
    const seen = new Set()
    return items.filter((item) => {
      const key = keyFn(item)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const payload = {
    popular: dedupe(buckets.popular, (t) => `${t.sourceId}:${t.sourceTrackId}`).slice(0, limit),
    collections: dedupe(buckets.collections, (c) => c.id).slice(0, 10),
    recent: dedupe(buckets.recent, (t) => `${t.sourceId}:${t.sourceTrackId}`).slice(0, limit),
    artists: dedupe(buckets.artists, (a) => a.id).slice(0, 12),
    sources: sources.map((s) => ({ id: s.id, name: s.name, available: s.isAvailable() })),
  }

  writeHomeCache(cacheKey, payload)
  return payload
}

/**
 * Resolves how a normalized Track should be played.
 *
 * This is the single place that decides playback. It returns a ROUTE, never a
 * stream URL:
 *   - first-party track  -> our own audio file
 *   - YouTube track      -> YouTube's official embedded player
 *
 * @returns {{playable: boolean, playback: string, url?: string, videoId?: string, reason?: string}}
 */
export function resolvePlayback(track) {
  if (!track) {
    return { playable: false, reason: 'Nothing selected.' }
  }

  if (track.sourceId === SOURCE_YOUTUBE || track.playback === PLAYBACK_YOUTUBE_EMBED) {
    const videoId = track.youtubeVideoId || track.sourceTrackId
    if (!videoId) {
      return {
        playable: false,
        reason: 'Playback is currently unavailable for this source.',
      }
    }
    if (track.playable === false || track.embeddable === false) {
      return {
        playable: false,
        reason: 'The creator has disabled embedding for this video.',
      }
    }
    // Hand back the video id only. The client mounts YouTube's official player;
    // we never ask for, receive or store an audio stream.
    return {
      playable: true,
      playback: PLAYBACK_YOUTUBE_EMBED,
      videoId,
      url: `https://www.youtube-nocookie.com/embed/${videoId}`,
    }
  }

  if (track.playback === PLAYBACK_LOCAL_AUDIO && track.playbackUrl) {
    return {
      playable: true,
      playback: PLAYBACK_LOCAL_AUDIO,
      url: track.playbackUrl,
    }
  }

  return {
    playable: false,
    reason: 'Playback is currently unavailable for this source.',
  }
}

export default {
  getSources,
  getSource,
  describeSources,
  searchMusic,
  getHomeCatalogue,
  resolvePlayback,
  SOURCE_LOCAL,
  SOURCE_YOUTUBE,
}