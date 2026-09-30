import { usePlayer } from '../../context/PlayerContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSocial } from '../../hooks/useSocial'
import { formatTime, cx } from '../../utils/format'
import Icon from '../ui/Icon'
import { HeartIcon } from '../ui/Icon'
import Visualizer from '../music/Visualizer'
import ProgressBar from './ProgressBar'
import SongCover from '../music/SongCover'

/**
 * Persistent player.
 *  - Desktop: full-width bar pinned to the bottom.
 *  - Mobile: compact strip that opens the full-screen player when tapped.
 */
export default function MusicPlayer() {
  const player = usePlayer()
  const { isAuthenticated } = useAuth()
  const toast = useToast()
  const { toggleLike, busyIds } = useSocial()

  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    isLiked,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    openFullPlayer,
  } = player

  const hasSong = Boolean(currentSong)
  const artistLabel = currentSong?.artistName || currentSong?.artist?.displayName || 'Unknown artist'

  // The player tracks the liked song by id, so hand the heart a song object
  // whose isLiked mirrors that state. toggleLike writes the result straight
  // back into the PlayerContext, so both hearts stay in sync.
  const likeTarget = currentSong
    ? { ...currentSong, isLiked, likeCount: currentSong.likeCount ?? 0 }
    : null
  const likePending = Boolean(currentSong?._id && busyIds.has(currentSong._id))

  const handleLike = () => {
    if (!likeTarget) return
    toggleLike(likeTarget)
  }

  if (!hasSong) {
    // Idle placeholder so the layout never jumps.
    return (
      <div className="glass-strong fixed inset-x-0 bottom-0 z-30 hidden lg:block">
        <div className="flex h-[88px] items-center justify-center gap-2 text-sm text-muted">
          <Icon name="music" className="h-4 w-4" />
          Pick a song to start listening
        </div>
      </div>
    )
  }

  // ---------- Desktop ----------
  const desktop = (
    <div className="hidden lg:block">
      <div className="glass-strong fixed inset-x-0 bottom-0 z-30 border-t border-white/10 lg:left-[260px]">
        <div className="grid h-[88px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4">
          {/* Left: artwork + title */}
          <div className="flex min-w-0 items-center gap-3">
            <SongCover song={currentSong} size="sm" rounded="rounded-lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{currentSong.title}</p>
              <p className="truncate text-xs text-muted">{artistLabel}</p>
            </div>

            <button
              type="button"
              onClick={handleLike}
              className="btn-icon ml-1"
              aria-label={isLiked ? 'Unlike this song' : 'Like this song'}
              aria-pressed={isLiked}
              disabled={likePending}
            >
              <HeartIcon liked={isLiked} className={cx('h-[18px] w-[18px]', isLiked && 'text-accent-pink')} />
            </button>
          </div>

          {/* Center: transport */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleShuffle}
                className={cx('btn-icon', shuffle && 'text-brand-400')}
                aria-label="Toggle shuffle"
                aria-pressed={shuffle}
              >
                <Icon name="shuffle" className="h-[18px] w-[18px]" />
              </button>

              <button type="button" onClick={prev} className="btn-icon" aria-label="Previous track">
                <Icon name="prev" className="h-5 w-5" filled />
              </button>

              <button
                type="button"
                onClick={toggle}
                className="grid h-11 w-11 place-items-center rounded-full bg-white text-base-900 transition-transform duration-200 hover:scale-105 active:scale-95"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} className="h-5 w-5" filled strokeWidth={2.2} />
              </button>

              <button type="button" onClick={next} className="btn-icon" aria-label="Next track">
                <Icon name="next" className="h-5 w-5" filled />
              </button>

              <button
                type="button"
                onClick={cycleRepeat}
                className={cx('btn-icon relative', repeat !== 'off' && 'text-brand-400')}
                aria-label={`Repeat: ${repeat}`}
              >
                <Icon name="repeat" className="h-[18px] w-[18px]" />
                {repeat === 'one' ? (
                  <span className="absolute -right-0.5 -top-0.5 rounded bg-brand-500 px-1 text-[8px] font-bold text-white">
                    1
                  </span>
                ) : null}
              </button>
            </div>

            <div className="flex w-[520px] items-center gap-2">
              <span className="w-9 text-right text-[11px] tabular-nums text-muted">
                {formatTime(currentTime)}
              </span>
              <ProgressBar value={currentTime} max={duration} onChange={seek} />
              <span className="w-9 text-[11px] tabular-nums text-muted">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: volume + queue */}
          <div className="flex items-center justify-end gap-2">
            <Visualizer isPlaying={isPlaying} className="mr-1" />

            <button
              type="button"
              onClick={toggleMute}
              className="btn-icon"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              <Icon name={isMuted || volume === 0 ? 'mute' : 'volume'} className="h-[18px] w-[18px]" />
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/10
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(to right, #8b5cf6 ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.1) ${(isMuted ? 0 : volume) * 100}%)`,
              }}
            />

            <button
              type="button"
              onClick={() => toast.info('Queue view coming soon.')}
              className="btn-icon"
              aria-label="Open queue"
            >
              <Icon name="queue" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ---------- Mobile compact ----------
  const mobile = (
    <div className="fixed inset-x-0 bottom-[57px] z-30 px-2 lg:hidden">
      <button
        type="button"
        onClick={openFullPlayer}
        className="glass-strong flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left shadow-xl shadow-black/40"
        aria-label="Open full player"
      >
        <SongCover song={currentSong} size="sm" rounded="rounded-lg" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{currentSong.title}</p>
          <p className="truncate text-xs text-muted">{artistLabel}</p>
        </div>

        <Visualizer isPlaying={isPlaying} bars={4} />

        <span
          onClick={(event) => {
            event.stopPropagation()
            toggle()
          }}
          role="button"
          tabIndex={-1}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-base-900"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} className="h-4 w-4" filled strokeWidth={2.2} />
        </span>
      </button>
    </div>
  )

  return (
    <>
      {desktop}
      {mobile}
    </>
  )
}
