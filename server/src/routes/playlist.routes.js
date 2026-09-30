import { Router } from 'express'
import { body, query } from 'express-validator'
import * as playlists from '../controllers/playlist.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { uploadSongMedia, handleUploadErrors } from '../middleware/upload.js'

const router = Router()

router.get(
  '/',
  optionalAuth,
  [
    query('scope').optional({ values: 'falsy' }).isIn(['mine', 'public']).withMessage('Unknown scope'),
    query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be positive'),
    query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  ],
  validate,
  // "mine" only makes sense for a signed-in user.
  playlists.listPlaylists,
)

router.post(
  '/',
  requireAuth,
  [body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Playlist name is required')],
  validate,
  playlists.createPlaylist,
)

router.get('/:id', optionalAuth, playlists.getPlaylist)

router.put(
  '/:id',
  requireAuth,
  uploadSongMedia, // only the `cover` field is used here
  handleUploadErrors,
  playlists.updatePlaylist,
)

router.delete('/:id', requireAuth, playlists.deletePlaylist)

// --- Songs inside a playlist ---

router.post(
  '/:id/songs',
  requireAuth,
  playlists.addSongs,
)

router.delete('/:id/songs/:songId', requireAuth, playlists.removeSong)

router.put(
  '/:id/songs/order',
  requireAuth,
  [body('songIds').isArray({ min: 1 }).withMessage('Send the song ids as an array')],
  validate,
  playlists.reorderSongs,
)

export default router
