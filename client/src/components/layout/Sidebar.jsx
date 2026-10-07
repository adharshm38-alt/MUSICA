import { NavLink, useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '../../navigation'
import { useAuth } from '../../context/AuthContext'
import { useServerConfig } from '../../config/serverConfig'
import { useToast } from '../../context/ToastContext'
import { cx } from '../../utils/format'
import Icon from '../ui/Icon'
import Avatar from '../ui/Avatar'
import Logo from './Logo'

/** Desktop left sidebar: logo, nav list, and the logged-in user at the bottom. */
export default function Sidebar() {
  const { user, isAuthenticated, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { uploadsEnabled } = useServerConfig()

  const handleLogout = async () => {
    await logout()
    toast.success('You have been logged out.')
    navigate('/login')
  }

  return (
    <aside
      className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-white/10 lg:flex"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="px-5 py-5">
        <Logo />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const locked = item.requiresAuth && !isAuthenticated
            // Items that need a durable upload store are removed entirely when
            // the server has uploads turned off, rather than shown and then
            // refused.
            if (item.requiresUploads && !uploadsEnabled) return null
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={(event) => {
                    if (locked) {
                      event.preventDefault()
                      toast.info('Please log in to continue.')
                      navigate('/login')
                    }
                  }}
                  className={({ isActive }) =>
                    cx(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-gradient-to-r from-brand-500/25 to-accent-pink/10 text-white'
                        : 'text-muted hover:bg-white/5 hover:text-white',
                      locked && 'opacity-60',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active indicator bar */}
                      <span
                        className={cx(
                          'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-brand transition-all duration-300',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <Icon
                        name={item.icon}
                        className={cx(
                          'h-5 w-5 transition-transform duration-200 group-hover:scale-110',
                          isActive && 'text-brand-400',
                        )}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Logged-in user */}
      <div className="border-t border-white/10 p-3">
        {isAuthenticated ? (
          <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5">
            <Avatar src={user?.avatarUrl} name={user?.displayName || user?.username} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {user?.displayName || user?.username}
              </p>
              <p className="truncate text-xs text-muted">@{user?.username}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-icon"
              aria-label="Log out"
              title="Log out"
            >
              <Icon name="logout" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary w-full"
          >
            Log in
          </button>
        )}
      </div>
    </aside>
  )
}
