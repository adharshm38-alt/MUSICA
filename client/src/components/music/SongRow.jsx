import { usePlayer } from '../../context/PlayerContext'
import { formatTime, cx, truncate } from '../../utils/format'
import Icon, { HeartIcon } from '../ui/Icon'
import SongCover from './SongCover'
import Visualizer from './Visualizer'

/** Horizontal "currently playing" indicator inside a row. */
export function PlayingIndicator({ isPlaying, isActive }) {
  if (!isActive) return null
  return <Visualizer isPlaying={isPlaying} bars={3} className="ml-auto" />
}

/**
 * One row in a song list (playlist, album, search results, queue).
 * Supports play, like, and an options menu.
 */
export default function SongRow({
  song,
  index,
  queue,
  onLike,
  onMenu,
  showArt = true,
  showAlbum = false,
  showIndex = true,
}) {
  const player = usePlayer()
  const isActive = player.currentSong?._id === song._id
  const isPlayingHere = isActive && player.isPlaying

  const handlePlay = () => {
    // If already active, toggle; otherwise start this track within the queue.
    if (isActive) player.toggle()
    else playSongFromQueue(song, queue)
  }

  // Small helper to avoid re-render churn in the reducer import.
  const playSongFromQueue = (item, list) => {
    const songs = list?.length ? list : [item]
    const idx = Math.max(0, songs.findIndex((s) => s._id === item._id))
    player.playQueue(songs, idx)
  }

  return (
    <div
      className={cx(
        'group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
        isActive ? 'bg-brand-500/10' : 'hover:bg-white/5',
      )}
    >
      {/* Index / play button / cover */}
      <div className="relative shrink-0">
        {showArt ? (
          <>
            <SongCover song={song} size="sm" rounded="rounded-lg" className={showIndex ? 'hidden sm:grid' : ''} />
            <button
              type="button"
              onClick={handlePlay}
              className={cx(
                'absolute inset-0 grid place-items-center rounded-lg bg-black/50 text-white transition-opacity',
                showIndex ? 'hidden sm:grid' : 'grid',
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
              aria-label={isPlayingHere ? `Pause ${song.title}` : `Play ${song.title}`}
            >
              <Icon name={isPlayingHere ? 'pause' : 'play'} className="h-5 w-5" filled strokeWidth={2.2} />
            </button>
          </>
        ) : null}

        {/* Index number (mobile, replaces art) */}
        {showIndex ? (
          <button
            type="button"
            onClick={handlePlay}
            className={cx(
              'grid h-11 w-11 place-items-center rounded-lg text-sm transition-all sm:hidden',
              isActive ? 'text-brand-300' : 'text-muted',
            )}
            aria-label={isPlayingHere ? `Pause ${song.title}` : `Play ${song.title}`}
          >
            {isPlayingHere ? (
              <Visualizer isPlaying bars={4} />
            ) : (
              <span className={isActive ? 'text-brand-300' : ''}>{index + 1}</span>
            )}
          </button>
        ) : null}
      </div>

      {/* Title + artist */}
      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'truncate text-sm font-semibold',
            isActive ? 'text-brand-300' : 'text-white',
          )}
          {...truncate(song.title, 1)}
        >
          {song.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {showIndex ? <span className="hidden sm:inline">{index + 1}.</span> : null}
          <span className="truncate">{song.artistName || song.artist?.displayName || 'Unknown artist'}</span>
        </div>
      </div>

      {showAlbum ? (
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted md:block">
          {song.album || '—'}
        </span>
      ) : null}

      {/* Duration */}
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {formatTime(song.duration)}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {onLike ? (
          <button
            type="button"
            onClick={() => onLike(song, song.isLiked)}
            className="btn-icon h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={song.isLiked ? `Unlike ${song.title}` : `Like ${song.title}`}
            aria-pressed={Boolean(song.isLiked)}
          >
            <HeartIcon liked={song.isLiked} className={cx('h-4 w-4', song.isLiked && 'text-accent-pink')} />
          </button>
        ) : null}

        {onMenu ? (
          <button
            type="button"
            onClick={() => onMenu(song)}
            className="btn-icon h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`More options for ${song.title}`}
          >
            <Icon name="more" className="h-4 w-4" strokeWidth="2.6" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
