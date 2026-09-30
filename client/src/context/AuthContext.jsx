import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { toFriendlyError } from '../services/api'

const AuthContext = createContext(null)

const TOKEN_KEY = 'musica.token'

/**
 * Holds the logged-in user. The JWT is stored in localStorage so a page
 * refresh keeps you signed in; the token is sent as a Bearer header
 * (and the server also sets an httpOnly cookie for hardening).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const readToken = () => localStorage.getItem(TOKEN_KEY)
  const writeToken = (token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  }

  // Restore the session on first load.
  useEffect(() => {
    let cancelled = false
    const token = readToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!cancelled) setUser(data.data.user)
      })
      .catch(() => {
        writeToken(null)
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials)
    writeToken(data.data.token)
    setUser(data.data.user)
    return data.data.user
  }, [])

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload)
    writeToken(data.data.token)
    setUser(data.data.user)
    return data.data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      // Logging out locally must always succeed, even if the server is down.
      console.warn('[auth] logout request failed, clearing locally anyway', error?.message)
    }
    writeToken(null)
    setUser(null)
  }, [])

  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setUser(data.data.user)
    return data.data.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      token: readToken(),
      login,
      register,
      logout,
      updateUser,
      refresh,
    }),
    [user, loading, login, register, logout, updateUser, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** Re-export so pages can show friendly errors without importing api. */
export { toFriendlyError }
