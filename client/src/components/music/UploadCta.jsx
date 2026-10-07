import { Link } from 'react-router-dom'
import { useServerConfig } from '../../config/serverConfig'
import Icon from '../ui/Icon'

/**
 * A link to the upload page that removes itself when the server has uploads
 * turned off.
 *
 * Uploaded audio is stored on the server's local disk. On a deployment with an
 * ephemeral filesystem (Render's free tier spins down after 15 minutes idle and
 * cannot attach a persistent disk) those files are lost on every redeploy, so
 * offering an upload button there would let a user do work that silently
 * disappears. Rendering nothing is honest; showing a button would not be.
 *
 * @param {{to?: string, className?: string, children?: React.ReactNode}} props
 */
export default function UploadCta({ to = '/upload', className = '', children }) {
  const { uploadsEnabled } = useServerConfig()

  if (!uploadsEnabled) return null

  return (
    <Link to={to} className={className}>
      {children ?? (
        <>
          <Icon name="upload" className="h-4 w-4" />
          Upload a track
        </>
      )}
    </Link>
  )
}