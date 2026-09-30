import { cx, gradientFor, truncate } from '../../utils/format'
import { PATHS } from '../ui/paths'

const SIZES = {
  xs: 'h-9 w-9',
  sm: 'h-11 w-11',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
  xl: 'h-36 w-36',
  '2xl': 'h-52 w-52',
  full: 'h-full w-full',
}

/** Album artwork with a deterministic gradient fallback + music glyph. */
export default function SongCover({ song = {}, size = 'md', rounded = 'rounded-xl', className = '' }) {
  const coverUrl = song.coverUrl || song.cover?.url
  const label = song.title || song.name || 'No title'
  const seed = `${song._id ?? ''}${label}`
  const gradient = gradientFor(seed)
  const sizeClass = SIZES[size] ?? SIZES.md

  return (
    <span
      className={cx(
        'relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br ring-1 ring-white/10',
        gradient,
        sizeClass,
        rounded,
        className,
      )}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={`Cover art for ${label}`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-1/3 w-1/3 text-white/80"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={PATHS.music} />
        </svg>
      )}
    </span>
  )
}
