import localDriver from './local.driver.js'

/**
 * Storage facade.
 *
 * Controllers only ever talk to this module, never to a concrete driver.
 * Swapping local disk for S3/R2/Cloudinary later means writing a new driver
 * with the same interface and changing the DRIVER constant below.
 *
 * Driver interface:
 *   name           string
 *   save(file, folder)      -> { key, url } | null   (multer file)
 *   saveDataUrl(url, folder)-> { key, url } | null
 *   remove(key)             -> boolean
 *   getUrl(key)             -> string
 */

const DRIVERS = {
  local: localDriver,
  // s3: s3Driver,   <- future: uncomment once implemented
}

const activeName = process.env.STORAGE_DRIVER || 'local'
const driver = DRIVERS[activeName]

if (!driver) {
  throw new Error(
    `Unknown STORAGE_DRIVER "${activeName}". Available drivers: ${Object.keys(DRIVERS).join(', ')}`,
  )
}

export const storage = {
  driverName: driver.name,

  save: (file, folder) => driver.save(file, folder),
  saveDataUrl: (dataUrl, folder) => driver.saveDataUrl(dataUrl, folder),
  remove: (key) => driver.remove(key),
  getUrl: (key) => driver.getUrl(key),
}

export const FOLDERS = {
  AUDIO: 'audio',
  IMAGES: 'images',
}

export default storage
