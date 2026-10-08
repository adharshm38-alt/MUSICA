import axios from 'axios'
import { getApiBaseUrl, getApiOrigin } from '../config/runtime'

// Resolved at runtime (see config/runtime.js) so one APK can be pointed at a
// different backend without rebuilding it.
export const BASE_URL = getApiBaseUrl()

/**
 * Origin of the API server, e.g. "http://localhost:5000".
 * Used to turn stored media paths ("/uploads/audio/x.mp3") into absolute URLs
 * so <audio> can load them no matter which host serves the front end.
 * Empty string when the API is same-origin (proxied), in which case relative
 * paths work as-is.
 */
export const API_ORIGIN = getApiOrigin()

export const TOKEN_KEY = 'musica.token'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send the httpOnly auth cookie
  timeout: 20000,
})

/** Attach the stored JWT to every outgoing request. */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * True when a request failed because the production backend was unreachable,
 * rather than because the app did something wrong.
 *
 * Render's free tier idles a free web service to sleep and then has to boot it
 * again on the next request, which typically takes tens of seconds. To a user
 * that looks exactly like "the app is broken", so it is worth distinguishing:
 * the honest message is that the server is waking up, and a retry will work.
 */
export function isServerWakingUp(error) {
  if (!error) return false
  // No response at all: DNS failure, connection refused, TLS problem, offline.
  if (error.response) return false
  const code = error.code || ''
  if (code === 'ECONNABORTED') return true
  return [
    'ERR_NETWORK',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
  ].includes(code)
}

/**
 * Turn any axios error into a plain Error with a message that is safe to
 * show directly in a toast.
 */
export function toFriendlyError(error) {
  if (error?.response?.data?.message) return error.response.data.message
  if (error?.code === 'ECONNABORTED') {
    return 'The request took too long. Please try again.'
  }
  if (!error?.response) {
    // Do not mention a local port: in production there is no local server, and
    // telling a phone user to check "port 5000" would be actively misleading.
    return 'MUSICA server is waking up. Please try again in a moment.'
  }
  return 'Something went wrong. Please try again.'
}

/** Unwrap the backend's { data } envelope and always reject on non-2xx. */
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)

export default api
