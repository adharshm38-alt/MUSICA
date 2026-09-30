import { Router } from 'express'
import * as users from '../controllers/user.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { uploadAvatar, handleUploadErrors } from '../middleware/upload.js'

const router = Router()

// GET /api/users/:id - public profile (also handles "me")
router.get('/:id', optionalAuth, users.getUser)

// PUT /api/users/:id - edit profile
router.put(
  '/:id',
  requireAuth,
  uploadAvatar,
  handleUploadErrors,
  users.updateUser,
)

// --- Follow ---

router.post('/:id/follow', requireAuth, users.followUser)
router.delete('/:id/follow', requireAuth, users.unfollowUser)

// --- Connections ---

router.get('/:id/connections', optionalAuth, users.listConnections)

export default router
