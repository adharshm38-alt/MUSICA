import { Router } from 'express'
import * as history from '../controllers/history.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Every history route belongs to the signed-in user.
router.use(requireAuth)

router.get('/', history.getHistory)
router.delete('/', history.clearHistory)
router.delete('/:songId', history.removeFromHistory)

export default router
