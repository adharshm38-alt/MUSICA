import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'musica.recentSearches'
const MAX_ITEMS = 8

/**
 * Recently-run searches, persisted locally.
 *
 * Deliberately localStorage rather than a new backend collection: recent
 * searches are a per-device convenience, and adding a server endpoint would be
 * a new API surface for no cross-device benefit. This also means the feature
 * cannot break if the network is down.
 *
 * Each entry keeps a little context (artwork, artist) so the list reads as
 * music rather than as a log of strings. That context is a snapshot of what was
 * on screen at the time - it is never treated as live catalogue data.
 */
function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.query === 'string' && item.query.trim())
      .slice(0, MAX_ITEMS)
  } catch {
    // A corrupt or unavailable store must never break the search page.
    return []
  }
}

function write(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* private mode / quota exceeded: recents are a nicety, not a requirement */
  }
}

export function useRecentSearches() {
  const [items, setItems] = useState(read)

  // Keep multiple tabs in sync without re-reading on every render.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setItems(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /**
   * Records a search, moving an existing repeat to the top instead of
   * duplicating it. Passing context is optional.
   */
  const remember = useCallback((query, context = {}) => {
    const trimmed = String(query || '').trim()
    if (trimmed.length < 2) return

    setItems((prev) => {
      const withoutDuplicate = prev.filter(
        (item) => item.query.toLowerCase() !== trimmed.toLowerCase(),
      )
      const next = [{ query: trimmed, at: Date.now(), ...context }, ...withoutDuplicate].slice(
        0,
        MAX_ITEMS,
      )
      write(next)
      return next
    })
  }, [])

  const remove = useCallback((query) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.query !== query)
      write(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setItems([])
    write([])
  }, [])

  return { items, remember, remove, clear }
}

export default useRecentSearches