import { useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { useSocial } from '../../hooks/useSocial'
import { formatTime, cx, truncate } from '../../utils/format'
import Icon, { HeartIcon } from '../ui/Icon'
import ProgressBar from './ProgressBar'
import SongCover from '../music/SongCover'
import ArtworkBackdrop from './ArtworkBackdrop'
import PlayPauseButton from './PlayPauseButton'
import LyricsPanel from './LyricsPanel'
import OutputSelector from './OutputSelector'
import Sheet from '../ui/Sheet'

/**
 * Full-screen player.
 *
 * Layout follows the premium music-app convention: artwork-driven background,
 * one large artwork, identity, a single primary transport cluster, then a quiet
 * utility row. Density is deliberately low - every control here has a 44px
 * minimum target because it is used one-handed.
 *
 * Playback architecture is unchanged. This is a view over PlayerContext:
 * one shared HTMLAudioElement for local music, the official IFrame API for
 * YouTube. No audio element is created here.
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
    volume,
    isMuted,
    setVolume,
    toggleMute,
    canControlVolume,
    isYouTube,
    fullPlayerOpen,
  } = usePlayer()

  const { toggleLike, busyIds } = useSocial()

  const [showLyrics, setShowLyrics] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showMore, setShowMore] = useState(false)

  // Nothing to show without a track.
  if (!currentSong) return null

  // This screen is a mode, not a permanent surface. It must only exist while
  // the listener has asked for it; otherwise it would cover the entire screen
  // the moment a song started, hiding the page, the search results and the mini
  // player underneath it.
  if (!fullPlayerOpen) return null

  // A YouTube track is never shown here. The official embedded player must stay
  // visible, and it already lives in the persistent YouTube dock above the
  // mini-player - which, unlike this screen, never covers the page. Rendering a
  // competing full-screen view would let the two fight over the screen.
  if (isYouTube) return null

  const artistLabel = currentSong.artistName || currentSong.artist?.displayName || 'Unknown artist'
  const likePending = Boolean(currentSong._id && busyIds.has(currentSong._id))
  const handleLike = () =>
    toggleLike({ ...currentSong, isLiked, likeCount: currentSong.likeCount ?? 0 })

  return (
    <div
      className="player-sheet animate-sheet-up lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
    >
      <ArtworkBackdrop song={currentSong} />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={closeFullPlayer} className="touch-target" aria-label="Close player">
          <Icon name="chevronDown" className="h-6 w-6" strokeWidth={2} />
        </button>

        <div className="min-w-0 px-2 text-center">
          <p className="text-[10px] font-bold tracking-[0.2em] text-white/55 uppercase">
            Now playing
          </p>
          <p className="truncate text-[11px] text-white/40">from your library</p>
        </div>

        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="touch-target"
          aria-label="More options"
        >
          <Icon name="more" className="h-5 w-5" />
        </button>
      </header>

      {/* Artwork. flex-1 with min-h-0 lets it take the leftover space and shrink
          on short screens instead of pushing the controls off-screen. */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-7 py-3">
        <div
          key={currentSong._id}
          className="aspect-square w-full max-w-[min(78vw,340px)] animate-art-swap"
        >
          <div className="h-full w-full overflow-hidden rounded-[1.75rem] shadow-2xl shadow-black/70 ring-1 ring-white/15">
            <SongCover song={currentSong} size="full" rounded="rounded-[1.75rem]" />
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="relative z-10 px-6 pt-3">
        <h2 className="truncate text-[1.6rem] leading-tight font-bold text-white" {...truncate(currentSong.title, 1)}>
          {currentSong.title}
        </h2>
        <p className="mt-1 truncate text-sm text-white/60">{artistLabel}</p>

        {/* Primary actions: favourite and overflow, placed right under identity
            where a thumb naturally lands. */}
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={handleLike}
            disabled={likePending}
            className="touch-target"
            aria-label={isLiked ? `Remove ${currentSong.title} from liked songs` : `Like ${currentSong.title}`}
            aria-pressed={isLiked}
          >
            <HeartIcon liked={isLiked} className={cx('h-6 w-6 transition-transform active:scale-90', isLiked && 'text-accent-pink')} />
          </button>

          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="touch-target"
            aria-label="More options"
          >
            <Icon name="more" className="h-6 w-6" />
          </button>
        </div>

        {/* Lyrics entry */}
        <button
          type="button"
          onClick={() => setShowLyrics(true)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg py-1.5 pr-3 pl-1 text-sm font-semibold text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          Lyrics
          <Icon name="chevronRight" className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>

      {/* Progress */}
      <div className="relative z-10 px-6 pt-4">
        <ProgressBar value={currentTime} max={duration} onChange={seek} label="Seek" />
        <div className="mt-2 flex justify-between text-xs font-medium tabular-nums text-white/55">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="relative z-10 flex items-center justify-center gap-5 px-6 pt-4">
        <button
          type="button"
          onClick={toggleShuffle}
          className={cx('touch-target', shuffle && 'text-brand-300')}
          aria-label="Toggle shuffle"
          aria-pressed={shuffle}
        >
          <Icon name="shuffle" className="h-5 w-5" />
        </button>

        <button type="button" onClick={prev} className="touch-target-lg" aria-label="Previous track">
          <Icon name="prev" className="h-7 w-7" filled />
        </button>

        <PlayPauseButton isPlaying={isPlaying} onClick={toggle} size="xl" />

        <button type="button" onClick={next} className="touch-target-lg" aria-label="Next track">
          <Icon name="next" className="h-7 w-7" filled />
        </button>

        <button
          type="button"
          onClick={cycleRepeat}
          className={cx('touch-target relative', repeat !== 'off' && 'text-brand-300')}
          aria-label={`Repeat: ${repeat}`}
        >
          <Icon name="repeat" className="h-5 w-5" />
          {repeat === 'one' ? (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-brand-500 px-1 text-[8px] font-bold text-white">
              1
            </span>
          ) : null}
        </button>
      </div>

      {/* Volume. Hidden for YouTube because the official player owns it, and
          shipping a dead slider would be worse than not shipping one. */}
      {canControlVolume ? (
        <div className="relative z-10 flex items-center gap-3 px-7 pt-5">
          <button
            type="button"
            onClick={toggleMute}
            className="touch-target"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <Icon name={isMuted || volume === 0 ? 'mute' : 'volume'} className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
            className="slider-track flex-1"
            style={{
              background: `linear-gradient(to right, #a78bfa ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>
      ) : null}

      {/* Bottom utility row */}
      <div className="relative z-10 mt-auto flex items-center justify-around px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setShowLyrics(true)}
          className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="Open lyrics"
        >
          <Icon name="mic" className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Lyrics</span>
        </button>

        <button
          type="button"
          onClick={() => setShowOutput(true)}
          className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="Choose audio output"
        >
          <Icon name="volume" className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Output</span>
        </button>

        <button
          type="button"
          onClick={openQueue}
          className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="Open queue"
        >
          <Icon name="queue" className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Queue</span>
        </button>
      </div>

      {/* Panels. The queue is NOT mounted here: it is driven by the player's own
          `isQueueOpen` flag and is mounted once for the whole app in AppShell,
          so the mini-player, the desktop bar and this screen all open the same
          panel and only one instance can exist. */}
      <LyricsPanel open={showLyrics} onClose={() => setShowLyrics(false)} />
      <OutputSelector open={showOutput} onClose={() => setShowOutput(false)} />
      <MoreSheet
        open={showMore}
        onClose={() => setShowMore(false)}
        song={currentSong}
        onOpenQueue={openQueue}
        onOpenLyrics={() => {
          setShowMore(false)
          setShowLyrics(true)
        }}
      />
    </div>
  )
}

/** Overflow menu: the actions that do not deserve permanent screen space. */
function MoreSheet({ open, onClose, song, onOpenQueue, onOpenLyrics }) {
  const title = song?.title
  const artistId = song?.artistId

  const items = [
    {
      key: 'lyrics',
      icon: 'mic',
      label: 'Lyrics',
      detail: 'View lyrics for this track',
      onSelect: onOpenLyrics,
    },
    {
      key: 'queue',
      icon: 'queue',
      label: 'Show queue',
      detail: 'See what plays next',
      onSelect: () => {
        onClose()
        onOpenQueue()
      },
    },
    {
      key: 'artist',
      icon: 'user',
      label: 'Go to artist',
      detail: 'Open this artist’s page',
      // Only offered when the track really carries an artist reference, so the
      // menu can never lead to an empty page.
      available: Boolean(artistId),
      onSelect: () => {
        window.location.href = `/artist/${artistId}`
      },
    },
  ]

  const visible = items.filter((item) => item.available !== false)

  return (
    <Sheet open={open} onClose={onClose} title="Options" description={title}>
      <ul className="space-y-1">
        {visible.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={item.onSelect}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 text-white/70">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{item.label}</span>
                <span className="block text-xs text-muted">{item.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}