import mongoose from 'mongoose'
import Song from '../models/Song.js'
import Like from '../models/Like.js'
import ListeningHistory from '../models/ListeningHistory.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js'
import { storage, FOLDERS } from '../services/storage/index.js'
import { decorateWithLikes } from '../utils/decorate.js'

const { HISTORY_LIMIT } = ListeningHistory

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/** GET /api/songs - paginated list with filters + sorting. */
export const listSongs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const skip = (page - 1) * limit

  const filter = { isActive: true }

  if (req.query.genre) filter.genre = new RegExp(`^${escapeRegex(req.query.genre)}$`, 'i')
  if (req.query.uploadedBy && isValidId(req.query.uploadedBy)) {
    filter.uploadedBy = req.query.uploadedBy
  }
  if (req.query.album) filter.album = new RegExp(escapeRegex(req.query.album), 'i')

  const sortMap = {
    newest: { createdAt: -1 },
    popular: { playCount: -1, likeCount: -1 },
    liked: { likeCount: -1, playCount: -1 },
    title: { title: 1 },
  }
  const sort = sortMap[req.query.sort] ?? sortMap.newest

  const [items, total] = await Promise.all([
    Song.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Song.countDocuments(filter),
  ])

  const songs = await decorateWithLikes(items, req.user?._id)
  sendPaginated(res, {
    items: songs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})

/** GET /api/songs/:id */
export const getSong = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid song id')

  const song = await Song.findById(req.params.id)
    .populate('uploadedBy', 'username displayName avatarUrl')
    .lean()
  if (!song || !song.isActive) throw ApiError.notFound('That song is no longer available')

  const [decorated] = await decorateWithLikes([song], req.user?._id)

  // Record the play (bump count) for anyone who opens the detail view.
  await Song.updateOne({ _id: song._id }, { $inc: { playCount: 1 } })
  decorated.playCount = (song.playCount ?? 0) + 1

  sendSuccess(res, { song: decorated })
})

/** GET /api/songs/discover - everything the Home page needs in one call. */
export const getDiscover = asyncHandler(async (req, res) => {
  const active = { isActive: true }
  const viewer = req.user?._id

  const [recentlyAdded, trending, mostPlayed, popularArtists] = await Promise.all([
    Song.find(active).sort({ createdAt: -1 }).limit(12).lean(),
    Song.find(active).sort({ playCount: -1, likeCount: -1 }).limit(12).lean(),
    Song.find(active).sort({ playCount: -1 }).limit(12).lean(),
    User.find({ isActive: true, songCount: { $gt: 0 } })
      .sort({ followerCount: -1, songCount: -1 })
      .limit(12)
      .select('username displayName avatarUrl followerCount songCount bio')
      .lean(),
  ])

  const { default: Playlist } = await import('../models/Playlist.js')
  const featuredPlaylists = await Playlist.find({ isPublic: true })
    .sort({ playCount: -1, updatedAt: -1 })
    .limit(12)
    .populate('owner', 'username displayName avatarUrl')
    .lean()

  const featured = trending[0] ?? recentlyAdded[0] ?? null

  const [recentlyPlayed] = viewer
    ? await Promise.all([
        ListeningHistory.find({ user: viewer })
          .sort({ lastPlayedAt: -1 })
          .limit(12)
          .populate({ path: 'song', match: active })
          .lean(),
      ])
    : [[]]

  const recentlyPlayedSongs = recentlyPlayed
    .filter((entry) => entry.song)
    .map((entry) => entry.song)

  const [a, b, c, d] = await Promise.all([
    decorateWithLikes(recentlyAdded, viewer),
    decorateWithLikes(trending, viewer),
    decorateWithLikes(mostPlayed, viewer),
    decorateWithLikes(featured ? [featured] : [], viewer),
  ])

  sendSuccess(res, {
    // `d[0]` is the decorated featured song, or undefined when there is
    // nothing to feature yet (fresh install).
    featured: d[0] ?? null,
    recentlyAdded: a,
    trending: b,
    mostPlayed: c,
    popularArtists,
    featuredPlaylists,
    recentlyPlayed: await decorateWithLikes(recentlyPlayedSongs, viewer),
  })
})

