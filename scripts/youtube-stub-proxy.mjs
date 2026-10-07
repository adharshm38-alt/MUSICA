/**
 * Stub API proxy for verifying the YouTube UI end to end.
 *
 * The real YouTube Data API needs a key, which this environment does not have.
 * This proxy sits in front of the real backend and answers ONLY the YouTube
 * discovery routes with canned, realistic metadata; everything else is forwarded
 * to the genuine Express server untouched.
 *
 * So a test can drive the real front end - real axios calls, real components,
 * real buttons - while YouTube search returns deterministic results.
 *
 * Usage: node scripts/youtube-stub-proxy.mjs [port]
 */
import http from 'node:http'

const PORT = Number(process.argv[2]) || 5099
const UPSTREAM = 'http://127.0.0.1:5000'

/** Canned videos. Big Buck Bunny is public domain (Blender Foundation). */
const VIDEOS = [
  {
    _id: 'stub-1',
    videoId: 'aqz-KE-bpKQ',
    title: 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film',
    description: 'A large and lovable rabbit deals with three bullying rodents.',
    channelId: 'UCzS41Z9gUudUB9Z6shutGJw',
    channelTitle: 'Blender',
    thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/mqdefault.jpg',
    thumbnailHigh: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    durationSeconds: 635,
    publishedAt: '2008-05-20T00:00:00.000Z',
    viewCount: 12000000,
    embeddable: true,
    embedUrl: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    watchUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    source: 'youtube',
  },
  {
    _id: 'stub-2',
    videoId: 'eRsGyueVLvQ',
    title: 'Sintel (2010) Blender Open Movie',
    description: 'A girl searches for her lost dragon.',
    channelId: 'UCzS41Z9gUudUB9Z6shutGJw',
    channelTitle: 'Blender',
    thumbnail: 'https://i.ytimg.com/vi/eRsGyueVLvQ/mqdefault.jpg',
    thumbnailHigh: 'https://i.ytimg.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    durationSeconds: 888,
    publishedAt: '2010-09-27T00:00:00.000Z',
    viewCount: 9000000,
    embeddable: true,
    embedUrl: 'https://www.youtube-nocookie.com/embed/eRsGyueVLvQ',
    watchUrl: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
    source: 'youtube',
  },
  {
    _id: 'stub-3',
    videoId: 'R6MlUcmOul8',
    title: 'Tears of Steel - Blender Open Movie',
    description: 'A short film about love and robots in Amsterdam.',
    channelId: 'UCzS41Z9gUudUB9Z6shutGJw',
    channelTitle: 'Blender',
    thumbnail: 'https://i.ytimg.com/vi/R6MlUcmOul8/mqdefault.jpg',
    thumbnailHigh: 'https://i.ytimg.com/vi/R6MlUcmOul8/hqdefault.jpg',
    durationSeconds: 734,
    publishedAt: '2012-09-27T00:00:00.000Z',
    viewCount: 4000000,
    // Deliberately embed-disabled so the UI's "cannot play" path is exercised.
    embeddable: false,
    embedUrl: 'https://www.youtube-nocookie.com/embed/R6MlUcmOul8',
    watchUrl: 'https://www.youtube.com/watch?v=R6MlUcmOul8',
    source: 'youtube',
  },
]

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0]

  // The front end runs on a different port, so every response needs CORS.
  // We must echo the exact Origin: combining "*" with Allow-Credentials is
  // rejected by browsers, and axios is configured withCredentials: true.
  const origin = req.headers.origin || '*'
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Vary': 'Origin',
  }

  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify(obj))
  }

  if (req.method === 'OPTIONS') return send(204, {})

  // ---- Stubbed YouTube discovery routes ----
  if (path === '/api/youtube/status') {
    return send(200, {
      success: true,
      data: {
        configured: true,
        provider: 'youtube',
        playback: 'official-embedded-iframe-player',
        message: 'YouTube discovery is enabled.',
      },
    })
  }

  if (path === '/api/youtube/search') {
    return send(200, {
      success: true,
      data: { items: VIDEOS, total: VIDEOS.length, page: 1, limit: 20, totalPages: 1 },
    })
  }

  if (path === '/api/youtube/trending') {
    return send(200, { success: true, data: { items: VIDEOS } })
  }

  // Everything else goes to the genuine backend.
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined

  try {
    const upstream = await fetch(`${UPSTREAM}${req.url}`, {
      method: req.method,
      headers: {
        Authorization: req.headers.authorization || '',
        'Content-Type': req.headers['content-type'] || 'application/json',
        Range: req.headers.range || '',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    })

    // Buffer as bytes, not text: the passthrough also carries audio files, and
    // decoding those as UTF-8 would corrupt them.
    const buf = Buffer.from(await upstream.arrayBuffer())
    const len = upstream.headers.get('content-length')
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      ...(len ? { 'Content-Length': len } : {}),
      ...(upstream.headers.get('accept-ranges') ? { 'Accept-Ranges': 'bytes' } : {}),
      ...(upstream.headers.get('content-range') ? { 'Content-Range': upstream.headers.get('content-range') } : {}),
      // Express's own CORS is configured for its own client URL; override it so
      // the proxy answers the front end's actual origin.
      ...cors,
    })
    res.end(buf)
  } catch (error) {
    send(502, { success: false, message: `stub proxy error: ${error.message}` })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stub] listening on http://127.0.0.1:${PORT}`)
})