/**
 * Runtime configuration for the packaged Android app.
 *
 * Vite inlines import.meta.env values at BUILD time, so a single APK built on
 * one machine would otherwise be locked to that machine's API address. This
 * module lets the server URL be changed at runtime instead:
 *
 *   1. A value saved in localStorage (set on the device via the in-app
 *      Server settings screen, or by editing this file before a build).
 *   2. The build-time VITE_API_URL.
 *   3. A sensible default.
 *
 * The default below is deliberately a LAN placeholder. On a real device
 * "localhost" points at the phone itself, so the app could never reach a
 * backend running on your computer. Replace it with your machine's LAN IP,
 * or set it from the app's Server settings screen.
 */

const STORAGE_KEY = 'musica.apiUrl'

/**
 * Placeholder LAN address. Override at runtime from Settings, or set
 * VITE_API_URL before building.
 */
const DEFAULT_API_URL = 'http://192.168.1.100:5000/api'

/** Strips a trailing slash so `${origin}` concatenation stays predictable. */
function clean(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

/** Returns the currently configured API base URL (e.g. http://host:5000/api). */
export function getApiBaseUrl() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return clean(stored)
  const fromBuild = import.meta.env.VITE_API_URL
  if (fromBuild) return clean(fromBuild)
  return DEFAULT_API_URL
}

/**
 * Origin of the API server (e.g. http://host:5000), used to turn stored
 * media paths such as "/uploads/audio/x.mp3" into absolute URLs so <audio>
 * can stream them regardless of which host serves the app.
 * Returns '' when the app is served from the same origin as the API.
 */
export function getApiOrigin() {
  const base = getApiBaseUrl()
  if (!base.startsWith('http')) return ''
  try {
    return new URL(base).origin
  } catch {
    return ''
  }
}

/** Saves a new API base URL at runtime and reloads so it takes effect. */
export function setApiBaseUrl(url) {
  const cleaned = clean(url)
  if (!/^https?:\/\/.+/i.test(cleaned)) {
    throw new Error('Enter a full URL starting with http:// or https://')
  }
  localStorage.setItem(STORAGE_KEY, cleaned)
  window.location.reload()
}

export { STORAGE_KEY, DEFAULT_API_URL }
