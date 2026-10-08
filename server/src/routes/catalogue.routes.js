import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import * as catalogue from '../controllers/catalogue.controller.js'
import { optionalAuth } from '../middleware/auth.js'

/**
 * Catalogue routes: source-aware Home and unified Search.
 *
 * These sit alongside the existing /api/songs and /api/search routes, which are
 * unchanged, so anything already depending on them keeps working.
 *
 * Search here reaches every available source at once. It is NOT the endpoint
 * the search UI calls for YouTube-only quota - it fans out across the registry
 * and is rate limited below.
 */
const router = Router()

/** Which sources are configured and available. Safe and cheap. */
router.get('/sources', catalogue.sources)

/**
 * Home rails. Requires optional auth because "Recents" is viewer-specific and
 * omitted for anonymous visitors.
 */
router.get('/home', optionalAuth, catalogue.home)

/**
 * Unified music search across sources.
 *
 * Cost note: a query reaches the local database and, when configured, the
 * YouTube Data API (search.list = 100 units, and the service-layer limiter caps
 * that at 12/min). Because this route fans out to YouTube internally, it needs
 * its OWN limiter: without one it would simply forward to the inner limiter and
 * return a confusingly empty, degraded result once that was tripped, and Home's
 * automatic Quick Picks would help burn the caller's allowance.
 *
 * The limit here is deliberately more generous than the inner one so an ordinary
 * burst of browsing does not trip it before the inner cap, but it still stops a
 * single client from draining the shared daily quota.
 */
const catalogueSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many searches. Please wait a moment and try again.',
  },
})

router.get('/search', optionalAuth, catalogueSearchLimiter, catalogue.search)

/** Playback resolution for one track. */
router.get('/track/:sourceId/:sourceTrackId', optionalAuth, catalogue.resolve)

export default router