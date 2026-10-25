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
  /**
   * iTunes Search API (catalogue discovery + preview playback).
   *
   * This provider needs NO API KEY and NO SECRET. Apple publishes the Search API
   * for use without registration, which is precisely why it can serve as the
   * always-available discovery source when YouTube's daily quota is spent.
   * There is deliberately nothing secret in this block.
   *
   * COMPLIANCE (Apple's terms, enforced by itunes.service.js):
   * - Previews are PROMOTIONAL: streamed from Apple's own host, never
   *   downloaded, saved, proxied or cached by us.
   * - Results must carry attribution and a link to the store, which the UI
   *   renders. See `attributionText` on every normalized track.
   * - A preview is ~30 seconds. It is NEVER presented as the full recording,
   *   which is why tracks carry `isPreview` and `previewDurationSeconds`.
   *
   * Full-length playback remains YouTube's official embedded player.
   */
  itunes: {
    // Kill-switch, so the provider can be withdrawn without a code change.
    enabled: process.env.ITUNES_SOURCE_ENABLED !== 'false',
    // Storefront used when the caller does not specify one.
    country: process.env.ITUNES_COUNTRY || 'US',
    // Official Search API endpoint. Not user-configurable.
    searchUrl: 'https://itunes.apple.com/search',
    // ~30s previews. Kept short and clearly separate from real durations.
    previewSeconds: 30,
    // Metadata stays fresh for 30 minutes; the endpoint allows ~20 calls/min.
    cacheTtlSeconds: Number(process.env.ITUNES_CACHE_TTL_SECONDS) || 1800,
    maxResults: Number(process.env.ITUNES_MAX_RESULTS) || 25,
    requestTimeoutMs: Number(process.env.ITUNES_TIMEOUT_MS) || 8000,
  },

  /**
   * Jamendo (licensed, full-length catalogue audio).
   *
   * This is the first source that can supply the WHOLE RECORDING of a track
   * from a third-party catalogue, rather than a promotional excerpt.
   *
   * THE CREDENTIAL
   * --------------
   * Jamendo requires a `client_id`, issued by devportal.jamendo.com. It is a
   * SERVER credential: it is read here, it goes into the upstream URL, and it
   * never leaves the backend. It is deliberately NOT in the client bundle, so
   * it can never be recovered from the Android APK.
   *
   * COMPLIANCE (Jamendo's API Terms of Use, enforced in jamendo.service.js):
   *
   * - NON-COMMERCIAL USE ONLY. "The API may be used freely for non-commercial
   *   uses. For any other type of use ... please contact our sales team at
   *   licensing@jamendo.com." If MUSICA ever monetises, a paid licence is
   *   required. That is a decision for the owner, not something this code can
   *   resolve, so it is recorded here where it will be seen.
   *
   * - NO OFFLINE ACCESS. "Applications must not be specifically designed to
   *   cache the content nor offering an offline access to the content."
   *   The download URL Jamendo publishes is therefore NEVER requested, stored
   *   or offered, even when the artist permits it. `offline` is false below
   *   and the provider enforces it.
   *
   * - ATTRIBUTION. Every track carries its own Creative Commons licence, and
   *   the UI must show it and link to the track page.
   *
   * - DO NOT REPLICATE JAMENDO'S EXPERIENCE, and do not circumvent the
   *   documented rate limits. The cache and the request budget below exist
   *   for the second reason.
   */
  jamendo: {
    // The Client ID from devportal.jamendo.com. Empty means "not configured",
    // and the provider then reports itself unavailable rather than failing
    // every search.
    clientId: process.env.JAMENDO_CLIENT_ID || '',
    // Kill-switch, so the provider can be withdrawn without a code change.
    enabled: process.env.JAMENDO_SOURCE_ENABLED !== 'false',
    // Official API endpoint. Not user-configurable.
    searchUrl: 'https://api.jamendo.com/v3.0/tracks/',
    // The audio rendition asked for. mp32 is VBR at good quality; the API's
    // default is mp31, which is only 96 kbps. flac and ogg are also available.
    audioFormat: process.env.JAMENDO_AUDIO_FORMAT || 'mp32',
    // Artwork size. The API accepts up to 600.
    imageSize: Number(process.env.JAMENDO_IMAGE_SIZE) || 300,
    // Metadata stays fresh for 30 minutes; the API allows ~20 calls/min.
    cacheTtlSeconds: Number(process.env.JAMENDO_CACHE_TTL_SECONDS) || 1800,
    maxResults: Number(process.env.JAMENDO_MAX_RESULTS) || 25,
    // 12s, not 8s. The live check showed a COLD first connection to the API
    // taking longer than 8 seconds and being cut off, while the very next
    // request succeeded instantly. A timeout that fires on a cold start
    // reports a working provider as broken, which is worse than a slow answer.
    requestTimeoutMs: Number(process.env.JAMENDO_TIMEOUT_MS) || 12000,
  },
}

export default config
