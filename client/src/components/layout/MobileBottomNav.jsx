import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { NAV_ITEMS, MOBILE_NAV } from '../../navigation'
import { useAuth } from '../../context/AuthContext'
import { useServerConfig } from '../../config/serverConfig'
import { useToast } from '../../context/ToastContext'
import { cx } from '../../utils/format'
import Icon from '../ui/Icon'

/**
 * Mobile bottom navigation.
 *
 * Four primary destinations, thumb-reachable, with an active pill so the current
 * location is obvious at a glance. Secondary destinations live behind the
 * profile button rather than crowding the bar.
 *
 * Hidden only when the fullscreen player is open, which is the one case where it
 * must get out of the way.
 */
export default function MobileBottomNav() {
  const { isAuthenticated } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { uploadsEnabled } = useServerConfig()

  const items = NAV_ITEMS.filter((item) => MOBILE_NAV.includes(item.to))

  // Secondary actions reachable from the profile/overflow button.
  const secondary = NAV_ITEMS.filter(
    (item) =>
      !MOBILE_NAV.includes(item.to)
      && item.requiresAuth
      && isAuthenticated
      && !(item.requiresUploads && !uploadsEnabled),
  )

  return (
    <nav
      className="glass-dock fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to} className="flex justify-center">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  // The pill is the active indicator; the label stays visible at
                  // all times so the bar does not reflow when navigating.
                  'flex min-h-11 w-full max-w-[84px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors duration-200',
                  isActive ? 'bg-white/[0.10] text-white' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    className={cx(
                      'h-[22px] w-[22px] transition-transform duration-200',
                      isActive && 'scale-110 text-brand-400',
                    )}
                  />
                  <span className="text-[10px] leading-tight font-semibold">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}

        {/* Overflow: everything that does not earn a permanent slot. */}
        <li className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (secondary.length) navigate(secondary[0].to)
              else if (isAuthenticated) navigate('/profile')
              else {
                toast.info('Log in to upload and manage your music.')
                navigate('/login')
              }
            }}
            className="flex min-h-11 w-full max-w-[84px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-muted transition-colors duration-200 hover:text-white"
            aria-label={isAuthenticated ? 'Profile and more' : 'Log in'}
          >
            <Icon name="user" className="h-[22px] w-[22px]" />
            <span className="text-[10px] leading-tight font-semibold">
              {isAuthenticated ? 'You' : 'Log in'}
            </span>
          </button>
        </li>
      </ul>
    </nav>
  )
}