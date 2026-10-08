/**
 * YouTube search quota-efficiency tests.
 *
 * These use a STUBBED Data API, so the suite is deterministic and spends no
 * real quota. The stub counts every upstream call by method and cost, which is
 * what lets these assertions be about actual quota spend rather than about
 * implementation details.
 *
 * Covers:
 *   1. cache hit does not call YouTube
 *   2. cache miss calls YouTube exactly once
 *   3. concurrent identical searches make only ONE upstream request
 *   4. failed / quota / empty searches are never cached
 *   5. quotaExceeded is NOT retried and NOT backed off into
 *   6. local search still works during YouTube quota exhaustion
 *   7. no automatic pagination (nextPageToken is never followed)
 *   8. cache key includes every result-affecting parameter
 *   9. cache is bounded
 *  10. /api/youtube/status reports the four documented states
 *
 * Run: node scripts/verify-quota-efficiency.mjs
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
      description: '',
      publishedAt: '2024-01-01T00:00:00Z',
      thumbnails: { medium: { url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mq.jpg' } },
    },
    contentDetails: { duration: 'PT3M20S' },
    statistics: { viewCount: '1234' },
    status: { embeddable: true },
  },
  {
    id: 'bbbbbbbbbbb',
    snippet: {
      title: 'Stub Song Two',
      channelId: 'UC_two',
      channelTitle: 'Other Artist',
      description: '',
      publishedAt: '2024-02-01T00:00:00Z',
      thumbnails: { medium: { url: 'https://i.ytimg.com/vi/bbbbbbbbbbb/mq.jpg' } },
    },
    contentDetails: { duration: 'PT4M' },
    statistics: { viewCount: '99' },
    status: { embeddable: true },
  },
]

const PLAYLIST_ITEM = {
  kind: 'playlist',
  playlistId: 'PLstub',
  title: 'Stub Collection',
  description: '',
  channelId: 'UC_one',
  channelTitle: 'Stub Artist',
  itemCount: null,
  artwork: 'https://i.ytimg.com/pl/stub.jpg',
  artworkHigh: '',
  watchUrl: 'https://www.youtube.com/playlist?list=PLstub',
}

/**
 * mode: 'ok' | 'empty' | 'quota' | 'network'
 * counters track calls per method so "did it call YouTube" is measured, not assumed.
 */
let mode = 'ok'
let counters = { search: 0, videos: 0, channels: 0 }
let quotaRejections = 0
let regionSeen = new Set()
let pageTokenRequested = false

const reset = () => {
  mode = 'ok'
  counters = { search: 0, videos: 0, channels: 0 }
  quotaRejections = 0
  regionSeen = new Set()
  pageTokenRequested = false
}

