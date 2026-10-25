/**
 * Provider health checks.
 *
 * WHAT "HEALTH" MEANS HERE
 * -----------------------
 * A real answer from a real request, not a stored flag. Each probe contacts
 * the provider it describes and reports what actually happened:
 *
 *   local   - can the database be reached and queried?
 *   itunes  - does Apple's Search API answer right now?
 *   youtube - is the API key accepted, and is any quota left?
 *
 * The YouTube probe deliberately uses videos.list (1 unit) and never
 * search.list (100 units), so checking the health of a provider can never
 * consume the budget it is reporting on.
 *
 * WHY A PROBE AND NOT A FLAG
 * --------------------------
 * A provider being "configured" says nothing about whether it is working.
 * A key can be revoked, an upstream can be down, a quota can be spent. The
 * listener needs the difference, because it decides whether to wait, to sign
 * in, or to try something else.
 */

import * as youtube from '../youtube.service.js'
import * as itunes from './itunes.service.js'
import * as jamendo from './jamendo.service.js'
import { SOURCE_STATUS } from '../youtube.service.js'

/** How long a single probe may take before it is called a failure. */
const PROBE_TIMEOUT_MS = 8000

/**
 * Runs `fn` with a deadline.
 *
 * A provider that hangs must not hang the settings screen, so a probe that
 * overstays is reported as unreachable rather than left pending forever.
 */
async function withTimeout(fn, timeoutMs = PROBE_TIMEOUT_MS) {
  let timer
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('The provider did not respond in time.')),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** True when a status means the provider is usable. */
function isHealthy(status) {
  return status === SOURCE_STATUS.AVAILABLE
}

/**
 * Probes the local library.
 *
 * A count is enough: it proves the database answered a query, which is the
 * thing that actually matters. It is also the cheapest possible probe.
 */
async function probeLocal({ models }) {
  const startedAt = Date.now()
  try {
    const count = await withTimeout(async () => {
      if (!models?.Song) return null
      return models.Song.countDocuments({ isActive: true })
    })
    const latencyMs = Date.now() - startedAt

    if (count === null) {
      return {
        status: SOURCE_STATUS.UNAVAILABLE,
        message: 'The local library is not connected.',
      }
    }
    return {
      status: SOURCE_STATUS.AVAILABLE,
      message: `Local library is reachable. ${count} track${count === 1 ? '' : 's'} available.`,
      latencyMs,
      detail: { tracks: count },
    }
  } catch (error) {
    return {
      status: SOURCE_STATUS.ERROR,
      message: 'The local library could not be reached.',
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * Probes iTunes.
 *
 * A real search against Apple's live API. The query is deliberately dull so
 * the answer is about the API being reachable, not about any particular song.
 */
async function probeItunes() {
  const startedAt = Date.now()
  try {
    // bypassCache: a probe must reflect the provider's state RIGHT NOW, not
    // what a cached search from up to half an hour ago said.
    const result = await withTimeout(() =>
      itunes.searchSongs({ query: 'music', limit: 1, bypassCache: true }),
    )
    const latencyMs = Date.now() - startedAt
    const count = result?.results?.length ?? 0

    if (count === 0) {
      return {
        status: SOURCE_STATUS.NO_RESULTS,
        message: 'iTunes answered, but returned nothing.',
        latencyMs,
      }
    }
    return {
      status: SOURCE_STATUS.AVAILABLE,
      message: 'iTunes is reachable and returning results.',
      latencyMs,
      detail: { sampleResults: count },
    }
  } catch (error) {
    const status = error?.sourceStatus || SOURCE_STATUS.ERROR
    return {
      status,
      message:
        status === SOURCE_STATUS.QUOTA_EXCEEDED
          ? 'The iTunes rate limit was reached.'
          : 'The iTunes catalogue could not be reached.',
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * Probes Jamendo.
 *
 * A live call against the real API. The service's own health() does the
 * work, because it knows the difference between "no Client ID configured"
 * and "the provider is switched off" - two different problems with two
 * different fixes, and the listener is told which one it is.
 */
async function probeJamendo() {
  const startedAt = Date.now()
  const result = await jamendo.health()
  return {
    status: result.status,
    message: result.message,
    latencyMs: result.latencyMs ?? Date.now() - startedAt,
  }
}

/**
 * Probes YouTube.
 *
 * Reports the key state and the quota, because they fail differently and the
 * listener needs to know which one it is.
 */
async function probeYoutube() {
  const startedAt = Date.now()
  try {
    const info = await withTimeout(() => youtube.getQuotaInfo())
    const latencyMs = Date.now() - startedAt

    if (!info?.configured) {
      return {
        status: SOURCE_STATUS.UNAVAILABLE,
        message: 'No YouTube API key is configured on the server.',
        latencyMs,
      }
    }
    if (info.status === SOURCE_STATUS.QUOTA_EXCEEDED) {
      return {
        status: SOURCE_STATUS.QUOTA_EXCEEDED,
        message: 'The YouTube daily quota is used up. It resets at midnight UTC.',
        latencyMs,
      }
    }
    if (!isHealthy(info.status)) {
      return {
        status: info.status || SOURCE_STATUS.ERROR,
        message: 'The YouTube Data API could not be reached.',
        latencyMs,
      }
    }
    return {
      status: SOURCE_STATUS.AVAILABLE,
      message: 'YouTube is reachable and the API key works.',
      latencyMs,
    }
  } catch (error) {
    return {
      status: SOURCE_STATUS.ERROR,
      message: 'The YouTube Data API did not respond in time.',
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * Probes one source by id.
 *
 * @param {string} sourceId
 * @param {{models?: object}} [options] the injected models, for the local probe
 * @returns {Promise<{id: string, status: string, ok: boolean, message: string,
 *   latencyMs?: number, detail?: object}>}
 */
export async function probeSource(sourceId, { models } = {}) {
  const startedAt = Date.now()

  let result
  switch (sourceId) {
    case 'local':
      result = await probeLocal({ models })
      break
    case 'itunes':
      result = await probeItunes()
      break
    case 'jamendo':
      result = await probeJamendo()
      break
    case 'youtube':
      result = await probeYoutube()
      break
    default:
      return {
        id: sourceId,
        ok: false,
        status: SOURCE_STATUS.UNAVAILABLE,
        message: 'Unknown source.',
        latencyMs: Date.now() - startedAt,
      }
  }

  return {
    id: sourceId,
    ok: isHealthy(result.status),
    ...result,
  }
}

/** Probes every source at once. */
export async function probeAllSources({ models } = {}) {
  const ids = ['local', 'jamendo', 'itunes', 'youtube']
  const settled = await Promise.allSettled(
    ids.map((id) => probeSource(id, { models })),
  )
  return settled.map((entry, index) =>
    entry.status === 'fulfilled'
      ? entry.value
      : {
          id: ids[index],
          ok: false,
          status: SOURCE_STATUS.ERROR,
          message: 'The check could not be completed.',
        },
  )
}

export default { probeSource, probeAllSources }
