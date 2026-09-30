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
}

export default config
