import User from '../models/User.js'
import Song from '../models/Song.js'
import ApiError from '../utils/ApiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendCreated, sendSuccess, sendMessage } from '../utils/response.js'
import { signToken } from '../services/token.service.js'
import { storage, FOLDERS } from '../services/storage/index.js'

const COOKIE_OPTIONS = {
  httpOnly: true, // JavaScript can't read it -> safer against XSS
  sameSite: 'lax', // blocks cross-site POSTs that would ride the session
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
}

const publicUser = (user) => ({
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
})

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { username, displayName, email, password } = req.body

  const existing = await User.findOne({ $or: [{ email }, { username }] })
  if (existing) {
    throw ApiError.conflict(
      existing.email === email
        ? 'An account with that email already exists'
        : 'That username is already taken',
    )
  }

  let avatarUrl = ''
  if (req.file) {
    const saved = await storage.save(req.file, FOLDERS.IMAGES)
    avatarUrl = saved?.url ?? ''
  }

  const user = await User.create({ username, displayName, email, password, avatarUrl })
  const token = signToken(user)

  res.cookie('token', token, COOKIE_OPTIONS)
  sendCreated(res, { user: publicUser(user), token })
})

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({ email }).select('+password')
  // Same message for wrong email and wrong password (no user enumeration).
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password')
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated')

  user.lastActiveAt = new Date()
  await user.save({ validateBeforeSave: false })

  const token = signToken(user)
  res.cookie('token', token, COOKIE_OPTIONS)
  sendSuccess(res, { user: publicUser(user), token })
})

/** POST /api/auth/logout */
export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: undefined })
  sendMessage(res, 'Logged out successfully')
})

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { user: publicUser(req.user) })
})

/** PUT /api/auth/password - change your own password */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body

  const user = await User.findById(req.user._id).select('+password')
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect')
  }

  user.password = newPassword
  await user.save()

  sendMessage(res, 'Password updated successfully')
})

/** DELETE /api/auth/account - delete your own account and its songs */
export const deleteAccount = asyncHandler(async (req, res) => {
  const password = req.body?.password
  if (!password) throw ApiError.badRequest('Confirm your password to delete the account')

  const user = await User.findById(req.user._id).select('+password')
  if (!(await user.comparePassword(password))) {
    throw ApiError.badRequest('That password is incorrect')
  }

  // Remove the songs this user uploaded, plus their stored media.
  const songs = await Song.find({ uploadedBy: user._id }).select('audioKey coverKey')
  await Promise.all(
    songs.flatMap((song) => [storage.remove(song.audioKey), storage.remove(song.coverKey)]),
  )
  await Song.deleteMany({ uploadedBy: user._id })

  await user.deleteOne()
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: undefined })
  sendMessage(res, 'Your account has been deleted')
})
