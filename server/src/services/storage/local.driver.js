import fs from 'node:fs/promises'
import path from 'node:path'
import config from '../../config/env.js'

/**
 * Local filesystem storage driver.
 *
 * This is the development default. To move to S3 / Cloudflare R2 / etc.
 * later, add a sibling driver exposing the same four functions and switch
 * it in `storage/index.js` - no controller changes required.
 */

const publicUrl = (relativePath) => `/uploads/${relativePath}`

/**
 * Extension lookup for the seed script's base64 uploads.
 * The extension matters: express.static picks the Content-Type from it,
 * so a WAV saved as ".jpg" would be served as image/jpeg and refuse to play.
 */
const EXTENSION_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
}

export const localDriver = {
  name: 'local',

  /** Absolute public URL for a stored key. */
  getUrl: (key) => publicUrl(key),

  /** Reads a multer file from the temp dir and moves it into place. */
  async save(file, folder) {
    if (!file) return null
    const relative = path.join(folder, file.filename)
    const destination = path.join(config.uploadsDir, folder, file.filename)

    await fs.mkdir(path.dirname(destination), { recursive: true })
    try {
      await fs.rename(file.path, destination)
    } catch {
      // rename() fails across filesystems (e.g. some /tmp mounts); fall back
      // to copy + unlink.
      await fs.copyFile(file.path, destination)
      await fs.unlink(file.path).catch(() => {})
    }

    return { key: relative, url: publicUrl(relative) }
  },

  /** Saves a base64 data URL (used by the seed script). */
  async saveDataUrl(dataUrl, folder) {
    if (!dataUrl) return null
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
    if (!match) return null

    const [, mimeType, base64] = match
    const extension = EXTENSION_BY_MIME[mimeType]
    if (!extension) {
      throw new Error(`saveDataUrl: unsupported mime type "${mimeType}"`)
    }

    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`
    const relative = path.join(folder, filename)
    const destination = path.join(config.uploadsDir, folder, filename)

    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, Buffer.from(base64, 'base64'))

    return { key: relative, url: publicUrl(relative) }
  },

  /** Best-effort delete. Missing files are not an error. */
  async remove(key) {
    if (!key) return false
    try {
      await fs.unlink(path.join(config.uploadsDir, key))
      return true
    } catch {
      return false
    }
  },
}

export default localDriver
