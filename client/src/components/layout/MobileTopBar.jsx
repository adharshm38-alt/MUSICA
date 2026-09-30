import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Icon from '../ui/Icon'
import Avatar from '../ui/Avatar'
import Logo from './Logo'

/** Mobile header: logo + search shortcut + avatar. */
export default function MobileTopBar() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
      <Logo />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="btn-icon"
          aria-label="Search"
        >
          <Icon name="search" />
        </button>

        {isAuthenticated ? (
          <Link to="/profile" aria-label="Your profile" className="ml-1 rounded-full">
            <Avatar src={user?.avatarUrl} name={user?.displayName || user?.username} size="sm" />
          </Link>
        ) : (
          <button type="button" onClick={() => navigate('/login')} className="btn-ghost ml-1 px-4 py-1.5 text-xs">
            Log in
          </button>
        )}
      </div>
    </header>
  )
}
