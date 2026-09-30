/**
 * Demo data seeder.
 *
 * Creates a handful of users (one admin), uploads a few royalty-free generated
 * audio files, and wires up likes, follows, playlists and history so the UI has
 * something to show. Safe to re-run: it clears the demo data first.
 *
 *   npm run seed            -> server/.env
 *   npm run seed -- --keep  -> keeps existing data
 */

import zlib from 'node:zlib'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../config/db.js'
import User from '../models/User.js'
import Song from '../models/Song.js'
import Playlist from '../models/Playlist.js'
import Like from '../models/Like.js'
import Follow from '../models/Follow.js'
import ListeningHistory from '../models/ListeningHistory.js'
import { storage, FOLDERS } from '../services/storage/index.js'

/** Generates a small playable WAV file (a simple sine tone). */
function makeWav(seconds = 6, frequency = 440, sampleRate = 22050) {
  const samples = seconds * sampleRate
  const buffer = Buffer.alloc(44 + samples * 2)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // PCM chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)

  // Fade in/out so it doesn't click.
  const fade = Math.floor(sampleRate * 0.05)
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate
    let gain = 1
    if (i < fade) gain = i / fade
    if (i > samples - fade) gain = (samples - i) / fade
    const value = Math.sin(2 * Math.PI * frequency * t) * 0.25 * gain
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }

  return { buffer, duration: seconds }
}

/** Builds a small PNG cover (solid gradient with a music note) without deps. */
function makeCover(hueA, hueB) {
  // A 400x400 PNG with a simple two-tone radial gradient, written by hand.
  const size = 400
  const raw = Buffer.alloc((size * 3 + 1) * size)

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 3 + 1)
    raw[rowStart] = 0 // PNG filter: none
    for (let x = 0; x < size; x += 1) {
      const dx = x - size / 2
      const dy = y - size / 2
      const dist = Math.sqrt(dx * dx + dy * dy) / (size / 2)
      const mix = Math.min(1, dist)

      // Convert HSL-ish hue pair to RGB.
      const h1 = (hueA + mix * 40) / 360
      const h2 = (hueB + mix * 40) / 360
      const c1 = hslToRgb(h1, 0.65, 0.55)
      const c2 = hslToRgb(h2, 0.6, 0.35)

      const i = rowStart + 1 + x * 3
      raw[i] = Math.round(c1[0] * (1 - mix) + c2[0] * mix)
      raw[i + 1] = Math.round(c1[1] * (1 - mix) + c2[1] * mix)
      raw[i + 2] = Math.round(c1[2] * (1 - mix) + c2[2] * mix)
    }
  }

  return encodePng(size, size, raw)
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))
  }
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

