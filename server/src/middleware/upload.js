import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import config from '../config/env.js'
import ApiError from '../utils/ApiError.js'

// Make sure the upload folders exist before the first request arrives.
const AUDIO_DIR = path.join(config.uploadsDir, 'audio')
const IMAGE_DIR = path.join(config.uploadsDir, 'images')
for (const dir of [AUDIO_DIR, IMAGE_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

const ALLOWED_AUDIO = new Set([
  'audio/mpeg', // .mp3
  'audio/mp4', // .m4a
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
])

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

const storage = multer.diskStorage({
  destination(req, file, done) {
    done(null, file.fieldname === 'audio' ? AUDIO_DIR : IMAGE_DIR)
  },
  filename(req, file, done) {
    // Random name + safe extension so uploads can never overwrite each
    // other or execute anything (e.g. a file named "x.php").
    const extension = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10)
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    done(null, `${unique}${extension}`)
  },
})

function fileFilter(_req, file, done) {
  if (file.fieldname === 'audio') {
    if (!ALLOWED_AUDIO.has(file.mimetype)) {
      return done(
        ApiError.badRequest(
          'Unsupported audio format. Use MP3, M4A, AAC, WAV, OGG or FLAC.',
          [{ field: 'audio', message: file.mimetype }],
        ),
      )
    }
    return done(null, true)
  }

  if (!ALLOWED_IMAGE.has(file.mimetype)) {
    return done(ApiError.badRequest('Cover image must be a JPG, PNG, WEBP or GIF file.'))
  }
  return done(null, true)
}

/** Upload middleware for song creation: one audio + one optional cover. */
export const uploadSongMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxAudioSizeMb * 1024 * 1024, // per-file cap
    files: 2,
  },
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
])

/** Upload middleware for a single profile image. */
export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxImageSizeMb * 1024 * 1024, files: 1 },
}).single('avatar')

/** Turn multer's own errors into our clean ApiError format. */
export const handleUploadErrors = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest(`File is too large. Maximum size is ${config.maxAudioSizeMb} MB.`))
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest(`Unexpected file field "${err.field}".`))
    }
    return next(ApiError.badRequest(`Upload failed: ${err.message}`))
  }
  return next(err)
}
