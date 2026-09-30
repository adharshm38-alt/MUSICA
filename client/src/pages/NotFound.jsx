import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center text-center">
      <div className="animate-scale-in">
        <p className="text-8xl font-black text-gradient">404</p>
        <h1 className="mt-4 text-2xl font-bold text-white">This track doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          The page you&apos;re looking for may have been moved, renamed, or never existed.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="btn-primary px-6 py-3">
            <Icon name="home" className="h-4 w-4" />
            Back to Home
          </Link>
          <Link to="/search" className="btn-ghost px-6 py-3">
            <Icon name="search" className="h-4 w-4" />
            Search music
          </Link>
        </div>
      </div>
    </div>
  )
}
