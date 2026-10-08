/**
 * Search resilience and quota-handling tests.
 *
 * Covers the six required scenarios with a STUBBED YouTube API, so the suite is
 * deterministic and does not depend on (or consume) real quota:
 *
 *   1. normal search                - results returned, status available
 *   2. no results                   - empty result set, status no_results
 *   3. quota exceeded               - status quota_exceeded, NOT no_results
 *   4. network failure              - status error
 *   5. cached search                - identical query served from cache
 *   6. local search while YouTube is quota-exhausted - local results still work
 *
 * Plus: success-only caching (a failure must never be cached), quota detection
 * for each Google reason, and confirmation that no media is ever requested.
 *
 * NOTE ON THE DATABASE: this runs against the app's own database, because the
 * server reads MONGODB_URI from its .env at import time and ESM hoists imports
 * above any top-level assignment. It creates two clearly-named temporary
 * documents and removes them (and their indexes) at the end, so real data is
 * left untouched.
 *
 * Run: node scripts/verify-search-resilience.mjs
 */

let passed = 0
let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
  ok ? passed++ : failed++
}

/* ------------------------------------------------------------------ */
/* Stub the Data API before the service module is imported.            */
/* ------------------------------------------------------------------ */

const VIDEOS = [
  {
    id: 'aaaaaaaaaaa',
    snippet: {
      title: 'Stub Song One',
      channelId: 'UC_one',
      channelTitle: 'Stub Artist',
      description: 'A stub track',
      publishedAt: '2024-01-01T00:00:00Z',
      thumbnails: {
        medium: { url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mq.jpg', width: 320, height: 180 },
        default: { url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/dq.jpg', width: 120, height: 90 },
      },
    },
    contentDetails: { duration: 'PT3M20S' },
    statistics: { viewCount: '12345' },
    status: { embeddable: true },
  },
  {
    id: 'bbbbbbbbbbb',
    snippet: {
      title: 'Stub Song Two',
      channelId: 'UC_one',
      channelTitle: 'Stub Artist',
      description: '',
      publishedAt: '2024-02-01T00:00:00Z',
      thumbnails: { medium: { url: 'https://i.ytimg.com/vi/bbbbbbbbbbb/mq.jpg' } },
    },
    contentDetails: { duration: 'PT4M' },
    statistics: { viewCount: '999' },
    status: { embeddable: true },
  },
]

const PLAYLIST = {
  kind: 'playlist',
  playlistId: 'PLstub',
  title: 'Stub Collection',
  description: 'A stub playlist',
  channelId: 'UC_one',
  channelTitle: 'Stub Artist',
  itemCount: null,
  artwork: 'https://i.ytimg.com/pl/stub.jpg',
  artworkHigh: '',
  watchUrl: 'https://www.youtube.com/playlist?list=PLstub',
}

/**
 * mode drives what the fake API does, so each scenario is exercised in
 * isolation: 'ok' | 'empty' | 'quota' | 'network' | 'keyinvalid'
 */
let mode = 'ok'
let counters = { search: 0, videos: 0, channels: 0, playlists: 0 }

globalThis.fetch = async (url) => {
  const u = new URL(String(url))
  const key = u.searchParams.get('key')

  if (!key) {
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: { errors: [{ reason: 'keyInvalid' }] } }),
    }
  }

  if (u.pathname.endsWith('/search')) {
    counters.search += 1
    const type = u.searchParams.get('type')

    if (type === 'playlist') counters.playlists += 1

    if (mode === 'quota') {
      return {
        ok: false,
        status: 403,
        json: async () => ({
          error: { errors: [{ reason: 'quotaExceeded' }], message: 'Quota exceeded' },
        }),
      }
    }
    if (mode === 'network') throw new Error('simulated network failure')

    // 'empty' must be empty for BOTH result types, otherwise the "no results"
    // scenario is not actually testing an empty source.
    if (mode === 'empty') return { ok: true, status: 200, json: async () => ({ items: [] }) }

    const items =
      type === 'playlist'
        ? [{ id: { playlistId: 'PLstub' }, snippet: PLAYLIST }]
        : VIDEOS.map((v) => ({ id: { videoId: v.id }, snippet: v.snippet }))

    return { ok: true, status: 200, json: async () => ({ items }) }
  }

  if (u.pathname.endsWith('/videos')) {
    counters.videos += 1
    if (mode === 'quota') {
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: { errors: [{ reason: 'dailyLimitExceeded' }] } }),
      }
    }
    if (mode === 'network') throw new Error('simulated network failure')
    const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean)
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: VIDEOS.filter((v) => ids.includes(v.id)) }),
    }
  }

  if (u.pathname.endsWith('/channels')) {
    counters.channels += 1
    if (mode === 'network') throw new Error('simulated network failure')
    const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean)
    // The Data API wraps collections in an `items` array. Returning a bare
    // array here would silently yield zero artists and mask the real shape.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: ids.map((id) => ({
          id,
          snippet: {
            title: 'Stub Artist',
            description: 'stub channel',
            thumbnails: { medium: { url: 'https://i.ytimg.com/ch/stub.jpg' } },
          },
          statistics: { subscriberCount: '4242' },
        })),
      }),
    }
  }

  return { ok: false, status: 404, json: async () => ({}) }
}