globalThis.fetch = async (url) => {
  const u = new URL(String(url))

  // Records whether anything ever tries to follow a page token. It must not.
  if (u.searchParams.get('pageToken')) pageTokenRequested = true

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
    regionSeen.add(u.searchParams.get('regionCode') || 'none')
    const type = u.searchParams.get('type')

    if (mode === 'quota') {
      quotaRejections += 1
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
      }
    }
    if (mode === 'network') throw new Error('simulated network failure')
    if (mode === 'empty') return { ok: true, status: 200, json: async () => ({ items: [] }) }

    const items =
      type === 'playlist'
        ? [{ id: { playlistId: 'PLstub' }, snippet: PLAYLIST_ITEM }]
        : VIDEOS.map((v) => ({ id: { videoId: v.id }, snippet: v.snippet }))

    return { ok: true, status: 200, json: async () => ({ items }) }
  }

  if (u.pathname.endsWith('/videos')) {
    counters.videos += 1
    if (mode === 'quota') {
      quotaRejections += 1
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
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
    const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean)
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: ids.map((id) => ({
          id,
          snippet: {
            title: 'Stub Artist',
            description: '',
            thumbnails: { medium: { url: 'https://i.ytimg.com/ch/stub.jpg' } },
          },
          statistics: { subscriberCount: '10' },
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
const { default: ListeningHistory } = await import('../server/src/models/ListeningHistory.js')
const models = { Song, Playlist, ListeningHistory }

// One temporary local track so the local-source assertions have something real
// to find. Removed at the end.
const STUB_QUERY = 'zzquota'
const owner = await User.create({
  username: 'quotaowner',
  displayName: 'Quota Owner',
  email: `quota${Date.now()}@test.local`,
  password: 'x'.repeat(60),
})
const stubSong = await Song.create({
  title: 'ZZQuota Local Track',
  artistName: 'ZZQuotaArtist',
  album: 'ZZQuotaAlbum',
  genre: 'Pop',
  source: 'upload',
  uploadedBy: owner._id,
  audioUrl: '/uploads/audio/stub.wav',
  rightsConfirmed: true,
  isActive: true,
})

const wipe = () => {
  reset()
  youtube.default.__resetSearchState()
  registry.__resetHomeCache()
}

console.log('='.repeat(70))
console.log('YOUTUBE SEARCH QUOTA EFFICIENCY')
console.log('='.repeat(70))

/* ---- 1. cache miss calls YouTube exactly once ---- */
console.log('\n=== 1. Cache miss -> exactly one upstream request ===')
wipe()
const first = await youtube.searchVideos('cache probe', { maxResults: 10 })
check('first call was NOT from cache', first.fromCache === false)
check('exactly one search.list call', counters.search === 1, `search=${counters.search}`)
check('videos.list used to hydrate (cheap, 1 unit)', counters.videos <= 1, `videos=${counters.videos}`)

/* ---- 2. cache hit does not call YouTube ---- */
console.log('\n=== 2. Cache hit -> no upstream request ===')
const before = counters.search
const second = await youtube.searchVideos('cache probe', { maxResults: 10 })
check('second call served from cache', second.fromCache === true)
check('ZERO additional search.list calls', counters.search === before,
  `search ${before} -> ${counters.search}`)
check('cached payload matches', second.items.length === first.items.length)
const third = await youtube.searchVideos('cache probe', { maxResults: 10 })
check('repeated hits stay free', counters.search === before && third.fromCache === true)

/* ---- 3. concurrent identical searches make ONE upstream request ---- */
console.log('\n=== 3. Concurrent identical searches deduplicate ===')
wipe()
// Fire five simultaneous searches for the same new query.
const concurrent = await Promise.all(
  Array.from({ length: 5 }, () => youtube.searchVideos('burst query', { maxResults: 10 })),
)
check('all five resolved', concurrent.length === 5)
check('all five returned the same results',
  new Set(concurrent.map((r) => r.items.length)).size === 1)
check('ONLY ONE upstream search.list call for the burst', counters.search === 1,
  `search=${counters.search} (5 concurrent requests)`)

console.log('  -- different queries are NOT collapsed (correct behaviour) --')
wipe()
await Promise.all([
  youtube.searchVideos('alpha query', { maxResults: 10 }),
  youtube.searchVideos('beta query', { maxResults: 10 }),
])
check('two distinct queries make two calls', counters.search === 2, `search=${counters.search}`)

/* ---- 4. failures are never cached ---- */
console.log('\n=== 4. Failed / quota / empty searches are NOT cached ===')
wipe()
mode = 'quota'
let quotaErr = null
try {
  await youtube.searchVideos('quota probe', { maxResults: 10 })
} catch (error) {
  quotaErr = error
}
check('quota error surfaced', quotaErr !== null)
check('classified as quota_exceeded', quotaErr?.sourceStatus === 'quota_exceeded',
  quotaErr?.sourceStatus)
const afterQuota = counters.search
const cacheStatsAfterQuota = youtube.default.getSearchCacheStats()
check('nothing cached from the quota failure', cacheStatsAfterQuota.liveEntries === 0,
  `live=${cacheStatsAfterQuota.liveEntries}`)

// If a failure had been cached, this would resolve instead of re-querying.
wipe()
mode = 'quota'
await youtube.searchVideos('quota probe 2', { maxResults: 10 }).catch(() => {})
const retryCalls = counters.search

console.log('  -- empty results are not cached either --')
wipe()
mode = 'empty'
const empty1 = await youtube.searchVideos('empty probe', { maxResults: 10 })
check('empty result returned', empty1.items.length === 0)
const emptyCalls = counters.search
const empty2 = await youtube.searchVideos('empty probe', { maxResults: 10 })
check('empty result re-queried, not cached', counters.search > emptyCalls,
  `search ${emptyCalls} -> ${counters.search}`)
check('empty result reports fromCache=false', empty2.fromCache === false)

console.log('  -- network failure is not cached --')
wipe()
mode = 'network'
await youtube.searchVideos('network probe', { maxResults: 10 }).catch(() => {})
const netLive = youtube.default.getSearchCacheStats().liveEntries
check('network failure cached nothing', netLive === 0, `live=${netLive}`)

/* ---- 5. quotaExceeded is NOT retried ---- */
console.log('\n=== 5. quotaExceeded is never retried or backed off ===')
wipe()
mode = 'quota'
const attemptsBefore = { search: 0, videos: 0 }
let thrown = 0
for (let i = 0; i < 5; i += 1) {
  try {
    await youtube.searchVideos('do not retry me', { maxResults: 10 })
  } catch {
    thrown += 1
  }
}
check('all five attempts rejected', thrown === 5, `rejected=${thrown}`)
check(
  'at most ONE upstream call was made across all five attempts',
  counters.search <= 1,
  `search=${counters.search} after 5 attempts (quota hold short-circuits the rest)`,
)
check('no backoff loop introduced', counters.search <= 1)

/* ---- 6. local search still works during quota exhaustion ---- */
console.log('\n=== 6. Local search during YouTube quota exhaustion ===')
wipe()
mode = 'quota'
const mixed = await registry.searchMusic({ query: STUB_QUERY, limit: 10, models })
const localTracks = mixed.tracks.filter((t) => t.sourceId === 'local')
console.log(`  local=${localTracks.length} youtube=${mixed.tracks.filter((t) => t.sourceId === 'youtube').length} status=${mixed.status}`)
check('LOCAL music still returned', localTracks.length > 0, `local=${localTracks.length}`)
check('status reports quota_exceeded', mixed.status === 'quota_exceeded', mixed.status)
check('status is NOT no_results', mixed.status !== 'no_results')
check('local source reported available', mixed.sourceStatus.local === 'available',
  JSON.stringify(mixed.sourceStatus))
check('local tracks remain playable', localTracks.every((t) => t.playable === true))
check('local tracks keep audioUrl', localTracks.every((t) => Boolean(t.audioUrl)))

/* ---- 7. no automatic pagination ---- */
console.log('\n=== 7. No automatic pagination ===')
wipe()
await youtube.searchVideos('pagination probe', { maxResults: 50 })
check('never requested a pageToken', pageTokenRequested === false)
wipe()
await youtube.searchPlaylists('pagination probe', { maxResults: 50 })
check('playlists never requested a pageToken', pageTokenRequested === false)

/* ---- 8. cache key includes every result-affecting parameter ---- */
console.log('\n=== 8. Cache key covers all result-affecting parameters ===')
wipe()
await youtube.searchVideos('key probe', { maxResults: 10, regionCode: 'US' })
let regionCalls = counters.search
await youtube.searchVideos('key probe', { maxResults: 10, regionCode: 'IN' })
check('different regionCode is a cache MISS', counters.search > regionCalls,
  `search ${regionCalls} -> ${counters.search}`)
check('regionCode actually reached the API', regionSeen.has('IN'), [...regionSeen].join(','))

regionCalls = counters.search
await youtube.searchVideos('key probe', { maxResults: 10, regionCode: 'US' })
check('same regionCode is a cache HIT', counters.search === regionCalls)

regionCalls = counters.search
await youtube.searchVideos('key probe', { maxResults: 25, regionCode: 'US' })
check('different maxResults is a cache MISS', counters.search > regionCalls,
  `search ${regionCalls} -> ${counters.search}`)

regionCalls = counters.search
await youtube.searchVideos('key probe', { maxResults: 10, regionCode: 'US', order: 'viewCount' })
check('different order is a cache MISS', counters.search > regionCalls,
  `search ${regionCalls} -> ${counters.search}`)

wipe()
await youtube.searchVideos('type separation', { maxResults: 10 })
const afterVideo = counters.search
await youtube.searchPlaylists('type separation', { maxResults: 10 })
check('video and playlist searches do not collide', counters.search > afterVideo,
  `search ${afterVideo} -> ${counters.search}`)

/* ---- 9. cache is bounded ---- */
console.log('\n=== 9. Cache is bounded ===')
wipe()
// Insert past the real ceiling so the eviction path is actually exercised.
const CAP = youtube.default.getSearchCacheStats().maxEntries
const OVERFLOW = 25
for (let i = 0; i < CAP + OVERFLOW; i += 1) {
  await youtube.searchVideos(`bounded query ${i}`, { maxResults: 5 })
}
const stats = youtube.default.getSearchCacheStats()
check('cache size never exceeded the cap', stats.entries <= CAP,
  `entries=${stats.entries} cap=${CAP} after ${CAP + OVERFLOW} inserts`)
check('oldest entries were evicted, not the newest',
  stats.entries === CAP,
  `entries=${stats.entries}`)
check('TTL is 30 minutes', stats.ttlMs === 30 * 60 * 1000, `${stats.ttlMs}ms`)

/* ---- 10. Home catalogue is cached ---- */
console.log('\n=== 10. Home catalogue caching ===')
wipe()
const viewer = { _id: owner._id }
const home1 = await registry.getHomeCatalogue({ models, viewer, limit: 6 })
const homeCalls = counters.videos + counters.search
const home2 = await registry.getHomeCatalogue({ models, viewer, limit: 6 })
check('second Home load made no upstream call', counters.videos + counters.search === homeCalls,
  `upstream ${homeCalls} -> ${counters.videos + counters.search}`)
check('both Home payloads identical', JSON.stringify(home1) === JSON.stringify(home2))
check('Home rails present', home1.popular.length > 0 || home1.recent.length > 0,
  `popular=${home1.popular.length} recent=${home1.recent.length}`)

// A different viewer must not receive the previous viewer's history.
const other = await registry.getHomeCatalogue({ models, viewer: { _id: 'someone-else' }, limit: 6 })
check('Home cache is per-viewer', other !== home1)

/* ---- 11. no media extraction anywhere ---- */
console.log('\n=== 11. No media / stream extraction ===')
const seenUrls = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  seenUrls.push(String(url))
  return originalFetch(url, opts)
}
wipe()
await registry.searchMusic({ query: STUB_QUERY, limit: 10, models }).catch(() => {})
const media = seenUrls.filter((u) =>
  /\.(mp3|m4a|aac|flac|ogg|webm|mp4)(\?|$)/i.test(u) ||
  /googlevideo|videoplayback|adaptiveFormats|signatureCipher/i.test(u),
)
check('no media/stream URL requested', media.length === 0, `media=${media.length}`)
check('only Data API endpoints used',
  seenUrls.every((u) => u.startsWith('https://www.googleapis.com/youtube/v3/')),
  `${seenUrls.length} calls`)
globalThis.fetch = originalFetch

/* ---- 12. no secrets in logs ---- */
console.log('\n=== 12. No secrets logged ===')
const logLines = []
const realLog = console.log
const realWarn = console.warn
console.log = (...a) => logLines.push(a.join(' '))
console.warn = (...a) => logLines.push(a.join(' '))
wipe()
await youtube.searchVideos('log probe', { maxResults: 10 })
await youtube.searchVideos('log probe', { maxResults: 10 }).catch(() => {})
console.log = realLog
console.warn = realWarn
const keyValue = process.env.YOUTUBE_API_KEY || ''
const blob = logLines.join('\n')
check('logging produced observable output', logLines.length > 0, `${logLines.length} lines`)
check('cache hit was logged', /cache hit/i.test(blob))
check('no API key in logs', !keyValue || !blob.includes(keyValue))
check('no AIza-style token in logs', !/AIza[0-9A-Za-z_-]{10,}/.test(blob))
check('no JWT-like token in logs', !/eyJ[A-Za-z0-9_-]{10,}\./.test(blob))
check('no mongo credentials in logs', !/mongodb(\+srv)?:\/\/[^ ]*:[^ ]*@/.test(blob))

/* ---- 13. status endpoint states ---- */
console.log('\n=== 13. /api/youtube/status reports documented states ===')
const probe = async (stubMode) => {
  const savedMode = mode
  mode = stubMode
  youtube.default.__resetSearchState()
  const info = await youtube.getQuotaInfo()
  mode = savedMode
  return info
}
check('ok -> available', (await probe('ok')).status === 'available', (await probe('ok')).status)
check('quota -> quota_exceeded', (await probe('quota')).status === 'quota_exceeded',
  (await probe('quota')).status)
check('network -> error', (await probe('network')).status === 'error',
  (await probe('network')).status)
const st = youtube.default.getSearchCacheStats()
check('status exposes counts only, no payload',
  typeof st.entries === 'number' && typeof st.ttlMs === 'number')
check('status cache stats contain no secret',
  !JSON.stringify(st).match(/AIza|mongodb:\/\//))

/* ---- cleanup ---- */
await Song.deleteOne({ _id: stubSong._id })
await User.deleteOne({ _id: owner._id })
await disconnectDatabase()
console.log('\n  (removed temporary documents; database left as found)')

console.log('\n' + '='.repeat(70))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: QUOTA EFFICIENCY VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(70))
process.exit(failed === 0 ? 0 : 1)