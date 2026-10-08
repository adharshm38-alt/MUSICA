import { cx } from '../../utils/format'
import Icon from '../ui/Icon'

/**
 * Play/Pause transport button with an animated icon swap.
 *
 * The glyph cross-fades and scales rather than being swapped instantly, so the
 * state change is legible without being loud. `key`ing on the state is what
 * remounts the icon and replays the animation; without it the browser would
 * simply replace the node and nothing would animate.
 *
 * Both icon states stay mounted during the transition by rendering the outgoing
 * one with the exit animation, which is what produces the cross-fade.
 */
export default function PlayPauseButton({
  isPlaying,
  onClick,
  size = 'lg',
  className = '',
  label,
}) {
  const dims = {
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
    xl: 'h-20 w-20',
  }[size] || 'h-16 w-16'

  const iconSize = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
    xl: 'h-8 w-8',
  }[size] || 'h-7 w-7'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('play-orb', dims, className)}
      aria-label={label || (isPlaying ? 'Pause' : 'Play')}
      aria-pressed={isPlaying}
    >
      {/* Both glyphs occupy the same grid cell so the orb never resizes. */}
      <span className="relative grid place-items-center">
        <Icon
          key={isPlaying ? 'pause' : 'play'}
          name={isPlaying ? 'pause' : 'play'}
          className={cx(iconSize, 'animate-[icon-in_0.18s_cubic-bezier(0.22,1,0.36,1)_both]')}
          filled
          strokeWidth={2.4}
        />
      </span>
    </button>
  )
}