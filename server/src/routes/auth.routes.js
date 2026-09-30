import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import * as auth from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { uploadAvatar, handleUploadErrors } from '../middleware/upload.js'

const router = Router()

// Slow down brute-force login attempts (per IP).
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in a few minutes.' },
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many accounts created from this device. Try again later.' },
})

// POST /api/auth/register
router.post(
  '/register',
  registerLimiter,
  uploadAvatar,
  handleUploadErrors,
  [
    body('username')
      .trim()
      .toLowerCase()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3-30 characters')
      .matches(/^[a-z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers and underscores'),
    body('displayName').trim().isLength({ min: 2, max: 50 }).withMessage('Display name must be 2-50 characters'),
    body('email').trim().isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  auth.register,
)

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  [
    body('email').trim().isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  auth.login,
)

// POST /api/auth/logout
router.post('/logout', auth.logout)

// GET /api/auth/me
router.get('/me', requireAuth, auth.me)

// PUT /api/auth/password
router.put(
  '/password',
  requireAuth,
  [
    body('currentPassword').notEmpty().withMessage('Enter your current password'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  validate,
  auth.changePassword,
)

// DELETE /api/auth/account
router.delete('/account', requireAuth, auth.deleteAccount)

export default router
