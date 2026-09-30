import { useCallback, useEffect, useState } from 'react'
import api, { toFriendlyError } from '../services/api'

/**
 * Generic async loader with loading/error state, so pages don't each
 * reinvent the same three-state pattern.
 *
 *   const { data, loading, error, reload } = useFetch(() => api.get(...), [])
 */
export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.resolve()
      .then(fetcher)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(toFriendlyError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey])

  return { data, loading, error, reload, setData }
}

export default useFetch
