import { Navigate } from 'react-router-dom'
import { useServerConfig } from '../../config/serverConfig'
import { useAuth } from '../../context/AuthContext'

/**
 * Route guard for the upload page.
 *
 * Uploaded audio lives on the server's local disk. On a deployment with an
 * ephemeral filesystem that data cannot survive, so the server reports
 * uploadsEnabled=false and this sends the user home instead of showing a form
 * whose uploads would silently vanish.
 *
 * This is a second line of defence: the UI already hides its upload buttons
 * via <UploadCta>, and the API rejects POST /api/songs with 403 when uploads
 * are disabled. Someone with the page open before a deploy is switched off is
 * still covered here.
 */
export default function RequireUploads({ children }) {
  const { uploadsEnabled, loaded } = useServerConfig()
  const { isAuthenticated } = useAuth()

  // Wait for the capability check before deciding, otherwise a first render
  // could bounce an authenticated user away before the answer arrives.
  if (!loaded) return null

  if (!uploadsEnabled) return <Navigate to="/" replace />
  if (!isAuthenticated) return null

  return children
}