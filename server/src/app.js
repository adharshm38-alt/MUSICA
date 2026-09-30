import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'

import config from './config/env.js'
import routes from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'

export function createApp() {
  const app = express()

  // Trust the first proxy (Render / Railway / nginx) so rate limiting and
  // req.ip work correctly in production.
  app.set('trust proxy', 1)

  // Security headers. Cross-origin media is needed for <audio> playback.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: config.isProduction ? undefined : false,
    }),
  )

  // Only the frontend origin may call this API.
  app.use(
    cors({
      origin: config.clientUrl.split(',').map((origin) => origin.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())

  if (!config.isProduction) app.use(morgan('dev'))

  // Broad safety net against traffic floods; specific routes add tighter limits.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests, please slow down' },
    }),
  )

  // Local media files. In production this would be replaced by the CDN.
  app.use(
    '/uploads',
    express.static(config.uploadsDir, {
      maxAge: config.isProduction ? '7d' : 0,
      // Range requests let the browser seek inside audio files.
      acceptRanges: true,
    }),
  )

  app.use('/api', routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}

export default createApp
