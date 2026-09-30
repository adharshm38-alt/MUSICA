import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { useAuth } from './context/AuthContext'

// Lightweight pages load directly; heavier ones are code-split.
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import NotFound from './pages/NotFound'

const Discover = lazy(() => import('./pages/Discover'))
const Search = lazy(() => import('./pages/Search'))
const Library = lazy(() => import('./pages/Library'))
const Playlists = lazy(() => import('./pages/Playlists'))
const Upload = lazy(() => import('./pages/Upload'))
const Following = lazy(() => import('./pages/Following'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail'))
const ArtistProfile = lazy(() => import('./pages/ArtistProfile'))
const Admin = lazy(() => import('./pages/Admin'))
const Report = lazy(() => import('./pages/Report'))

/** Route guard: redirects to /login if not signed in. */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

/** Route guard: admins only. */
function RequireAdmin({ children }) {
  const { isAdmin, isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-brand-400" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public auth pages (no sidebar chrome) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Everything else lives inside the app shell */}
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/search" element={<Search />} />
          <Route path="/report" element={<Report />} />

          <Route
            path="/library"
            element={
              <RequireAuth>
                <Library />
              </RequireAuth>
            }
          />
          <Route
            path="/playlists"
            element={
              <RequireAuth>
                <Playlists />
              </RequireAuth>
            }
          />
          <Route path="/playlist/:id" element={<PlaylistDetail />} />
          <Route path="/artist/:id" element={<ArtistProfile />} />
          <Route
            path="/upload"
            element={
              <RequireAuth>
                <Upload />
              </RequireAuth>
            }
          />
          <Route
            path="/following"
            element={
              <RequireAuth>
                <Following />
              </RequireAuth>
            }
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
