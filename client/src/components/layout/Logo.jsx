import { Link } from 'react-router-dom'
import { cx } from '../../utils/format'

/** The MUSICA wordmark + gradient glyph. */
export default function Logo({ className = '', compact = false, asLink = true }) {
  const content = (
    <span className={cx('group inline-flex items-center gap-2.5', className)}>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-brand shadow-lg shadow-brand-600/30 transition-transform duration-300 group-hover:scale-105">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18V5l11-2v13M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
        </svg>
      </span>

      {!compact ? (
        <span className="text-xl font-black tracking-tight text-white">
          MUSI<span className="text-gradient">CA</span>
        </span>
      ) : null}
    </span>
  )

  if (!asLink) return content

  return (
    <Link to="/" aria-label="MUSICA home" className="rounded-xl">
      {content}
    </Link>
  )
}