/** Minimal PNG encoder (truecolor, no alpha). */
function encodePng(width, height, rawWithFilters) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const body = Buffer.concat([typeBuf, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0, 0)
    return Buffer.concat([length, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawWithFilters)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return crc ^ 0xffffffff
}

// ---------------------------------------------------------------------------

const USERS = [
  { username: 'admin', displayName: 'MUSICA Admin', email: 'admin@musica.dev', password: 'admin12345', role: 'admin', bio: 'Official MUSICA account. Questions? Reach out here.' },
  { username: 'nova', displayName: 'Nova Reid', email: 'nova@musica.dev', password: 'password123', bio: 'Synth-pop producer based in Manchester. Making sounds after dark.' },
  { username: 'echo', displayName: 'Echo Park', email: 'echo@musica.dev', password: 'password123', bio: 'Lo-fi and ambient. Headphones always on.' },
  { username: 'rhythm', displayName: 'Rhythm Dept', email: 'rhythm@musica.dev', password: 'password123', bio: 'Making beats in a small bedroom studio.' },
  { username: 'lumen', displayName: 'Lumen Sky', email: 'lumen@musica.dev', password: 'password123', bio: 'Singer-songwriter exploring folk and jazz.' },
]

const SONGS = [
  { u: 1, title: 'Neon Skyline', artistName: 'Nova Reid', album: 'After Dark', genre: 'Electronic', frequency: 330, hueA: 265, hueB: 320, desc: 'A shimmering synthwave track built for night drives.' },
  { u: 1, title: 'Paper Planes', artistName: 'Nova Reid', album: 'After Dark', genre: 'Pop', frequency: 392, hueA: 300, hueB: 350, desc: 'Upbeat and a little nostalgic.' },
  { u: 2, title: 'Rainy Window', artistName: 'Echo Park', album: 'Slow Mornings', genre: 'Lo-fi', frequency: 262, hueA: 190, hueB: 240, desc: 'Lo-fi loops for reading and rain.' },
  { u: 2, title: 'Drift', artistName: 'Echo Park', album: 'Slow Mornings', genre: 'Ambient', frequency: 294, hueA: 160, hueB: 210, desc: 'A long, soft ambient piece.' },
  { u: 3, title: 'Backbeat', artistName: 'Rhythm Dept', album: 'One Take', genre: 'Hip-Hop', frequency: 220, hueA: 20, hueB: 45, desc: 'Straight from the drum machine.' },
  { u: 3, title: 'Midnight Loop', artistName: 'Rhythm Dept', album: 'One Take', genre: 'Hip-Hop', frequency: 247, hueA: 340, hueB: 10, desc: 'Six bars of pure groove.' },
  { u: 4, title: 'Golden Hour', artistName: 'Lumen Sky', album: 'Small Songs', genre: 'Folk', frequency: 349, hueA: 40, hueB: 90, desc: 'An acoustic fingerpicked tune.' },
  { u: 4, title: 'Blue Note', artistName: 'Lumen Sky', album: 'Small Songs', genre: 'Jazz', frequency: 311, hueA: 210, hueB: 260, desc: 'A late-night jazz standard, reinterpreted.' },
  { u: 0, title: 'Welcome to MUSICA', artistName: 'MUSICA Admin', album: 'Starter Pack', genre: 'Ambient', frequency: 440, hueA: 250, hueB: 200, desc: 'A gentle generated tone to get you started.' },
]

async function seed() {
  const keep = process.argv.includes('--keep')
  await connectDatabase()

  if (!keep) {
    console.log('[seed] clearing existing data...')
    await Promise.all([
      Like.deleteMany({}),
      Follow.deleteMany({}),
      ListeningHistory.deleteMany({}),
      Playlist.deleteMany({}),
      Song.deleteMany({}),
      User.deleteMany({}),
    ])
  }

  // ---- Users ----
  console.log('[seed] creating users...')
  const users = []
  for (const spec of USERS) {
    users.push(
      await User.create({
        username: spec.username,
        displayName: spec.displayName,
        email: spec.email,
        password: spec.password,
        role: spec.role ?? 'user',
        bio: spec.bio ?? '',
      }),
    )
  }

  // ---- Songs + audio files ----
  console.log('[seed] generating audio + cover files...')
  const songs = []
  for (const spec of SONGS) {
    const { buffer, duration } = makeWav(6 + Math.floor(Math.random() * 6), spec.frequency)

    // Write audio and cover through the storage layer, exactly like a real upload.
    const audio = await storage.saveDataUrl(
      `data:audio/wav;base64,${buffer.toString('base64')}`,
      FOLDERS.AUDIO,
    )

    const cover = await storage.saveDataUrl(
      `data:image/png;base64,${makeCover(spec.hueA, spec.hueB).toString('base64')}`,
      FOLDERS.IMAGES,
    )

    songs.push(
      await Song.create({
        title: spec.title,
        artistName: spec.artistName,
        album: spec.album,
        genre: spec.genre,
        description: spec.desc,
        uploadedBy: users[spec.u]._id,
        artist: users[spec.u]._id,
        audioUrl: audio.url,
        audioKey: audio.key,
        audioMimeType: 'audio/wav',
        audioSizeBytes: buffer.length,
        duration,
        coverUrl: cover?.url ?? '',
        coverKey: cover?.key ?? '',
        rightsConfirmed: true,
        rightsNote: 'Generated demo audio created for this project.',
        // Vary the metrics so Trending and Most Played have something to sort.
        playCount: 5 + Math.floor(Math.random() * 400),
        likeCount: 0,
      }),
    )
  }

  // ---- Likes ----
  console.log('[seed] adding likes...')
  const likeDocs = []
  songs.forEach((song) => {
    users.forEach((user) => {
      // Deterministic-ish spread so every song gets a few fans.
      if (Math.random() < 0.6 && user._id.toString() !== song.uploadedBy.toString()) {
        likeDocs.push({ user: user._id, song: song._id })
      }
    })
  })
  if (likeDocs.length) await Like.insertMany(likeDocs)
  await Song.updateMany({}, [{ $set: { likeCount: 0 } }])
  for (const song of songs) {
    const count = await Like.countDocuments({ song: song._id })
    await Song.updateOne({ _id: song._id }, { likeCount: count })
  }

  // ---- Follows ----
  console.log('[seed] adding follows...')
  const followDocs = []
  for (const fan of users) {
    for (const star of users) {
      if (fan._id.equals(star._id)) continue
      if (Math.random() < 0.5) followDocs.push({ follower: fan._id, following: star._id })
    }
  }
  if (followDocs.length) await Follow.insertMany(followDocs)
  await User.updateMany({}, { followerCount: 0, followingCount: 0, songCount: 0 })
  for (const user of users) {
    const [followers, following, songCount] = await Promise.all([
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      Song.countDocuments({ uploadedBy: user._id }),
    ])
    await User.updateOne(
      { _id: user._id },
      { $set: { followerCount: followers, followingCount: following, songCount } },
    )
  }

  // ---- Playlists ----
  console.log('[seed] creating playlists...')
  const playlistSpecs = [
    { owner: 0, name: 'Starter Pack', desc: 'A gentle introduction to MUSICA.', public: true, pick: [8, 3, 7] },
    { owner: 1, name: 'Night Drive', desc: 'Synths and speed, best after midnight.', public: true, pick: [0, 5, 3] },
    { owner: 2, name: 'Rainy Day', desc: 'Lo-fi and soft ambient for grey weather.', public: true, pick: [2, 3, 6] },
    { owner: 3, name: 'Focus Flow', desc: 'Steady beats to work to.', public: true, pick: [4, 5, 1] },
    { owner: 4, name: 'My private picks', desc: 'Just for me.', public: false, pick: [6, 7] },
  ]

  for (const spec of playlistSpecs) {
    await Playlist.create({
      name: spec.name,
      description: spec.desc,
      isPublic: spec.public,
      owner: users[spec.owner]._id,
      songs: spec.pick.map((index) => songs[index]._id),
      playCount: Math.floor(Math.random() * 200),
    })
  }

  // ---- Listening history ----
  console.log('[seed] adding listening history...')
  const historyDocs = []
  for (const user of users.slice(1)) {
    for (const song of songs) {
      if (Math.random() < 0.4) {
        historyDocs.push({
          user: user._id,
          song: song._id,
          lastPlayedAt: new Date(Date.now() - Math.floor(Math.random() * 6) * 3600 * 1000),
          playCount: 1 + Math.floor(Math.random() * 6),
        })
      }
    }
  }
  if (historyDocs.length) await ListeningHistory.insertMany(historyDocs)

  console.log('\n  Seed complete.\n')
  console.log('  Sign in with any of these:\n')
  console.log('    Admin    admin@musica.dev    admin12345')
  console.log('    User     nova@musica.dev     password123')
  console.log('    User     echo@musica.dev     password123')
  console.log('    User     rhythm@musica.dev   password123')
  console.log('    User     lumen@musica.dev    password123\n')

  await disconnectDatabase()
  process.exit(0)
}

seed().catch(async (error) => {
  console.error('[seed] failed:', error)
  await mongoose.connection.close().catch(() => {})
  process.exit(1)
})
