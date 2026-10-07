import mongoose from 'mongoose'
import Playlist from '../models/Playlist.js'
import Song from '../models/Song.js'
import ApiError from '../utils/ApiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js'
import { storage, FOLDERS } from '../services/storage/index.js'

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/** GET /api/playlists?scope=mine|public */
export const listPlaylists = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24))
  const skip = (page - 1) * limit

  const mine = req.query.scope === 'mine'
  // "mine" only makes sense when signed in - fail clearly rather than 500.
  if (mine && !req.user) {
    throw ApiError.unauthorized('Log in to see your own playlists')
  }

  const filter = mine ? { owner: req.user._id } : { isPublic: true }

  const [items, total] = await Promise.all([
    Playlist.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('owner', 'username displayName avatarUrl')
      .populate('songs', 'title artistName coverUrl duration audioUrl source youtubeVideoId youtubeChannelTitle')
      .lean(),
    Playlist.countDocuments(filter),
  ])

  sendPaginated(res, {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})

/** POST /api/playlists */
export const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description = '', isPublic = true } = req.body

  const playlist = await Playlist.create({
    name,
    description,
    isPublic: Boolean(isPublic),
    owner: req.user._id,
  })

  await playlist.populate('owner', 'username displayName avatarUrl')
  sendCreated(res, { playlist })
})

/** GET /api/playlists/:id */
export const getPlaylist = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid playlist id')

  const playlist = await Playlist.findById(req.params.id)
    .populate('owner', 'username displayName avatarUrl followerCount')
    .populate({
      path: 'songs',
      select: 'title artistName coverUrl duration audioUrl playCount likeCount',
    })
    .lean()

  if (!playlist) throw ApiError.notFound('Playlist not found')

  const isOwner = req.user && playlist.owner._id.toString() === req.user._id.toString()
  if (!playlist.isPublic && !isOwner && req.user?.role !== 'admin') {
    throw ApiError.forbidden('This playlist is private')
  }

  await Playlist.updateOne({ _id: playlist._id }, { $inc: { playCount: 1 } })

  sendSuccess(res, { playlist: { ...playlist, isOwner: Boolean(isOwner) } })
})

/** PUT /api/playlists/:id - owner only. */
export const updatePlaylist = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid playlist id')

  const playlist = await Playlist.findById(req.params.id)
  if (!playlist) throw ApiError.notFound('Playlist not found')
  assertOwner(playlist, req.user)

  const { name, description, isPublic } = req.body
  if (name !== undefined) playlist.name = name
  if (description !== undefined) playlist.description = description
  if (isPublic !== undefined) playlist.isPublic = Boolean(isPublic)

  const coverFile = req.files?.cover?.[0]
  if (coverFile) {
    await storage.remove(playlist.coverKey)
    const cover = await storage.save(coverFile, FOLDERS.IMAGES)
    playlist.coverUrl = cover.url
    playlist.coverKey = cover.key
  }

  await playlist.save()
  await playlist.populate('owner', 'username displayName avatarUrl')
  sendSuccess(res, { playlist })
})

/** DELETE /api/playlists/:id - owner or admin. */
export const deletePlaylist = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid playlist id')

  const playlist = await Playlist.findById(req.params.id)
  if (!playlist) throw ApiError.notFound('Playlist not found')
  assertOwner(playlist, req.user)

  await storage.remove(playlist.coverKey)
  await playlist.deleteOne()
  sendSuccess(res, { message: 'Playlist deleted' })
})

/** POST /api/playlists/:id/songs - append one or more songs. */
export const addSongs = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid playlist id')

  const playlist = await Playlist.findById(req.params.id)
  if (!playlist) throw ApiError.notFound('Playlist not found')
  assertOwner(playlist, req.user)

  // Accept `songId` or `songIds` (or a song embedded in the body).
  const ids = []
  if (req.body.songId) ids.push(req.body.songId)
  if (Array.isArray(req.body.songIds)) ids.push(...req.body.songIds)

  if (!ids.length) throw ApiError.badRequest('Choose at least one song to add')
  if (!ids.every((id) => isValidId(id))) throw ApiError.badRequest('Invalid song id')

  const existing = new Set(playlist.songs.map((id) => id.toString()))
  const additions = ids.filter((id) => !existing.has(id.toString()))
  if (!additions.length) {
    return sendSuccess(res, { playlist, added: 0, message: 'Those songs are already in the playlist' })
  }

  // Make sure the songs exist and are visible.
  const found = await Song.find({ _id: { $in: additions }, isActive: true }).select('_id')
  if (found.length !== additions.length) {
    throw ApiError.badRequest('One or more songs could not be found')
  }

  playlist.songs.push(...additions)
  await playlist.save()

  await playlist.populate({
    path: 'songs',
    select: 'title artistName coverUrl duration audioUrl source youtubeVideoId youtubeChannelTitle',
  })
  return sendSuccess(res, { playlist, added: additions.length })
})

/** DELETE /api/playlists/:id/songs/:songId */
export const removeSong = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid playlist id')

  const playlist = await Playlist.findById(req.params.id)
  if (!playlist) throw ApiError.notFound('Playlist not found')
  assertOwner(playlist, req.user)

  const before = playlist.songs.length
  playlist.songs = playlist.songs.filter(
    (id) => id.toString() !== req.params.songId.toString(),
  )
  if (playlist.songs.length === before) throw ApiError.notFound('That song is not in this playlist')

  await playlist.save()
  await playlist.populate({
    path: 'songs',
    select: 'title artistName coverUrl duration audioUrl source youtubeVideoId youtubeChannelTitle',
  })
  sendSuccess(res, { playlist })
})

/**
 * PUT /api/playlists/:id/songs/order
 * body: { songIds: [...] } - the exact order the client wants.
 */
export const reorderSongs = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid playlist id')

  const playlist = await Playlist.findById(req.params.id)
  if (!playlist) throw ApiError.notFound('Playlist not found')
  assertOwner(playlist, req.user)

  const { songIds } = req.body
  if (!Array.isArray(songIds)) throw ApiError.badRequest('Send the songs as an array of ids')

  const current = playlist.songs.map((id) => id.toString())
  // Every existing song must appear exactly once, nothing added or removed.
  if (
    songIds.length !== current.length ||
    new Set(songIds).size !== current.length ||
    songIds.some((id) => !current.includes(id))
  ) {
    throw ApiError.badRequest('The new order must contain exactly the songs already in the playlist')
  }

  playlist.songs = songIds
  await playlist.save()

  await playlist.populate({
    path: 'songs',
    select: 'title artistName coverUrl duration audioUrl source youtubeVideoId youtubeChannelTitle',
  })
  sendSuccess(res, { playlist })
})

// ---------- helpers ----------

function assertOwner(playlist, user) {
  const isOwner = playlist.owner.toString() === user._id.toString()
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only manage your own playlists')
  }
}

export default {
  listPlaylists,
  createPlaylist,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSongs,
  removeSong,
  reorderSongs,
}