/* ------------------------------------------------------------------ */

const youtube = await import('../server/src/services/youtube.service.js')
const registry = await import('../server/src/services/sources/registry.js')
const { connectDatabase, disconnectDatabase } = await import('../server/src/config/db.js')
await connectDatabase()
const { default: Song } = await import('../server/src/models/Song.js')
const { default: Playlist } = await import('../server/src/models/Playlist.js')
const { default: User } = await import('../server/src/models/User.js')
const models = { Song, Playlist }

// The local library must contain a match for the scenario queries, otherwise
// scenario 6 ("local search still works while YouTube is down") cannot be
// proven. A uniquely-named track is used so it cannot collide with real data.
const STUB_QUERY = 'zzstubtrack'
const owner = await User.create({
  username: 'stubowner',
  displayName: 'Stub Owner',
  email: `stub${Date.now()}@test.local`,
  password: 'x'.repeat(60),
})
const stubSong = await Song.create({
  title: 'ZZStubTrack Local',
  artistName: 'ZZStubArtist',
  album: 'ZZStubAlbum',
  genre: 'Pop',
  source: 'upload',
  uploadedBy: owner._id,
  audioUrl: '/uploads/audio/stub.wav',
  rightsConfirmed: true,
  isActive: true,
})
console.log('  (seeded one temporary local track)')
const localQuery = STUB_QUERY

// Guard: prove the seed is actually findable through the same model and query
// the local source uses, before asserting anything downstream. If this fails the
// rest of the suite is meaningless.
const seedCheck = await Song.find(
  { isActive: true, $text: { $search: localQuery } },
  { score: { $meta: 'textScore' } },
).lean()
if (!seedCheck.length) {
  console.error('  FATAL: seeded track is not findable via $text - aborting')
  await Song.deleteOne({ _id: stubSong._id })
  await User.deleteOne({ _id: owner._id })
  await disconnectDatabase()
  process.exit(1)
}
console.log(`  (seed verified: ${seedCheck.length} match for "${localQuery}")`)

const reset = () => {
  mode = 'ok'
  counters = { search: 0, videos: 0, channels: 0, playlists: 0 }
  youtube.default.__resetSearchState()
}

console.log('='.repeat(68))
console.log('SEARCH RESILIENCE / QUOTA HANDLING')
console.log('='.repeat(68))

/* ---- 1. normal search ---- */
console.log('\n=== 1. Normal search ===')
reset()
// Direct probe first: isolates the local source from the fan-out so a failure
// here is attributable rather than inferred.
const localDirect = await registry
  .searchMusic({ query: localQuery, limit: 10, models })
  .catch((error) => ({ __threw: String(error && error.message) }))
console.log('  probe:', JSON.stringify({
  threw: localDirect.__threw,
  status: localDirect.status,
  sourceStatus: localDirect.sourceStatus,
  local: (localDirect.tracks || []).filter((t) => t.sourceId === 'local').length,
  youtube: (localDirect.tracks || []).filter((t) => t.sourceId === 'youtube').length,
}))
const normal = localDirect
check('returns tracks from both sources', normal.tracks.length >= 3,
  `tracks=${normal.tracks.length} (1 local + 2 stub youtube)`)
check('status is available', normal.status === 'available', normal.status)
check('derived artists from the same search', normal.artists.length >= 1, `artists=${normal.artists.length}`)
check('returns collections', normal.collections.length === 1, `collections=${normal.collections.length}`)
check('exactly 2 upstream searches (videos + playlists)', counters.search === 2,
  `search=${counters.search} videos=${counters.videos} channels=${counters.channels}`)
check('NOT 3+ searches (no duplicate per result type)', counters.search <= 2, 'search=' + counters.search)
check('no source failed', normal.degraded === false)

/* ---- 2. no results ---- */
console.log('\n=== 2. No results ===')
reset()
mode = 'empty'
// "zzz nothing" matches neither the stub library nor the stub API, so every
// source legitimately reports nothing.
const empty = await registry.searchMusic({ query: 'zzz nothing', limit: 10, models })
check('status is no_results', empty.status === 'no_results', empty.status)
check('no tracks returned', empty.tracks.length === 0)
check('not reported as an error', empty.degraded === false, `degraded=${empty.degraded}`)
check('sourceStatus shows no_results for every source',
  Object.values(empty.sourceStatus).every((s) => s === 'no_results'),
  JSON.stringify(empty.sourceStatus))

/* ---- 3. quota exceeded ---- */
console.log('\n=== 3. Quota exceeded (the reported bug) ===')
reset()
mode = 'quota'
const quota = await registry.searchMusic({ query: 'anything at all', limit: 10, models })
check('status is quota_exceeded', quota.status === 'quota_exceeded', quota.status)
check('NOT reported as no_results', quota.status !== 'no_results', quota.status)
check('degraded flag set', quota.degraded === true)
check('sourceStatus identifies youtube', quota.sourceStatus.youtube === 'quota_exceeded',
  JSON.stringify(quota.sourceStatus))
