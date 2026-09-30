import { Router } from 'express'
import { query } from 'express-validator'
import * as search from '../controllers/search.controller.js'
import { optionalAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'

const router = Router()

// GET /api/search?q=...&type=all|songs|artists|albums|playlists
router.get(
  '/',
  optionalAuth,
  [
    query('q').trim().isLength({ min: 1, max: 100 }).withMessage('Enter something to search for'),
    query('type')
      .optional({ values: 'falsy' })
      .isIn(['all', 'songs', 'artists', 'albums', 'playlists'])
      .withMessage('Unknown search type'),
  ],
  validate,
  search.search,
)

// GET /api/search/suggest?q=... - type-ahead suggestions
router.get('/suggest', optionalAuth, search.suggest)

export default router
