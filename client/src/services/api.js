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
 * Turn any axios error into a plain Error with a message that is safe to
 * show directly in a toast.
 */
export function toFriendlyError(error) {
  if (error?.response?.data?.message) return error.response.data.message
  if (error?.code === 'ECONNABORTED') return 'The request took too long. Please try again.'
  if (!error?.response) {
    return 'Cannot reach the MUSICA server. Is the backend running on port 5000?'
  }
  return 'Something went wrong. Please try again.'
}

/** Unwrap the backend's { data } envelope and always reject on non-2xx. */
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)

export default api
