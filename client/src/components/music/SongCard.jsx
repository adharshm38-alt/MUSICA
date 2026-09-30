import { Link } from 'react-router-dom'
import SongCover from './SongCover'
import Icon from '../ui/Icon'

const SIZES = {
  sm: 'h-14 w-14',
  md: 'h-[172px] w-[172px]',
  lg: 'h-[200px] w-[200px]',
}

/**
 * Reusable song/playlist card used across Home, Discover, Search, Library.
 * Clicking the card body plays the song (when `onPlay` provided) or navigates.
 */
export default function SongCard({
  song = {},
  contextQueue = null,
  onPlay,
  onLike,
  liked = false,
  size = 'md',
  variant = 'song', // 'song' | 'playlist' | 'artist'
  to,
}) {
  const sizeClass = SIZES[size] ?? SIZES.md
  const href = to || (variant === 'song' ? `/song/${song._id}` : `/playlist/${song._id}`)

  const handleCardClick = () => {
    if (variant === 'song' && onPlay) onPlay(song, contextQueue ?? [song])
  }

  return (
    <div className="card-hover group relative w-[172px] shrink-0 overflow-hidden rounded-card p-3 sm:w-[200px]">
      {/* Artwork */}
      <button
        type="button"
        onClick={handleCardClick}
        className="relative block w-full"
        aria-label={`Play ${song.title || 'song'}`}
      >
        {variant === 'artist' ? (
          <span className={`${sizeClass} block overflow-hidden rounded-full`}>
            <SongCover song={{ ...song, title: song.name || song.title }} size="full" rounded="rounded-full" />
          </span>
        ) : (
          <SongCover song={song} size="full" rounded="rounded-xl" className={sizeClass} />
        )}

        {/* Play button overlay */}
        {variant !== 'artist' ? (
          <span
            className="absolute bottom-2 right-2 grid h-11 w-11 translate-y-2 place-items-center rounded-full
                       bg-gradient-brand text-white opacity-0 shadow-xl shadow-black/50
                       transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100
                       focus-visible:translate-y-0 focus-visible:opacity-100"
          >
            <Icon name="play" className="h-5 w-5" filled strokeWidth={2.2} />
          </span>
        ) : null}
      </button>

      {/* Meta */}
      <div className="mt-3">
        <Link
          to={href}
          className="block truncate text-sm font-semibold text-white hover:underline"
          title={song.title || song.name}
        >
          {song.title || song.name || 'Untitled'}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted">
          {variant === 'artist'
            ? `${song.followerCount ?? 0} followers`
            : variant === 'playlist'
              // Playlists have no artist; show how many songs they hold.
              ? `${song.songCount ?? 0} song${(song.songCount ?? 0) === 1 ? '' : 's'}`
              : song.artistName || song.artist?.displayName || song.creator?.displayName || 'Unknown artist'}
        </p>
      </div>

      {/* Actions */}
      <div className="absolute right-3 top-3 flex gap-1">
        {onLike ? (
          <button
            type="button"
            onClick={() => onLike(song, liked)}
            className="btn-icon h-8 w-8 bg-black/40 backdrop-blur-sm"
            aria-label={liked ? `Unlike ${song.title}` : `Like ${song.title}`}
            aria-pressed={liked}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 ${liked ? 'text-accent-pink' : 'text-white'}`}
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20s-7.5-4.6-7.5-9.5A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.9c0 4.9-7.5 9.5-7.5 9.5z" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}
