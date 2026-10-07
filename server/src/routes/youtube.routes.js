import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { body, query } from 'express-validator'
import * as youtube from '../controllers/youtube.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'

const router = Router()

/**
 * YouTube discovery API (metadata only).
 *
 * No route here returns, proxies or resolves a stream URL. Playback is done by
 * YouTube's official embedded player in the client - see
 * client/src/components/player/YouTubeFrame.jsx.
 */

// Is the integration configured? Safe and cheap; used by the client to decide
// whether to show YouTube as a discovery source at all.
router.get('/status', youtube.status)

// ---- Search ----
// search.list costs 100 quota units, so this is the most expensive endpoint.
// On top of the service-layer cache we cap how often a single caller may hit
// it, so one user cannot drain the daily quota by refreshing.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many YouTube searches. Please wait a minute and try again.',
  },
})

router.get(
  '/search',
  optionalAuth,
  searchLimiter,
  youtube.search,
)

// ---- Trending / popular music ----
router.get('/trending', youtube.trending)

// ---- Video metadata ----
// /videos/:videoId is declared last so it cannot shadow /videos.
router.get(
  '/videos',
  optionalAuth,
  [query('ids').trim().isLength({ min: 11, max: 600 }).withMessage('Provide one or more video ids')],
  validate,
  youtube.getVideos,
)

router.get('/videos/:videoId', optionalAuth, youtube.getVideo)

// ---- Save a YouTube video into the library ----
router.post(
  '/songs',
  requireAuth,
  [body('videoId').trim().isLength({ min: 11, max: 11 }).withMessage('That YouTube video id is not valid')],
  validate,
  youtube.saveSong,
)

export default router