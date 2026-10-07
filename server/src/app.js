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
  //
  // CSP is enabled in production, but the directives below are widened just
  // enough for YouTube's OFFICIAL embedded player to work:
  //   - frame-src         : the embed iframe (youtube-nocookie.com)
  //   - script-src        : the IFrame Player API script from youtube.com
  //   - img-src/connect-src : thumbnails and the API endpoints the player uses
  // The player stays visible and is never hidden or overlaid - see
  // client/src/components/player/YouTubeFrame.jsx.
  const CSP_DIRECTIVES = {
    defaultSrc: ["'self'"],
    // Vite's dev client injects inline styles/scripts.
    scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https://i.ytimg.com', 'https://*.ggpht.com', 'https://*.googleusercontent.com'],
    mediaSrc: ["'self'", 'blob:', 'https://*.muxedcdn.com', 'https://*.googlevideo.com'],
    connectSrc: ["'self'", 'https://www.youtube.com', 'https://*.googlevideo.com'],
    frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://www.youtube.com'],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: config.isProduction
        ? { useDefaults: false, directives: CSP_DIRECTIVES }
        : false,
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
