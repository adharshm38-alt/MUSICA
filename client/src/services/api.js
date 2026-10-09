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
 * True when a request failed without ever getting an HTTP response.
 *
 * This covers several genuinely different situations that JavaScript cannot
 * always tell apart, because a blocked cross-origin request and a genuinely
 * unreachable host both surface as "no response":
 *
 *   - the production backend is asleep and still booting (Render cold start)
 *   - the API rejected this client's Origin (CORS), so the browser withheld the
 *     response from the app
 *   - there is no network at all
 *
 * It is deliberately NOT named isServerAsleep: asserting a cause we cannot
 * observe is how a healthy server ended up being blamed for a CORS rejection.
 */
export function isUnreachable(error) {
  if (!error) return false
  // A response arrived, so the server was reachable and did answer.
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
    // No response at all. Two plausible causes, so name both rather than
    // guessing at one: the device may be offline, or the server may still be
    // starting. `navigator` is read defensively so that this can never itself
    // throw and hide the underlying failure.
    //
    // Do not mention a local port: in production there is no local server, and
    // telling a phone user to check "port 5000" would be actively misleading.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return offline
      ? 'You appear to be offline. Check your connection and try again.'
      : 'Could not reach the MUSICA server. It may still be starting up, so please try again.'
  }
  return 'Something went wrong. Please try again.'
}

/** Unwrap the backend's { data } envelope and always reject on non-2xx. */
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)

export default api
