import { useCallback } from 'react'
import { cx } from '../../utils/format'

/**
 * Accessible seek bar. Uses a real <input type="range"> so it is fully
 * keyboard operable, then paints the progress on top with a gradient.
 *
 * Two visual variants:
 *   default  - full track with a thumb on hover/focus (player, desktop bar)
 *   hairline - 2px, no thumb, for the mini-player dock where there is no room
 *              for an interactive affordance
 */
export default function ProgressBar({
  value = 0,
  max = 0,
  onChange,
  className = '',
  label = 'Seek',
  disabled = false,
  variant = 'default',
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const hairline = variant === 'hairline'

  const handleChange = useCallback(
    (event) => onChange?.(Number(event.target.value)),
    [onChange],
  )

  if (hairline) {
    // Position only: the dock strip is a progress indicator, not a control, so
    // it is hidden from assistive tech to avoid announcing a second seek widget.
    return (
      <div className={cx('h-full w-full overflow-hidden', className)} aria-hidden="true">
        <div
          className="h-full bg-gradient-to-r from-brand-400 to-accent-pink transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    )
  }

  return (
    <div className={cx('group/bar relative flex w-full items-center', className)}>
      {/* Visual track */}
      <div className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 via-accent-pink to-accent-blue transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Real range input on top, invisible but focusable/draggable */}
      <input
        type="range"
        min={0}
        max={max || 0}
        step={0.1}
        value={Math.min(value, max || 0)}
        onChange={handleChange}
        disabled={disabled || max <= 0}
        aria-label={label}
        aria-valuetext={`${Math.floor(value)} of ${Math.floor(max)} seconds`}
        className="relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent
                   [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:w-0
                   [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent
                   [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                   [&::-webkit-slider-thumb]:opacity-0 [&::-webkit-slider-thumb]:transition-opacity
                   group-hover/bar:[&::-webkit-slider-thumb]:opacity-100
                   focus-visible:[&::-webkit-slider-thumb]:opacity-100
                   disabled:cursor-not-allowed"
      />
    </div>
  )
}