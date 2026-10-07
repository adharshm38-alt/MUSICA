import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Server capability flags.
 *
 * A single public endpoint, GET /api/config, tells the client which features
 * this particular deployment actually supports. Only booleans come back - no
 * key, URI or host name - so it is safe to call without authentication.
 *
 * Why this is runtime rather than build-time: the same web build and the same
 * APK run against development and production backends. Which features are
 * available depends on the SERVER, not on how the client was compiled.
 *
 * The most important case is uploads. Uploaded audio is written to the server's
 * local disk, so on a host with an ephemeral filesystem uploads cannot
 * survive. Rather than showing a button that silently loses data, the UI hides
 * itself when the server says uploads are off.
 */

/**
 * Optimistic defaults, used until /api/config answers.
 * Uploads default ON so a briefly-slow network never hides working UI; the
 * server response corrects it within a moment.
 */
const defaults = { uploadsEnabled: true, youtubeEnabled: true }

let cached = null
let inflight = null

/** Fetches (and caches) the capability flags. Safe to call repeatedly. */
export async function loadServerConfig() {
  if (cached) return cached
  if (inflight) return inflight

  inflight = api
    .get('/config')
    .then(({ data }) => {
      cached = { ...defaults, ...(data?.data || {}) }
      return cached
    })
    .catch(() => {
      // If the capability endpoint is unreachable, fall back to the defaults
      // rather than breaking the page.
      cached = defaults
      return cached
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

/**
 * Returns the capability flags and re-renders when they arrive.
 * @returns {{uploadsEnabled: boolean, youtubeEnabled: boolean, loaded: boolean}}
 */
export function useServerConfig() {
  const [config, setConfig] = useState(() => cached || { ...defaults, loaded: false })

  useEffect(() => {
    let cancelled = false
    loadServerConfig().then((next) => {
      if (!cancelled) setConfig({ ...next, loaded: true })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return config
}

export default useServerConfig