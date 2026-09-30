import { cx, gradientFor, initials } from '../../utils/format'

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
  '2xl': 'h-40 w-40 text-5xl',
}

/**
 * Profile picture with an automatic gradient + initials fallback,
 * so the UI never shows a broken image.
 */
export default function Avatar({
  src,
  name = '',
  size = 'md',
  online = false,
  className = '',
  rounded = 'rounded-full',
}) {
  const sizeClass = SIZES[size] ?? SIZES.md
  const fallback = gradientFor(name || 'musica')

  return (
    <span className={cx('relative inline-block shrink-0', className)}>
      <span
        className={cx(
          'grid place-items-center overflow-hidden bg-gradient-to-br font-bold text-white ring-1 ring-white/10',
          fallback,
          sizeClass,
          rounded,
        )}
      >
        {src ? (
          <img
            src={src}
            alt={name ? `${name}'s profile picture` : 'Profile picture'}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => {
              // Swap to the gradient fallback if the file is missing.
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <span aria-hidden="true">{initials(name)}</span>
        )}
      </span>

      {online ? (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-base-900" />
      ) : null}
    </span>
  )
}
