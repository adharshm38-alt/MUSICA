import { Link } from 'react-router-dom'
import { usePlayer } from '../../context/PlayerContext'
import { catalogueService, isRemoteTrack, formatDuration } from '../../services/catalogue'
import { useToast } from '../../context/ToastContext'
import { cx, truncate } from '../../utils/format'
import Icon from '../ui/Icon'

/**
 * Renders a normalized Track as a large-artwork card.
 *
 * Works for BOTH sources. A local track plays through MUSICA's own audio
 * element; a YouTube track plays inside YouTube's official embedded player,
 * which the PlayerContext opens as its stage. Neither path extracts or
 * downloads audio.
 *
 * @param {object} track normalized Track
 * @param {{onPlay?: Function, className?: string}} props
 */
export default function TrackCard({ track, onPlay, className = '' }) {
  const player = usePlayer()
  const toast = useToast()
  if (!track) return null

  const isActive = player.currentSong?._id === track._id
  const isPlaying = isActive && player.isPlaying
  const remote = isRemoteTrack(track)

  /**
   * Click-to-play. The track is handed to the existing player, which routes by
   * source; an unplayable track reports why instead of starting a broken
   * player.
   */
  const handlePlay = () => {
    if (track.playable === false) {
      toast.info(track.playbackReason || 'Playback is currently unavailable for this source.')
      return
    }
    if (isActive) player.toggle()
    else (onPlay ?? player.playSong)(track)
  }

  return (
    <article
      className={cx(
        'card-hover group relative flex w-[152px] shrink-0 flex-col sm:w-[172px]',
        className,
      )}
    >
      <button
        type="button"
        onClick={handlePlay}
        disabled={track.playable === false}
        className="group/art relative block aspect-square w-full overflow-hidden rounded-xl bg-base-800 ring-1 ring-white/10 disabled:cursor-not-allowed"
        aria-label={`Play ${track.title} by ${track.artist}`}
      >
        {track.artwork ? (
          <img
            src={track.artwork}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover/art:scale-105"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-600/40 to-accent-blue/30">
            <Icon name="music" className="h-7 w-7 text-white/40" />
          </span>
        )}

        {/* Play affordance. Appears on hover, and stays visible for touch. */}
        <span
          className={cx(
            'absolute inset-0 grid place-items-center bg-black/45 transition-opacity',
            'opacity-0 group-hover/art:opacity-100 focus-within:opacity-100 max-md:opacity-100',
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-base-900 shadow-lg">
            <Icon
              name={isPlaying ? 'pause' : 'play'}
              className="h-5 w-5"
              filled
              strokeWidth={2.2}
            />
          </span>
        </span>

        {/* Duration badge. Omitted entirely when the API gave no duration. */}
        {formatDuration(track.duration) ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
            {formatDuration(track.duration)}
          </span>
        ) : null}

        {/* Source badge keeps it obvious what is playing where. */}
        <span
          className={cx(
            'absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase',
            remote ? 'bg-black/75 text-white' : 'bg-brand-600 text-white',
          )}
        >
          {remote ? 'YouTube' : 'MUSICA'}
        </span>
      </button>

      <div className="mt-2.5 min-w-0 px-0.5">
        <p
          className="truncate text-[13px] font-semibold text-white"
          {...truncate(track.title, 2)}
        >
          {track.title}
        </p>
        <p className="truncate text-[11px] text-muted">{track.artist}</p>
        {/* Album is only shown when the source actually reported one. The
            YouTube Data API has no album entity, so it is usually blank. */}
        {track.album ? <p className="truncate text-[11px] text-muted/80">{track.album}</p> : null}
      </div>
    </article>
  )
}

/**
 * An Artist card. Artists come from real source metadata (for YouTube, the
 * channel that owns the work) - never invented.
 */
export function ArtistCard({ artist }) {
  const toast = useToast()
  if (!artist) return null

  return (
    <article className="card-hover flex w-[148px] shrink-0 flex-col items-center px-2 py-3 text-center sm:w-[168px]">
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-base-800 ring-1 ring-white/10">
        {artist.artwork ? (
          <img
            src={artist.artwork}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-600/50 to-accent-pink/30">
            <Icon name="users" className="h-7 w-7 text-white/40" />
          </span>
        )}
      </div>
      <p className="mt-2.5 w-full truncate text-[13px] font-semibold text-white">
        {artist.name}
      </p>
      <p className="w-full truncate text-[11px] text-muted">
        {artist.subscriberCount
          ? `${compact(artist.subscriberCount)} subscribers`
          : artist.trackCount
            ? `${artist.trackCount} track${artist.trackCount === 1 ? '' : 's'}`
            : 'Artist'}
      </p>
      {artist.watchUrl ? (
        <a
          href={artist.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 text-[10px] font-semibold text-muted transition-colors hover:text-white"
        >
          View channel
        </a>
      ) : null}
    </article>
  )
}

/**
 * A Collection card (a real playlist, local or YouTube).
 * A YouTube playlist is a real API object, never an invented album grouping.
 */
export function CollectionCard({ collection }) {
  if (!collection) return null

  const body = (
    <>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-base-800 ring-1 ring-white/10">
        {collection.artwork ? (
          <img
            src={collection.artwork}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-gradient-to-br from-accent-blue/40 to-brand-600/30">
            <Icon name="playlist" className="h-7 w-7 text-white/40" />
          </span>
        )}
      </div>
      <p className="mt-2.5 truncate text-[13px] font-semibold text-white" {...truncate(collection.name, 2)}>
        {collection.name}
      </p>
      {/* itemCount is null when the API does not report it; we show nothing
          rather than claiming "0 songs". */}
      <p className="truncate text-[11px] text-muted">
        {Number.isFinite(collection.itemCount)
          ? `${collection.itemCount} item${collection.itemCount === 1 ? '' : 's'}`
          : collection.curator || 'Collection'}
      </p>
    </>
  )

  // Community playlists live inside MUSICA; YouTube collections open officially.
  if (collection.sourceId === 'local') {
    return (
      <Link
        to={`/playlist/${collection._id}`}
        className="card-hover group flex w-[152px] shrink-0 flex-col sm:w-[172px]"
      >
        {body}
      </Link>
    )
  }

  return (
    <a
      href={collection.watchUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="card-hover group flex w-[152px] shrink-0 flex-col sm:w-[172px]"
    >
      {body}
    </a>
  )
}

/** Compact number formatting for subscriber/view counts. */
function compact(n) {
  const value = Number(n) || 0
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export { compact }