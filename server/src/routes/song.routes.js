import { Router } from 'express'
import { query } from 'express-validator'
import * as songs from '../controllers/song.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { uploadSongMedia, handleUploadErrors } from '../middleware/upload.js'

const router = Router()

// NOTE: /discover must be declared before /:id so it is not treated as an id.
router.get('/discover', optionalAuth, songs.getDiscover)

router.get(
  '/',
  optionalAuth,
  [
    query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be a positive number'),
    query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
    query('sort').optional({ values: 'falsy' }).isIn(['newest', 'popular', 'liked', 'title']).withMessage('Unknown sort option'),
  ],
  validate,
  songs.listSongs,
)

router.get('/liked', requireAuth, songs.getLikedSongs)
router.get('/mine', requireAuth, songs.getMySongs)

router.post(
  '/',
  requireAuth,
  uploadSongMedia,
  handleUploadErrors,
  songs.createSong,
)

router.post('/:id/play', optionalAuth, songs.recordPlay)

router.get('/:id', optionalAuth, songs.getSong)

router.put(
  '/:id',
  requireAuth,
  uploadSongMedia,
  handleUploadErrors,
  songs.updateSong,
)

router.delete('/:id', requireAuth, songs.deleteSong)

router.post('/:id/like', requireAuth, songs.likeSong)
router.delete('/:id/like', requireAuth, songs.unlikeSong)

export default router
