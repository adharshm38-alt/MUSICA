import { Router } from 'express'
import config from '../config/env.js'
import authRoutes from './auth.routes.js'
import userRoutes from './user.routes.js'
import songRoutes from './song.routes.js'
import playlistRoutes from './playlist.routes.js'
import searchRoutes from './search.routes.js'
import historyRoutes from './history.routes.js'
import reportRoutes from './report.routes.js'
import adminRoutes from './admin.routes.js'
import youtubeRoutes from './youtube.routes.js'
import catalogueRoutes from './catalogue.routes.js'

const router = Router()

// Small health check - handy for verifying the backend is up.
router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } })
})

/**
 * Public capability flags.
 *
 * Lets the front end adapt to how this particular deployment is configured -
 * most importantly, hiding the upload UI when the host cannot durably store
 * uploaded files (ephemeral container disk).
 *
 * Only booleans are exposed. No key, URI or host name is returned here, so this
 * endpoint is safe to call without authentication.
 */
router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      uploadsEnabled: config.uploadsEnabled,
      youtubeEnabled: Boolean(config.youtube.apiKey),
    },
  })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/songs', songRoutes)
router.use('/playlists', playlistRoutes)
router.use('/search', searchRoutes)
router.use('/history', historyRoutes)
router.use('/reports', reportRoutes)
router.use('/admin', adminRoutes)
// YouTube discovery (metadata only; playback uses YouTube's official embed).
router.use('/youtube', youtubeRoutes)
// Source-aware catalogue: unified search + Home rails across every source.
router.use('/catalogue', catalogueRoutes)

export default router
