import { memo } from 'react'
import { PATHS } from './paths'

/**
 * Single SVG icon component for the whole app.
 * Keeps the bundle small (no icon library) and consistent stroke styling.
 *
 * <Icon name="play" className="h-5 w-5" filled />
 */
function IconBase({ name, className = 'h-5 w-5', filled = false, strokeWidth = 1.8, ...rest }) {
  const path = PATHS[name]
  if (!path) {
    if (import.meta.env.DEV) console.warn(`[Icon] unknown icon "${name}"`)
    return null
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={path} />
    </svg>
  )
}

export const Icon = memo(IconBase)

/** Filled heart for the "liked" state. */
export function HeartIcon({ liked = false, className = 'h-5 w-5', strokeWidth = 1.8 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={liked ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS.heart} />
    </svg>
  )
}

export default Icon
