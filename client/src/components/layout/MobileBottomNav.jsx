import { NavLink, useNavigate } from 'react-router-dom'
import { MOBILE_NAV, NAV_ITEMS } from '../../navigation'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { cx } from '../../utils/format'
import Icon from '../ui/Icon'

/**
 * Mobile bottom navigation bar.
 * Sits below the compact player; more destinations live under "More".
 */
export default function MobileBottomNav() {
  const { isAuthenticated } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const items = NAV_ITEMS.filter((item) => MOBILE_NAV.includes(item.to))

  // Secondary actions reachable from the "+" / more button.
  const secondary = NAV_ITEMS.filter(
    (item) => !MOBILE_NAV.includes(item.to) && item.requiresAuth && isAuthenticated,
  )

  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 border-t border-white/10 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-6">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-white' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    className={cx('h-[22px] w-[22px]', isActive && 'text-brand-400')}
                  />
                  <span>{item.label}</span>
                  {isActive ? (
                    <span className="absolute top-1 h-1 w-1 rounded-full bg-brand-400" />
                  ) : null}
                </>
              )}
            </NavLink>
          </li>
        ))}

        {/* More / quick actions */}
        <li>
          <button
            type="button"
            onClick={() => {
              if (secondary.length) navigate(secondary[0].to)
              else {
                toast.info('Log in to upload and manage your music.')
                navigate('/login')
              }
            }}
            className="flex w-full flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted transition-colors"
          >
            <Icon name="plus" className="h-[22px] w-[22px]" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
