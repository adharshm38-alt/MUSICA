import { usePlayer } from '../../context/PlayerContext'
import { useSocial } from '../../hooks/useSocial'
import { formatTime, cx, truncate } from '../../utils/format'
import Icon, { HeartIcon } from '../ui/Icon'
import Visualizer from '../music/Visualizer'
import ProgressBar from './ProgressBar'
import SongCover from '../music/SongCover'

/**
 * Full-screen mobile player with an animated blurred backdrop
 * derived from the current cover art.
 */
export default function FullPlayer() {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    isLiked,
    toggle,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleRepeat,
    closeFullPlayer,
    openQueue,
    isYouTube,
    openYouTubeStage,
  } = usePlayer()
  const { toggleLike, busyIds } = useSocial()

  if (!currentSong) return null

  // A YouTube track is never played through this screen: the official embedded
  // player has to be visible, and this view only has room for cover art. Send
  // the user to the dedicated YouTube stage instead.
  if (isYouTube) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col animate-fade-in lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Playing from YouTube"
      >
        <div className="absolute inset-0 -z-10 bg-base-950" />
        <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" onClick={closeFullPlayer} className="btn-icon" aria-label="Close player">
            <Icon name="chevronDown" className="h-6 w-6" strokeWidth={2} />
          </button>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-white/50 uppercase">
            Playing from YouTube
          </p>
          <button type="button" onClick={openQueue} className="btn-icon" aria-label="Open queue">
            <Icon name="queue" />
          </button>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SongCover song={currentSong} size="full" rounded="rounded-[2rem]" className="aspect-square w-full max-w-[300px]" />
          <div className="w-full min-w-0 text-center">
            <h2 className="truncate text-xl font-bold text-white" {...truncate(currentSong.title, 2)}>
              {currentSong.title}
            </h2>
            <p className="mt-1 truncate text-sm text-white/60">
              {currentSong.youtubeChannelTitle || currentSong.artistName}
            </p>
          </div>
          <button type="button" onClick={openYouTubeStage} className="btn-primary px-6 py-3">
            <Icon name="play" className="h-4 w-4" filled />
            Open the YouTube player
          </button>
        </div>
      </div>
    )
  }

  const artistLabel = currentSong.artistName || currentSong.artist?.displayName || 'Unknown artist'
  const cover = currentSong.coverUrl

  const likePending = Boolean(currentSong._id && busyIds.has(currentSong._id))
  const handleLike = () =>
    toggleLike({ ...currentSong, isLiked, likeCount: currentSong.likeCount ?? 0 })

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col animate-fade-in lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
    >
      {/* Animated blurred backdrop */}
      <div className="absolute inset-0 -z-10 bg-base-950">
        {cover ? (
          <>
            <img
              src={cover}
              alt=""
              aria-hidden="true"
              className="h-full w-full scale-125 object-cover opacity-45 blur-3xl"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-base-950/50 via-base-950/80 to-base-950" />
          </>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-600/50 via-accent-pink/30 to-accent-blue/40 blur-3xl" />
        )}
      </div>

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={closeFullPlayer} className="btn-icon" aria-label="Close player">
          <Icon name="chevronDown" className="h-6 w-6" strokeWidth={2} />
        </button>

        <div className="text-center">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-white/50 uppercase">
            Now playing
          </p>
        </div>

        <button type="button" onClick={openQueue} className="btn-icon" aria-label="Open queue">
          <Icon name="queue" />
        </button>
      </header>

      {/* Artwork */}
      <div className="flex flex-1 items-center justify-center px-8 py-4">
        <div className="relative aspect-square w-full max-w-[340px]">
          {/* Pulsing glow while playing */}
          {isPlaying ? (
            <span className="absolute inset-0 animate-pulse-ring rounded-[2rem] bg-brand-500/40 blur-2xl" />
          ) : null}

          <div className="relative h-full w-full overflow-hidden rounded-[2rem] shadow-2xl shadow-black/70 ring-1 ring-white/10">
            <SongCover song={currentSong} size="full" rounded="rounded-[2rem]" />

            {/* Slow spin while playing */}
            {isPlaying ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-[62%] w-[62%] rounded-full border border-white/10 bg-black/30 backdrop-blur-[2px]" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="px-7 pb-1">
        <h2 className="truncate text-2xl font-bold text-white" {...truncate(currentSong.title, 1)}>
          {currentSong.title}
        </h2>
        <p className="mt-1 truncate text-sm text-white/60">{artistLabel}</p>
      </div>

      {/* Progress */}
      <div className="px-7 pt-4">
        <ProgressBar value={currentTime} max={duration} onChange={seek} label="Seek" />
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/50">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-8 pt-4">
        <button
          type="button"
          onClick={toggleShuffle}
          className={cx('btn-icon', shuffle && 'text-brand-300')}
          aria-label="Toggle shuffle"
          aria-pressed={shuffle}
        >
          <Icon name="shuffle" />
        </button>

        <button type="button" onClick={prev} className="btn-icon" aria-label="Previous track">
          <Icon name="prev" className="h-7 w-7" filled />
        </button>

        <button
          type="button"
          onClick={toggle}
          className="grid h-[68px] w-[68px] place-items-center rounded-full bg-white text-base-900 shadow-xl shadow-black/40 transition-transform duration-200 hover:scale-105 active:scale-95"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} className="h-7 w-7" filled strokeWidth={2.2} />
        </button>

        <button type="button" onClick={next} className="btn-icon" aria-label="Next track">
          <Icon name="next" className="h-7 w-7" filled />
        </button>

        <button
          type="button"
          onClick={cycleRepeat}
          className={cx('btn-icon relative', repeat !== 'off' && 'text-brand-300')}
          aria-label={`Repeat: ${repeat}`}
        >
          <Icon name="repeat" />
          {repeat === 'one' ? (
            <span className="absolute -right-0.5 -top-0.5 rounded bg-brand-500 px-1 text-[8px] font-bold text-white">
              1
            </span>
          ) : null}
        </button>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between px-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        <button
          type="button"
          onClick={handleLike}
          className="btn-icon"
          aria-label={isLiked ? 'Unlike' : 'Like'}
          aria-pressed={isLiked}
          disabled={likePending}
        >
          <HeartIcon liked={isLiked} className={cx('h-6 w-6', isLiked && 'text-accent-pink')} />
        </button>

        <Visualizer isPlaying={isPlaying} bars={7} className="h-5" />

        <button type="button" className="btn-icon" aria-label="Add to playlist">
          <Icon name="plus" className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}
