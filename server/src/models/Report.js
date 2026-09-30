import mongoose from 'mongoose'

export const REPORT_REASONS = ['copyright', 'inappropriate', 'spam', 'other']

/** A report filed by a user about a song or a profile. */
const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['song', 'user'],
      required: [true, 'Tell us what you are reporting'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      required: [true, 'Choose a reason'],
    },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'dismissed'],
      default: 'open',
      index: true,
    },
    // Snapshot so the admin view still shows what was reported even if
    // the target has since been deleted.
    targetSnapshot: {
      title: { type: String, default: '' },
      ownerName: { type: String, default: '' },
    },
    resolutionNote: { type: String, default: '', maxlength: 500 },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// Stops the same user reporting the same thing repeatedly.
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, name: 'unique_user_target_report' },
)
reportSchema.index({ status: 1, createdAt: -1 })

const Report = mongoose.model('Report', reportSchema)

export default Report