/** GET /api/songs/mine - songs uploaded by the signed-in user. */
export const getMySongs = asyncHandler(async (req, res) => {
  const songs = await Song.find({ uploadedBy: req.user._id })
    .sort({ createdAt: -1 })
    .lean()
  sendSuccess(res, { songs: await decorateWithLikes(songs, req.user._id) })
})

/** POST /api/songs - multipart upload (audio required, cover optional). */
export const createSong = asyncHandler(async (req, res) => {
  const audioFile = req.files?.audio?.[0]
  const coverFile = req.files?.cover?.[0]

  if (!audioFile) throw ApiError.badRequest('Please choose an audio file to upload')

  const {
    title,
    artistName,
    album = '',
    genre = '',
    description = '',
    releaseYear,
    rightsConfirmed,
    rightsNote = '',
  } = req.body

  // The checkbox arrives as the string "true"/"false" from FormData.
  const confirmed =
    rightsConfirmed === true || rightsConfirmed === 'true' || rightsConfirmed === 'on'
  if (!confirmed) {
    await storage.remove(pathSafe(audioFile.filename))
    throw ApiError.badRequest(
      'You must confirm you own this recording or are authorised to distribute it.',
    )
  }

  const duration = await readDuration(audioFile.path)
  const audio = await storage.save(audioFile, FOLDERS.AUDIO)
  const cover = coverFile ? await storage.save(coverFile, FOLDERS.IMAGES) : null

  try {
    const song = await Song.create({
      title,
      artistName,
      album,
      genre,
      description,
      releaseYear: releaseYear ? Number(releaseYear) : undefined,
      rightsConfirmed: true,
      rightsNote,
      uploadedBy: req.user._id,
      // Auto-link to the uploader's profile when they are the artist.
      artist: req.user._id,
      audioUrl: audio.url,
      audioKey: audio.key,
      audioMimeType: audioFile.mimetype,
      audioSizeBytes: audioFile.size,
      duration,
      coverUrl: cover?.url ?? '',
      coverKey: cover?.key ?? '',
    })

    await User.updateOne({ _id: req.user._id }, { $inc: { songCount: 1 } })

    const [decorated] = await decorateWithLikes([song.toObject()], req.user._id)
    sendCreated(res, { song: decorated })
  } catch (error) {
    // Don't leave orphaned files behind if the database write failed.
    await storage.remove(audio.key)
    await storage.remove(cover?.key)
    throw error
  }
})

/** PUT /api/songs/:id - owner (or admin) edits metadata. */
export const updateSong = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid song id')

  const song = await Song.findById(req.params.id)
  if (!song) throw ApiError.notFound('Song not found')
  if (song.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own uploads')
  }

  const editable = ['title', 'artistName', 'album', 'genre', 'description', 'releaseYear']
  for (const field of editable) {
    if (req.body[field] !== undefined) {
      song[field] = field === 'releaseYear' ? Number(req.body[field]) : req.body[field]
    }
  }

  // Optional cover replacement.
  const coverFile = req.files?.cover?.[0]
  if (coverFile) {
    await storage.remove(song.coverKey)
    const cover = await storage.save(coverFile, FOLDERS.IMAGES)
    song.coverUrl = cover.url
    song.coverKey = cover.key
  }

  await song.save()

  const [decorated] = await decorateWithLikes([song.toObject()], req.user._id)
  sendSuccess(res, { song: decorated })
})

/** DELETE /api/songs/:id - owner or admin removes the song. */
export const deleteSong = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid song id')

  const song = await Song.findById(req.params.id)
  if (!song) throw ApiError.notFound('Song not found')
  if (song.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own uploads')
  }

  await Promise.all([storage.remove(song.audioKey), storage.remove(song.coverKey)])
  await Like.deleteMany({ song: song._id })
  await ListeningHistory.deleteMany({ song: song._id })
  await song.deleteOne()

  if (song.uploadedBy) {
    await User.updateOne(
      { _id: song.uploadedBy },
      { $inc: { songCount: -1 } },
    )
  }

  sendSuccess(res, { message: 'Song deleted' })
})

/** POST /api/songs/:id/like - idempotent like. */
export const likeSong = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid song id')

  const song = await Song.findById(req.params.id)
  if (!song || !song.isActive) throw ApiError.notFound('Song not found')

  const result = await Like.updateOne(
    { user: req.user._id, song: song._id },
    { $setOnInsert: { user: req.user._id, song: song._id } },
    { upsert: true },
  )

  // Only bump the counter when a brand-new like row was created.
  if (result.upsertedCount > 0) {
    await Song.updateOne({ _id: song._id }, { $inc: { likeCount: 1 } })
  }

  const updated = await Song.findById(song._id).select('likeCount').lean()
  sendSuccess(res, { isLiked: true, likeCount: updated.likeCount })
})

