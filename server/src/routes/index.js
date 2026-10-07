import { Router } from 'express'
import authRoutes from './auth.routes.js'
import userRoutes from './user.routes.js'
import songRoutes from './song.routes.js'
import playlistRoutes from './playlist.routes.js'
import searchRoutes from './search.routes.js'
import historyRoutes from './history.routes.js'
import reportRoutes from './report.routes.js'
import adminRoutes from './admin.routes.js'
import youtubeRoutes from './youtube.routes.js'

const router = Router()

// Small health check - handy for verifying the backend is up.
router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } })
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

export default router
