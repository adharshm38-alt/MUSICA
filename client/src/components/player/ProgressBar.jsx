import { useCallback, useRef } from 'react'
import { cx } from '../../utils/format'

/**
 * Accessible seek bar. Uses a real <input type="range"> so it is fully
 * keyboard operable, then paints the progress on top with a gradient.
 */
export default function ProgressBar({
  value = 0,
  max = 0,
  onChange,
  className = '',
  label = 'Seek',
  disabled = false,
}) {
  const trackRef = useRef(null)
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  const handleChange = useCallback(
    (event) => onChange?.(Number(event.target.value)),
    [onChange],
  )

  return (
    <div className={cx('group/bar relative flex w-full items-center', className)}>
      {/* Visual track */}
      <div
        ref={trackRef}
        className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 via-accent-pink to-accent-blue transition-[width] duration-150"
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
        className="relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent
                   [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:w-0
                   [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent
                   [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
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
