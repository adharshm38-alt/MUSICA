/**
 * Small formatting helpers shared across the app.
 */

/** Convert seconds -> "m:ss" (e.g. 214 -> "3:34") */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/** Relative time for "3 days ago" style labels. */
export function timeAgo(date) {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  const steps = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
    [Infinity, 'year', 31557600],
  ]
  const divisor = steps.find(([limit]) => seconds < limit)?.[2] ?? 1
  const value = Math.floor(seconds / divisor)
  if (value < 1) return 'just now'
  const label = steps.find(([limit]) => seconds < limit)?.[1] ?? 'second'
  return `${value} ${label}${value === 1 ? '' : 's'} ago`
}

/** 1200 -> "1.2K" */
export function compactNumber(value = 0) {
  const n = Number(value) || 0
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Turn a plain release year into a full date string for display. */
export function formatYear(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return new Date(value).getFullYear()
}

/** Deterministic pleasant gradient for items that have no cover art. */
const GRADIENTS = [
  'from-violet-500 via-fuchsia-500 to-rose-400',
  'from-sky-500 via-indigo-500 to-violet-500',
  'from-emerald-400 via-teal-500 to-cyan-500',
  'from-amber-400 via-orange-500 to-rose-500',
  'from-fuchsia-500 via-purple-500 to-sky-400',
  'from-rose-500 via-pink-500 to-violet-400',
]

export function gradientFor(seed = '') {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

/** First letters of a name, for avatar placeholders. */
export function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  )
}

/** Join class names, dropping falsy values. */
export function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

/** Clamp long text to a fixed number of lines. */
export function truncate(text = '', lines = 2) {
  const style = {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }
  return { style, title: text }
}