/** DELETE /api/songs/:id/like - remove a like. */
export const unlikeSong = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid song id')

  const deleted = await Like.findOneAndDelete({
    user: req.user._id,
    song: req.params.id,
  })

  if (deleted) {
    await Song.updateOne({ _id: req.params.id }, { $inc: { likeCount: -1 } })
  }

  const updated = await Song.findById(req.params.id).select('likeCount').lean()
  sendSuccess(res, { isLiked: false, likeCount: updated?.likeCount ?? 0 })
})

/** GET /api/songs/liked - the signed-in user's liked songs. */
export const getLikedSongs = asyncHandler(async (req, res) => {
  const likes = await Like.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate({ path: 'song', match: { isActive: true } })
    .lean()

  const songs = likes.filter((like) => like.song).map((like) => like.song)
  sendSuccess(res, { songs })
})

/** POST /api/songs/:id/play - record a play in history + bump playCount. */
export const recordPlay = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid song id')

  const song = await Song.findById(req.params.id).select('_id isActive')
  if (!song || !song.isActive) throw ApiError.notFound('Song not found')

  await Song.updateOne({ _id: song._id }, { $inc: { playCount: 1 } })

  // Guests still count towards play totals.
  if (req.user) {
    await ListeningHistory.updateOne(
      { user: req.user._id, song: song._id },
      { $set: { lastPlayedAt: new Date() }, $inc: { playCount: 1 } },
      { upsert: true },
    )

    // Keep each user's history bounded: drop anything past the newest N.
    await ListeningHistory.deleteMany({
      user: req.user._id,
      _id: {
        $nin: (
          await ListeningHistory.find({ user: req.user._id })
            .sort({ lastPlayedAt: -1 })
            .limit(HISTORY_LIMIT)
            .select('_id')
        ).map((doc) => doc._id),
      },
    })
  }

  sendSuccess(res, { recorded: true })
})

// ---------- small helpers ----------

function escapeRegex(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pathSafe(filename = '') {
  return filename.includes('/') ? filename : `audio/${filename}`
}

/**
 * Reads the real duration from the uploaded file header.
 * Falls back to 0 - the browser fixes it up once the audio is played.
 */
async function readDuration(filePath) {
  try {
    const buffer = await import('node:fs/promises').then((fs) => fs.readFile(filePath))
    const seconds = parseAudioDuration(buffer)
    return Number.isFinite(seconds) ? Math.round(seconds) : 0
  } catch {
    return 0
  }
}

/** Minimal MP3 bitrate-frame scanner - good enough for a duration hint. */
function parseAudioDuration(buffer) {
  // Skip an ID3v2 header if present.
  let offset = 0
  if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'ID3') {
    const size = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9]
    offset = 10 + size
  }

  const BITRATES_V1_L3 = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
  ]
  const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
  const RATES_V1 = [44100, 48000, 32000, 0]
  const RATES_V2 = [22050, 24000, 16000, 0]

  for (let i = offset; i < buffer.length - 4; i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue

    const versionBits = (buffer[i + 1] >> 3) & 0x03 // 3 = MPEG1, 2 = MPEG2
    const layerBits = (buffer[i + 1] >> 1) & 0x03 // 1 = Layer III
    if (layerBits !== 1) continue

    const bitrateIndex = (buffer[i + 2] >> 4) & 0x0f
    const rateIndex = (buffer[i + 2] >> 2) & 0x03
    if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) continue

    const isV1 = versionBits === 3
    const bitrate = (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] * 1000
    const sampleRate = (isV1 ? RATES_V1 : RATES_V2)[rateIndex]
    if (!bitrate || !sampleRate) continue

    const frameLength = Math.floor((144 * bitrate) / sampleRate)
    if (frameLength <= 4) continue

    // Estimate total frames from the remaining bytes.
    const bytesLeft = buffer.length - i
    const frames = Math.floor(bytesLeft / frameLength)
    return frames * (isV1 ? 1152 : 576) / sampleRate
  }

  return 0
}
