import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'

import config from './config/env.js'
import routes from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'

/**
 * Origins belonging to the packaged native app shell.
 *
 * Capacitor serves the Android WebView from a LOCAL scheme rather than from a
 * real website, so the app's origin is not the web frontend URL:
 *
 *   androidScheme "https"  -> https://localhost      (current)
 *   androidScheme "http"   -> http://localhost       (older configs)
 *   capacitor://localhost  -> iOS
 *
 * These are not attacker-controlled addresses. They mean "a copy of our own app
 * running on the device", and they are required for the app to work at all.
 *
 * They are kept separate from CLIENT_URL on purpose: CLIENT_URL is the
 * deployer's list of real websites and should stay authoritative, while these
 * are a fixed property of how Capacitor packages an app.
 */
const NATIVE_APP_ORIGINS = [
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
]

/**
 * Decides whether a given Origin may call this API.
 *
 * Supports both calling conventions, which is essential here:
 *
 *   1. `resolveAllowedOrigin(origin)` -> string | false   (direct, testable)
 *   2. `resolveAllowedOrigin(origin, callback)`           (the `cors` package)
 *
 * The second form is the trap: `cors` invokes the function with a NODE-STYLE
 * callback as its second argument and waits for that callback to run. A resolver
 * that ignores the callback and returns a value leaves every request hanging
 * forever, because the middleware never continues to the route.
 *
 * Returning a string echoes it back as `Access-Control-Allow-Origin`, which is
 * required because `credentials: true` forbids the `*` wildcard. Returning
 * `false` omits the header entirely, so the browser blocks the response - the
 * desired outcome for an unknown origin.
 *
 * The echoed value is the REQUEST's own origin, not the canonical allowlist
 * entry, because a browser only accepts the header when it matches the Origin it
 * sent byte for byte.
 *
 * Only an exact, case-insensitive match is accepted. There is no prefix, suffix
 * or wildcard matching, so "https://localhost.attacker.example" can never satisfy
 * the check. Reflecting arbitrary origins would let any hostile page read this
 * API on a user's behalf; this list is what prevents that.
 */
export function resolveAllowedOrigin(requestOrigin, allowedOrCallback) {
  const isCallback = typeof allowedOrCallback === 'function'

  // Three ways to be called, and each has to behave sensibly:
  //   origin                        -> use the configured CLIENT_URL
  //   origin, callback              -> the `cors` package; use CLIENT_URL
  //   origin, "a,b"                 -> an explicit list, for tests
  // Falling back to CLIENT_URL whenever no list was supplied matters: defaulting
  // to undefined would silently drop every configured web origin and leave only
  // the native ones.
  const allowed = isCallback || allowedOrCallback === undefined
    ? config.clientUrl
    : allowedOrCallback

  const permitted = isPermittedOrigin(requestOrigin, allowed)

  if (isCallback) {
    // The `cors` contract is (error, allow). Passing the explicit origin is
    // clearer than passing `true`, which makes cors reflect the request origin.
    // `false` yields no ACAO header at all, so the browser blocks the response.
    allowedOrCallback(null, permitted ? requestOrigin : false)
    return undefined
  }

  return permitted ? requestOrigin : false
}

/** True when the origin exactly matches an allowed web or native-app origin. */
function isPermittedOrigin(requestOrigin, allowed) {
  if (!requestOrigin || typeof requestOrigin !== 'string') return false

  const configured = String(allowed || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const allowedOrigins = [...configured, ...NATIVE_APP_ORIGINS]
  const normalised = requestOrigin.toLowerCase()

  return allowedOrigins.some((origin) => origin.toLowerCase() === normalised)
}

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

  // Only known origins may call this API.
  app.use(
    cors({
      origin: resolveAllowedOrigin,
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
