import { useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { useSocial } from '../../hooks/useSocial'
import { formatTime, cx } from '../../utils/format'
import Icon, { HeartIcon } from '../ui/Icon'
import ProgressBar from './ProgressBar'
import SongCover from '../music/SongCover'
import PlayPauseButton from './PlayPauseButton'

/**
 * The persistent player.
 *
 *  - Desktop: a wide bar pinned to the bottom with full transport.
 *  - Mobile: a compact dock above the bottom navigation.
 *
 * Two invariants this component must not break:
 *
 *   1. ONE audio element. Playback is owned entirely by PlayerContext and the
 *      shared HTMLAudioElement. Nothing here constructs or renders an <audio>.
 *   2. The official YouTube player stays visible. For a YouTube track the dock
 *      re-opens the persistent YouTube stage (see YouTubeStage) instead of this
 *      bar pretending to be a player.
 */
export default function MusicPlayer() {
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
    isYouTube,
    canControlVolume,
    openYouTubeStage,
    openQueue,
  } = usePlayer()

  const { toggleLike, busyIds } = useSocial()

  const hasSong = Boolean(currentSong)
  const artistLabel = currentSong?.artistName || currentSong?.artist?.displayName || 'Unknown artist'

  // The player tracks the liked song by id, so hand the heart a song object
  // whose isLiked mirrors that state. toggleLike writes the result straight back
  // into PlayerContext, so every heart stays in sync.
  const likeTarget = currentSong
    ? { ...currentSong, isLiked, likeCount: currentSong.likeCount ?? 0 }
    : null
  const likePending = Boolean(currentSong?._id && busyIds.has(currentSong._id))

  const handleLike = () => {
    if (!likeTarget) return
    toggleLike(likeTarget)
  }

  if (!hasSong) {
    // Idle placeholder so the layout never jumps when the first song starts.
    return (
      <div className="glass-dock fixed inset-x-0 bottom-0 z-30 hidden border-t lg:block">
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
      <div className="glass-dock fixed inset-x-0 bottom-0 z-30 border-t lg:left-[260px]">
        <div className="grid h-[88px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4">
          {/* Left: artwork + identity */}
          <div className="flex min-w-0 items-center gap-3">
            <SongCover song={currentSong} size="sm" rounded="rounded-lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{currentSong.title}</p>
              <p className="truncate text-xs text-muted">
                {isYouTube ? `YouTube · ${artistLabel}` : artistLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLike}
              className="touch-target"
              aria-label={isLiked ? 'Unlike this song' : 'Like this song'}
              aria-pressed={isLiked}
              disabled={likePending}
            >
              <HeartIcon liked={isLiked} className={cx('h-[18px] w-[18px]', isLiked && 'text-accent-pink')} />
            </button>

            {/* For YouTube the button re-opens the visible player stage, since
                the official player cannot live inside this 88px bar. */}
            {isYouTube ? (
              <button
                type="button"
                onClick={openYouTubeStage}
                className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold tracking-wide text-soft uppercase transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Show the YouTube player"
              >
                YouTube
              </button>
            ) : null}
          </div>

          {/* Center: transport */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-3">
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

              <PlayPauseButton isPlaying={isPlaying} onClick={toggle} size="md" />

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
          <div className="flex items-center justify-end gap-1">
            {/* YouTube's official player does not permit programmatic volume
                control, so we show a link to it rather than ship a dead slider. */}
            {canControlVolume ? (
              <>
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
                  className="slider-track w-24"
                  style={{
                    background: `linear-gradient(to right, #a78bfa ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`,
                  }}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={openYouTubeStage}
                className="btn-icon"
                aria-label="Volume is controlled by the YouTube player"
                title="Volume is controlled inside the YouTube player"
              >
                <Icon name="volume" className="h-[18px] w-[18px]" />
              </button>
            )}

            <button type="button" onClick={openQueue} className="btn-icon" aria-label="Open queue">
              <Icon name="queue" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ---------- Mobile dock (persistent mini-player) ----------
  // Laid out as real sibling buttons rather than one big button wrapping nested
  // controls: nested interactive elements are invalid HTML, and it previously
  // made previous/next unreachable on touch.
  const mobile = (
    <div className="fixed inset-x-0 bottom-[60px] z-30 px-2 lg:hidden">
      <div className="glass-dock relative flex w-full items-center gap-1 overflow-hidden rounded-2xl px-1.5 py-1.5 shadow-xl shadow-black/50">
        {/* Hairline progress across the top of the dock. This is how a native
            app signals playback position without spending vertical space. */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-white/10">
          <ProgressBar
            value={currentTime}
            max={duration}
            onChange={seek}
            variant="hairline"
            label="Seek"
          />
        </div>

        {/* Artwork + identity open the full player. */}
        <button
          type="button"
          onClick={isYouTube ? openYouTubeStage : openFullPlayer}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label={isYouTube ? 'Show the YouTube player' : `Open full player: ${currentSong.title}`}
        >
          <SongCover song={currentSong} size="sm" rounded="rounded-lg" />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {currentSong.title}
            </span>
            <span className="block truncate text-xs text-muted">
              {isYouTube ? `YouTube · ${artistLabel}` : artistLabel}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={prev}
          className="touch-target"
          aria-label="Previous track"
        >
          <Icon name="prev" className="h-5 w-5" filled />
        </button>

        <PlayPauseButton
          isPlaying={isPlaying}
          onClick={toggle}
          size="sm"
          className="!bg-white !text-base-900"
        />

        <button
          type="button"
          onClick={next}
          className="touch-target"
          aria-label="Next track"
        >
          <Icon name="next" className="h-5 w-5" filled />
        </button>
      </div>
    </div>
  )

  return (
    <>
      {desktop}
      {mobile}
    </>
  )
}