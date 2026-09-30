import { Router } from 'express'
import { body, query } from 'express-validator'
import * as admin from '../controllers/admin.controller.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'

const router = Router()

// Every admin route needs both a valid session and the admin role.
router.use(requireAuth, requireAdmin)

router.get('/stats', admin.getStats)

// --- Users ---
router.get('/users', admin.listUsers)
router.put(
  '/users/:id/role',
  [body('role').isIn(['user', 'admin']).withMessage('Role must be "user" or "admin"')],
  validate,
  admin.updateUserRole,
)
router.put(
  '/users/:id/status',
  [body('isActive').isBoolean().withMessage('isActive must be true or false')],
  validate,
  admin.updateUserStatus,
)

// --- Songs ---
router.get('/songs', admin.listSongs)
router.delete('/songs/:id', admin.removeSong)

// --- Reports ---
router.get('/reports', admin.listReports)
router.put(
  '/reports/:id',
  [
    body('status')
      .optional()
      .isIn(['open', 'reviewing', 'resolved', 'dismissed'])
      .withMessage('Unknown report status'),
    body('resolutionNote').optional().isLength({ max: 500 }),
  ],
  validate,
  admin.updateReport,
)

export default router
