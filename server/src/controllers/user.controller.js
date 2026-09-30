import mongoose from 'mongoose'
import User from '../models/User.js'
import Song from '../models/Song.js'
import Playlist from '../models/Playlist.js'
import Follow from '../models/Follow.js'
import ApiError from '../utils/ApiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess, sendPaginated } from '../utils/response.js'
import { storage, FOLDERS } from '../services/storage/index.js'
import { decorateWithLikes, decorateWithFollow } from '../utils/decorate.js'

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

const USER_FIELDS =
  'username displayName avatarUrl bio followerCount followingCount songCount role createdAt'

/** GET /api/users/:id - a public profile. */
export const getUser = asyncHandler(async (req, res) => {
  const targetId = req.params.id === 'me' ? req.user?._id : req.params.id
  if (!targetId) throw ApiError.badRequest('No user specified')
  if (!isValidId(targetId)) throw ApiError.badRequest('Invalid user id')

  const user = await User.findById(targetId).select(USER_FIELDS).lean()
  if (!user) throw ApiError.notFound('That profile does not exist')

  const isSelf = req.user && req.user._id.toString() === user._id.toString()

  const [songs, playlists, followers, following] = await Promise.all([
    Song.find({ uploadedBy: user._id, isActive: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Playlist.find({ owner: user._id, ...(isSelf ? {} : { isPublic: true }) })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    Follow.find({ following: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('follower', USER_FIELDS)
      .lean(),
    Follow.find({ follower: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('following', USER_FIELDS)
      .lean(),
  ])

  const isFollowing = req.user
    ? Boolean(await Follow.exists({ follower: req.user._id, following: user._id }))
    : false

  sendSuccess(res, {
    user: { ...user, isFollowing, isSelf: Boolean(isSelf) },
    songs: await decorateWithLikes(songs, req.user?._id),
    playlists,
    followers: followers.map((entry) => entry.follower).filter(Boolean),
    following: following.map((entry) => entry.following).filter(Boolean),
  })
})

/** PUT /api/users/:id - edit your own profile (admin may edit any). */
export const updateUser = asyncHandler(async (req, res) => {
  // requireAuth guarantees req.user, but guard anyway so a future route
  // change can never turn into a 500.
  if (!req.user) throw ApiError.unauthorized()

  const targetId = req.params.id === 'me' ? req.user._id : req.params.id
  if (!isValidId(targetId)) throw ApiError.badRequest('Invalid user id')

  const isSelf = targetId === req.user._id.toString()
  if (!isSelf && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own profile')
  }

  const user = await User.findById(targetId)
  if (!user) throw ApiError.notFound('That profile does not exist')

  const { displayName, bio, email } = req.body
  if (displayName !== undefined) user.displayName = displayName
  if (bio !== undefined) user.bio = bio
  if (email !== undefined && email !== user.email) {
    const taken = await User.findOne({ email, _id: { $ne: user._id } })
    if (taken) throw ApiError.conflict('That email is already in use')
    user.email = email
  }

  const avatarFile = req.files?.avatar?.[0]
  if (avatarFile) {
    await storage.remove(user.avatarUrl.replace(/^\/uploads\//, ''))
    const saved = await storage.save(avatarFile, FOLDERS.IMAGES)
    user.avatarUrl = saved.url
  }

  await user.save()

  sendSuccess(res, {
    user: {
      _id: user._id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      songCount: user.songCount,
      createdAt: user.createdAt,
    },
  })
})

/** POST /api/users/:id/follow */
export const followUser = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid user id')
  if (req.params.id === req.user._id.toString()) {
    throw ApiError.badRequest('You cannot follow yourself')
  }

  const target = await User.findById(req.params.id)
  if (!target) throw ApiError.notFound('That profile does not exist')

  const result = await Follow.updateOne(
    { follower: req.user._id, following: target._id },
    { $setOnInsert: { follower: req.user._id, following: target._id } },
    { upsert: true },
  )

  if (result.upsertedCount > 0) {
    await Promise.all([
      User.updateOne({ _id: target._id }, { $inc: { followerCount: 1 } }),
      User.updateOne({ _id: req.user._id }, { $inc: { followingCount: 1 } }),
    ])
  }

  const updated = await User.findById(target._id).select('followerCount').lean()
  sendSuccess(res, { isFollowing: true, followerCount: updated.followerCount })
})

/** DELETE /api/users/:id/follow */
export const unfollowUser = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) throw ApiError.badRequest('Invalid user id')

  const deleted = await Follow.findOneAndDelete({
    follower: req.user._id,
    following: req.params.id,
  })

  if (deleted) {
    await Promise.all([
      User.updateOne({ _id: req.params.id }, { $inc: { followerCount: -1 } }),
      User.updateOne({ _id: req.user._id }, { $inc: { followingCount: -1 } }),
    ])
  }

  const updated = await User.findById(req.params.id).select('followerCount').lean()
  sendSuccess(res, { isFollowing: false, followerCount: updated?.followerCount ?? 0 })
})

/** GET /api/users/:id/followers | /following - paginated lists. */
export const listConnections = asyncHandler(async (req, res) => {
  const targetId = req.params.id === 'me' ? req.user?._id : req.params.id
  if (!targetId) throw ApiError.badRequest('No user specified')
  if (!isValidId(targetId)) throw ApiError.badRequest('Invalid user id')

  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const skip = (page - 1) * limit
  const which = req.query.type === 'followers' ? 'follower' : 'following'

  const filter = which === 'follower' ? { following: targetId } : { follower: targetId }

  const [rows, total] = await Promise.all([
    Follow.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(which, USER_FIELDS)
      .lean(),
    Follow.countDocuments(filter),
  ])

  const users = rows.map((row) => row[which]).filter(Boolean)
  sendPaginated(res, {
    items: await decorateWithFollow(users, req.user?._id),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})

export default { getUser, updateUser, followUser, unfollowUser, listConnections }
