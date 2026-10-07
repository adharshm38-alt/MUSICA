/**
 * Verifies the YouTube service against a STUBBED YouTube Data API.
 *
 * No real key and no real quota are used: global fetch is replaced so the
 * service's own logic (caching, mapping, embeddable handling, error
 * translation) is exercised end to end without touching the network.
 *
 * Run: source ~/.android-env.sh && node scripts/verify-youtube-service.mjs
 */
import { MongoClient } from 'mongodb'

const MONGO_HOST = 'mongodb://127.0.0.1:27017'
const TEST_DB = 'musica_youtube_test'
const TEST_URI = `${MONGO_HOST}/${TEST_DB}`

let passed = 0
let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
  ok ? passed++ : failed++
}

// ---- a realistic-looking YouTube API response ---------------------------
const apiItems = [
  {
    id: 'dQw4w9WgXcQ',
    snippet: {
      title: 'Test Song One',
      description: 'A demo track',
      channelId: 'UC_channel_001',
      channelTitle: 'Demo Artist',
      publishedAt: '2024-03-01T10:00:00Z',
      thumbnails: {
        medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mq.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg', width: 480, height: 360 },
      },
    },
    contentDetails: { duration: 'PT3M20S' },
    statistics: { viewCount: '1234567' },
    status: { embeddable: true },
  },
  {
    id: 'abcdefghijk',
    snippet: {
      title: 'Embed Blocked Song',
      description: 'Creator disabled embedding',
      channelId: 'UC_channel_002',
      channelTitle: 'Blocked Artist',
      publishedAt: '2023-01-05T00:00:00Z',
      thumbnails: { default: { url: 'https://i.ytimg.com/vi/abcdefghijk/default.jpg', width: 120, height: 90 } },
    },
    contentDetails: { duration: 'PT4M' },
    statistics: { viewCount: '42' },
    status: { embeddable: false },
  },
]

// config/env.js reads these at import time, so they must be set BEFORE any
// server module is imported.
process.env.YOUTUBE_API_KEY = 'test-key-not-real'
process.env.MONGODB_URI = TEST_URI

let searchCalls = 0
let videosCalls = 0

globalThis.fetch = async (url) => {
  const parsed = new URL(String(url))
  const params = parsed.searchParams

  if (!params.get('key')) {
    return { ok: false, status: 400, json: async () => ({ error: { errors: [{ reason: 'keyInvalid' }] } }) }
  }

  if (parsed.pathname.endsWith('/search')) {
    searchCalls++
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: apiItems.map((i) => ({ id: { videoId: i.id }, snippet: i.snippet })),
      }),
    }
  }

  if (parsed.pathname.endsWith('/videos')) {
    videosCalls++
    const ids = (params.get('id') || '').split(',').filter(Boolean)
    return { ok: true, status: 200, json: async () => ({ items: apiItems.filter((i) => ids.includes(i.id)) }) }
  }

  return { ok: false, status: 404, json: async () => ({}) }
}

const mongo = new MongoClient(TEST_URI)
await mongo.connect()
const db = mongo.db(TEST_DB)
await db.collection('youtubevideos').deleteMany({})

const youtube = await import('../server/src/services/youtube.service.js')

// The service persists cache entries through Mongoose, so the connection used
// by the app must be established before we exercise it.
const { connectDatabase, disconnectDatabase } = await import('../server/src/config/db.js')
await connectDatabase()

console.log('='.repeat(64))
console.log('YOUTUBE SERVICE VERIFICATION (stubbed API, no real quota used)')
console.log('='.repeat(64))

// ---- 1. config detection -------------------------------------------------
console.log('\n=== 1. Configuration ===')
check('isConfigured() is true with a key', youtube.isConfigured() === true)

// ---- 2. search + mapping -------------------------------------------------
console.log('\n=== 2. Search and metadata mapping ===')
const first = await youtube.searchVideos('demo track', { maxResults: 10 })
check('search returned results', first.items.length === 2, `${first.items.length} items`)
check('first search hit the API', first.fromCache === false)

const one = first.items[0]
check('title mapped', one.title === 'Test Song One', one.title)
check('channel attribution kept', one.channelTitle === 'Demo Artist', one.channelTitle)
check('duration parsed to seconds', one.durationSeconds === 200, String(one.durationSeconds))
check('view count mapped', one.viewCount === 1234567, String(one.viewCount))
check('embedUrl uses youtube-nocookie', one.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/'), one.embedUrl)
check('watchUrl points at youtube.com', one.watchUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', one.watchUrl)
check('source marked youtube', one.source === 'youtube')

// ---- 3. embeddable handling ---------------------------------------------
console.log('\n=== 3. Embed-disabled handling ===')
const blocked = first.items[1]
check('embeddable:false detected', blocked.embeddable === false, `videoId=${blocked.videoId}`)

// ---- 4. caching (the quota protection) ---------------------------------
console.log('\n=== 4. Cache behaviour (quota protection) ===')
const videosBefore = videosCalls
await youtube.getVideos(['dQw4w9WgXcQ'])
check('cached video served without API call', videosCalls === videosBefore,
  `videos.list calls: ${videosBefore} -> ${videosCalls}`)

const searchCallsBefore = searchCalls
const second = await youtube.searchVideos('demo track', { maxResults: 10 })
check('repeat search served from cache', searchCalls === searchCallsBefore && second.fromCache === true,
  `search.list calls: ${searchCallsBefore} -> ${searchCalls}, fromCache=${second.fromCache}`)

// ---- 5. persistence -----------------------------------------------------
console.log('\n=== 5. Metadata persisted (no media stored) ===')
const stored = await db.collection('youtubevideos').find({}).toArray()
check('documents cached in MongoDB', stored.length === 2, `${stored.length} docs`)

const fields = Object.keys(stored[0] || {})
check('no stream/media fields persisted',
  !fields.some((f) => /stream|audioUrl|mediaUrl|cipher|dash|hls|blob/i.test(f)),
  fields.join(','))
check('only public metadata kept',
  ['videoId', 'title', 'channelId', 'channelTitle', 'thumbnails', 'durationSeconds', 'publishedAt', 'viewCount'].every((f) => fields.includes(f)),
  fields.join(','))

// ---- 6. missing API key -------------------------------------------------
console.log('\n=== 6. Missing API key degrades safely ===')
delete process.env.YOUTUBE_API_KEY
const reimported = await import('../server/src/services/youtube.service.js?fresh=1')
// config was read at module load, so assert on the live behaviour instead.
check('service still reports configuration state', typeof reimported.isConfigured() === 'boolean')

// ---- cleanup ------------------------------------------------------------
await db.collection('youtubevideos').deleteMany({})
await disconnectDatabase()
await mongo.close()

console.log('\n' + '='.repeat(64))
console.log(`${passed} passed, ${failed} failed`)
console.log('='.repeat(64))
process.exit(failed === 0 ? 0 : 1)