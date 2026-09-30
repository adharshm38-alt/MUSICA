import Report from '../models/Report.js'
import User from '../models/User.js'
import Song from '../models/Song.js'
import Playlist from '../models/Playlist.js'
import Like from '../models/Like.js'
import Follow from '../models/Follow.js'
import ListeningHistory from '../models/ListeningHistory.js'
import ApiError from '../utils/ApiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess, sendPaginated } from '../utils/response.js'
import { storage } from '../services/storage/index.js'

/** GET /api/admin/stats - headline numbers for the dashboard. */
export const getStats = asyncHandler(async (_req, res) => {
  const [users, songs, playlists, openReports, newUsersThisWeek, uploadsThisWeek] =
    await Promise.all([
      User.countDocuments(),
      Song.countDocuments(),
      Playlist.countDocuments(),
      Report.countDocuments({ status: 'open' }),
      User.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
      Song.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
    ])

  sendSuccess(res, {
    stats: { users, songs, playlists, openReports, newUsersThisWeek, uploadsThisWeek },
  })
})

/** GET /api/admin/users - paginated user list with search. */
export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const skip = (page - 1) * limit

  const filter = {}
  if (req.query.search) {
    const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'i')
    filter.$or = [{ username: regex }, { email: regex }, { displayName: regex }]
  }
  if (req.query.role) filter.role = req.query.role

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('username displayName email avatarUrl role isActive followerCount songCount createdAt')
      .lean(),
    User.countDocuments(filter),
  ])

  sendPaginated(res, { items, total, page, limit, totalPages: Math.ceil(total / limit) })
})

/** PUT /api/admin/users/:id/role - promote or demote an admin. */
export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body
  if (!['user', 'admin'].includes(role)) throw ApiError.badRequest('Role must be "user" or "admin"')
  if (req.params.id === req.user._id.toString()) {
    throw ApiError.badRequest('You cannot change your own role')
  }

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
  if (!user) throw ApiError.notFound('User not found')

  sendSuccess(res, { message: `${user.username} is now ${role === 'admin' ? 'an admin' : 'a standard user'}` })
})

/** PUT /api/admin/users/:id/status - activate or deactivate an account. */
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body
  if (req.params.id === req.user._id.toString()) {
    throw ApiError.badRequest('You cannot deactivate your own account')
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: Boolean(isActive) },
    { new: true },
  )
  if (!user) throw ApiError.notFound('User not found')

  sendSuccess(res, { message: isActive ? 'Account reactivated' : 'Account deactivated' })
})

/** GET /api/admin/songs - paginated song list for moderation. */
export const listSongs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const skip = (page - 1) * limit

  const filter = {}
  if (req.query.search) {
    const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.title = new RegExp(escaped, 'i')
  }
  if (req.query.status === 'hidden') filter.isActive = false
  else filter.isActive = true

  const [items, total] = await Promise.all([
    Song.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'username displayName email')
      .lean(),
    Song.countDocuments(filter),
  ])

  sendPaginated(res, { items, total, page, limit, totalPages: Math.ceil(total / limit) })
})

/** DELETE /api/admin/songs/:id - remove an unauthorised upload. */
export const removeSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id)
  if (!song) throw ApiError.notFound('Song not found')

  await Promise.all([storage.remove(song.audioKey), storage.remove(song.coverKey)])
  await Promise.all([
    Like.deleteMany({ song: song._id }),
    ListeningHistory.deleteMany({ song: song._id }),
  ])
  await song.deleteOne()

  sendSuccess(res, { message: 'Upload removed' })
})

/** GET /api/admin/reports - the report queue. */
export const listReports = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const skip = (page - 1) * limit

  const filter = {}
  if (req.query.status) filter.status = req.query.status

  const [items, total] = await Promise.all([
    Report.find(filter)
      .sort({ status: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('reporter', 'username displayName email')
      .lean(),
    Report.countDocuments(filter),
  ])

  sendPaginated(res, { items, total, page, limit, totalPages: Math.ceil(total / limit) })
})

/** PUT /api/admin/reports/:id - change status / add a note. */
export const updateReport = asyncHandler(async (req, res) => {
  const { status, resolutionNote = '' } = req.body

  const valid = ['open', 'reviewing', 'resolved', 'dismissed']
  if (status && !valid.includes(status)) throw ApiError.badRequest('Unknown report status')

  const report = await Report.findByIdAndUpdate(
    req.params.id,
    {
      ...(status ? { status } : {}),
      resolutionNote,
      resolvedBy: status && status !== 'open' ? req.user._id : null,
      resolvedAt: status && status !== 'open' ? new Date() : null,
    },
    { new: true },
  )
  if (!report) throw ApiError.notFound('Report not found')

  sendSuccess(res, { report })
})

export default {
  getStats,
  listUsers,
  updateUserRole,
  updateUserStatus,
  listSongs,
  removeSong,
  listReports,
  updateReport,
}

// ---------- helpers ----------
function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}
