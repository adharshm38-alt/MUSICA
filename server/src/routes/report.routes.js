import { Router } from 'express'
import { body } from 'express-validator'
import * as reports from '../controllers/report.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { REPORT_REASONS } from '../models/Report.js'

const router = Router()

router.use(requireAuth)

// GET /api/reports/mine
router.get('/mine', reports.getMyReports)

// POST /api/reports
router.post(
  '/',
  [
    body('targetType').isIn(['song', 'user']).withMessage('Choose "song" or "user"'),
    body('targetId').isMongoId().withMessage('Invalid id'),
    body('reason').isIn(REPORT_REASONS).withMessage('Choose a valid reason'),
    body('details').optional().isLength({ max: 1000 }).withMessage('Details are too long'),
  ],
  validate,
  reports.createReport,
)

export default router
