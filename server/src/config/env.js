import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// server/src/config -> server/
export const SERVER_ROOT = path.resolve(__dirname, '..', '..')
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..')

dotenv.config({ path: path.join(SERVER_ROOT, '.env') })

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable "${name}". Copy server/.env.example to server/.env and fill it in.`,
    )
  }
  return value
}

const isProduction = process.env.NODE_ENV === 'production'

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT) || 5000,

  // Database
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/musica'),

  // Auth
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // CORS
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Uploads (local driver for development)
  uploadsDir: path.join(SERVER_ROOT, process.env.UPLOADS_DIR || 'uploads'),
  maxAudioSizeMb: Number(process.env.MAX_AUDIO_SIZE_MB) || 25,
  maxImageSizeMb: Number(process.env.MAX_IMAGE_SIZE_MB) || 5,

  /**
   * Whether first-party uploads are accepted.
   *
   * Uploaded audio is written to the local filesystem. On a container host with
   * an ephemeral disk (for example Render's free tier, which also spins down
   * after 15 minutes idle) those files disappear on the next deploy or spin-down,
   * leaving song records in the database whose audio 404s.
   *
   * Set UPLOADS_ENABLED=false in that situation. The upload UI is then hidden
   * and the upload endpoint returns 503, so users are never offered a feature
   * that cannot work. Development keeps uploads on by default, so nothing about
   * local development changes.
   *
   * Existing uploaded songs keep playing either way; this only controls new
   * uploads.
   */
  uploadsEnabled: process.env.UPLOADS_ENABLED !== 'false',

  /**
   * YouTube Data API (discovery only).
   *
   * The key is server-side ONLY. It is never sent to the browser, never
   * exposed through an API response, and must never be committed - it lives
   * in server/.env, which is git-ignored.
   *
   * The app never downloads, extracts, caches or separates YouTube audio.
   * Playback happens exclusively inside YouTube's official embedded player.
   */
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || '',
    // Which Data API version to target.
    apiVersion: 'v3',
    // How long cached video metadata stays fresh (seconds).
    cacheTtlSeconds: Number(process.env.YOUTUBE_CACHE_TTL_SECONDS) || 86400,
    // Hard cap on results returned per page, to keep responses small.
    maxResults: Number(process.env.YOUTUBE_MAX_RESULTS) || 25,
  },
}

export default config
