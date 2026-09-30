import { cx } from '../../utils/format'

/**
 * Lightweight CSS "visualizer" for the playing track.
 * Pure CSS transforms (no canvas / WebAudio) so it costs almost nothing.
 */
export default function Visualizer({ isPlaying = false, bars = 5, className = '' }) {
  return (
    <span
      className={cx('flex h-4 items-end gap-[3px]', className)}
      aria-hidden="true"
      data-playing={isPlaying}
    >
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          className="w-[3px] rounded-full bg-gradient-to-t from-brand-500 to-accent-pink"
          style={{
            height: '30%',
            animation: isPlaying
              ? `visualize 900ms ${index * 130}ms ease-in-out infinite alternate`
              : 'none',
          }}
        />
      ))}

      <style>{`
        @keyframes visualize {
          0%   { height: 22%; opacity: 0.6; }
          50%  { height: 70%; opacity: 1; }
          100% { height: 100%; opacity: 0.85; }
        }
      `}</style>
    </span>
  )
}