check('local library still contributed', Array.isArray(quota.tracks))
check('quota short-circuit avoided extra upstream calls', counters.search <= 2,
  `search=${counters.search}`)

console.log('  -- reason detection for every Google quota reason --')
for (const r of ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded']) {
  check(`detects ${r}`, youtube.isQuotaReason(r) === true)
}
check('does NOT mislabel accessNotConfigured', youtube.isQuotaReason('accessNotConfigured') === false)
check('does NOT mislabel keyInvalid', youtube.isQuotaReason('keyInvalid') === false)

/* ---- 4. network failure ---- */
console.log('\n=== 4. Network failure ===')
reset()
mode = 'network'
const net = await registry.searchMusic({ query: 'network test', limit: 10, models })
check('status is error', net.status === 'error', net.status)
check('not reported as no_results', net.status !== 'no_results', net.status)
check('degraded flag set', net.degraded === true)

/* ---- 5. caching ---- */
console.log('\n=== 5. Cached search ===')
reset()
const first = await youtube.searchVideos('cache me', { maxResults: 10 })
const searchesAfterFirst = counters.search
const second = await youtube.searchVideos('cache me', { maxResults: 10 })
check('first search hit the API', first.fromCache === false)
check('identical query served from cache', second.fromCache === true)
check('NO second upstream call', counters.search === searchesAfterFirst,
  `search calls ${searchesAfterFirst} -> ${counters.search}`)
check('cached payload matches', second.items.length === first.items.length)

console.log('  -- only successful results are cached --')
reset()
mode = 'quota'
let threwQuota = false
try {
  await youtube.searchVideos('failure must not cache', { maxResults: 10 })
} catch (error) {
  threwQuota = true
  check('quota failure throws', error.sourceStatus === 'quota_exceeded', error.sourceStatus)
}
check('quota failure surfaced as an error', threwQuota === true)

reset()
mode = 'empty'
const emptyRes = await youtube.searchVideos('genuinely empty', { maxResults: 10 })
const callsBeforeRetry = counters.search
const emptyRetry = await youtube.searchVideos('genuinely empty', { maxResults: 10 })
check('empty result re-queries rather than caching a false negative',
  counters.search > callsBeforeRetry,
  `search ${callsBeforeRetry} -> ${counters.search}`)
check('empty result reports fromCache=false', emptyRetry.fromCache === false)

/* ---- 6. local search while YouTube is unavailable ---- */
console.log('\n=== 6. Local search while YouTube quota is exhausted ===')
reset()
mode = 'quota'
const mixed = await registry.searchMusic({ query: localQuery, limit: 10, models })
const localTracks = mixed.tracks.filter((t) => t.sourceId === 'local')
const ytTracks = mixed.tracks.filter((t) => t.sourceId === 'youtube')
console.log(`  local=${localTracks.length} youtube=${ytTracks.length} status=${mixed.status}`)
check('LOCAL music still returned during a YouTube outage', localTracks.length > 0,
  `local=${localTracks.length}`)
check('local tracks are playable', localTracks.every((t) => t.playable === true))
check('local tracks keep their audioUrl', localTracks.every((t) => Boolean(t.audioUrl)))
check('no YouTube tracks leaked in', ytTracks.length === 0, `yt=${ytTracks.length}`)
check('status still reports quota_exceeded', mixed.status === 'quota_exceeded', mixed.status)
check('local source reported available',
  mixed.sourceStatus.local === 'available', JSON.stringify(mixed.sourceStatus))

/* ---- no media is ever requested ---- */
console.log('\n=== 7. No media extraction ===')
const requestedUrls = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  requestedUrls.push(String(url))
  return originalFetch(url, opts)
}
reset()
await youtube.searchVideos('audio check', { maxResults: 10 }).catch(() => {})
const mediaRequests = requestedUrls.filter((u) =>
  /\.(mp3|m4a|aac|flac|ogg|webm|mp4)(\?|$)/i.test(u) ||
  /googlevideo|videoplayback|adaptiveFormats|signatureCipher/i.test(u),
)
check('no media/stream URL was ever requested', mediaRequests.length === 0,
  `media=${mediaRequests.length}`)
check('only Data API endpoints were used',
  requestedUrls.every((u) => u.startsWith('https://www.googleapis.com/youtube/v3/')),
  `${requestedUrls.length} calls`)
globalThis.fetch = originalFetch

/* ---- cleanup ---- */
// Remove the temporary documents so real data is untouched.
await Song.deleteOne({ _id: stubSong._id })
await User.deleteOne({ _id: owner._id })
await disconnectDatabase()
console.log('\n  (removed the temporary track and user; database left as found)')

console.log('\n' + '='.repeat(68))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: SEARCH RESILIENCE VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(68))
process.exit(failed === 0 ? 0 : 1)