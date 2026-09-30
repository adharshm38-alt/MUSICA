import mongoose from 'mongoose'
import Report, { REPORT_REASONS } from '../models/Report.js'
import Song from '../models/Song.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendCreated, sendSuccess, sendPaginated } from '../utils/response.js'

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/**
 * POST /api/reports - report a song or a profile.
 * Duplicate reports from the same user update the existing row.
 */
export const createReport = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, details = '' } = req.body

  if (!['song', 'user'].includes(targetType)) {
    throw ApiError.badRequest('You can report a song or a profile')
  }
  if (!isValidId(targetId)) throw ApiError.badRequest('Invalid target id')
  if (!REPORT_REASONS.includes(reason)) throw ApiError.badRequest('Choose a valid reason')

  // Snapshot the target so admins can still see it if it is deleted.
  let targetSnapshot = { title: '', ownerName: '' }
  if (targetType === 'song') {
    const song = await Song.findById(targetId).populate('uploadedBy', 'displayName username')
    if (!song) throw ApiError.notFound('That song no longer exists')
    targetSnapshot = {
      title: song.title,
      ownerName: song.uploadedBy?.displayName || song.uploadedBy?.username || song.artistName,
    }
  } else {
    const user = await User.findById(targetId)
    if (!user) throw ApiError.notFound('That profile no longer exists')
    targetSnapshot = { title: `@${user.username}`, ownerName: user.displayName }
  }

  const report = await Report.findOneAndUpdate(
    { reporter: req.user._id, targetType, targetId },
    {
      $set: { reason, details, targetSnapshot, status: 'open' },
      $setOnInsert: { reporter: req.user._id, targetType, targetId },
    },
    { upsert: true, new: true, runValidators: true },
  )

  sendCreated(res, {
    report,
    message: 'Thank you. Our moderators will review this.',
  })
})

/** GET /api/reports/mine - reports the signed-in user filed. */
export const getMyReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ reporter: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
  sendSuccess(res, { reports })
})

export default { createReport, getMyReports }
