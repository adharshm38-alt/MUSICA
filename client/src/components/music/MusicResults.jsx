import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalogueService, formatDuration, isRemoteTrack } from '../../services/catalogue'
import { usePlayer } from '../../context/PlayerContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { compactNumber, cx, truncate } from '../../utils/format'
import TrackCard, { ArtistCard, CollectionCard } from './CatalogueCards'
import EmptyState from '../ui/EmptyState'
import SectionHeader from '../ui/SectionHeader'
import Icon from '../ui/Icon'
import { RowSkeleton } from '../ui/Skeleton'

/**
 * How long the input must be still before we spend quota.
 *
 * Each catalogue search that reaches YouTube costs a search.list call. A
 * 600ms settle window means a visitor typing a full phrase triggers ONE search
 * when they stop, not one per prefix, because the timer resets on every
 * keystroke.
 */
const SEARCH_DEBOUNCE_MS = 600

/** Below this length a query is almost always a half-typed word. */
const MIN_QUERY_LENGTH = 2

/**
 * Unified music search across every available source.
 *
 * One query reaches both the local MUSICA library and YouTube, and the results
 * come back as normalized tracks, artists and collections. There is no separate
 * "YouTube" tab: the source is a property of a result, not of the experience.
 *
 * The API key stays server-side; this component only ever talks to our own
 * /api/catalogue/search route.
 */
export default function MusicResults({ query, onSearched }) {
  const player = usePlayer()
  const { isAuthenticated } = useAuth()
  const toast = useToast()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const term = (query || '').trim()
  // Guards against a slow request for an old term overwriting newer results.
  const requestRef = useRef(0)
  // Holds the latest callback without making it an effect dependency. Including
  // it would re-fire the search every time the parent re-rendered, and each of
  // those costs a search.list call.
  const onSearchedRef = useRef(onSearched)
  onSearchedRef.current = onSearched

  useEffect(() => {
    if (term.length < MIN_QUERY_LENGTH) {
      setData(null)
      setError('')
      setLoading(false)
      return undefined
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId

    setLoading(true)
    const timer = setTimeout(() => {
      // Aborting means a superseded request is torn down rather than left to
      // race against a newer one and repaint the list with stale results.
      const controller = new AbortController()

      catalogueService
        .search({ q: term, limit: 20 }, { signal: controller.signal })
        .then((payload) => {
          if (requestRef.current !== requestId) return
          setData(payload)
          setError('')

          // Hand a little context back so the parent can record a useful recent
          // search (artwork + artist) rather than a bare string. Only fires from
          // results we actually received, so it never invents anything.
          const notify = onSearchedRef.current
          if (notify && (payload?.tracks?.length || payload?.artists?.length)) {
            const first = payload.tracks?.[0] || payload.artists?.[0]
            notify({ artist: first?.artist, artwork: first?.artwork })
          }
        })
        .catch((err) => {
          if (requestRef.current !== requestId) return
          // An abort is our own doing, not a failure to report.
          if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return
          setData(null)
          setError(err?.response?.data?.message || 'Could not search music right now.')
        })
        .finally(() => {
          if (requestRef.current === requestId) setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    // Changing the term clears the pending timer AND invalidates the in-flight
    // request id, so neither a queued nor a running search for the old term can
    // affect the new one.
    return () => clearTimeout(timer)
    // onSearched is intentionally omitted: re-running a quota-sensitive search
    // because the parent passed a new callback would waste budget. The ref below
    // keeps the latest callback without adding it to the dependency list.
  }, [term])

  const playTrack = (track) => {
    if (track.playable === false) {
      toast.info('Playback is currently unavailable for this source.')
      return
    }
    player.playSong(track, [track])
  }

  if (!term) {
    return (
      <EmptyState
        icon="search"
        title="Search music"
        message="Search for a song, artist or collection across every source MUSICA can reach."
      />
    )
  }

  if (!isAuthenticated) {
    // The catalogue search costs upstream quota, so the server restricts it to
    // signed-in listeners. Say so rather than firing a request that 401s.
    return (
      <EmptyState
        icon="lock"
        title="Sign in to search music"
        message="Music search runs on the server and uses a shared daily quota, so it is available to signed-in listeners."
        action={
          <Link to="/login" className="btn-primary px-5 py-2.5">
            Sign in
          </Link>
        }
      />
    )
  }

  if (error) {
    return (
      <EmptyState icon="warning" title="Unable to connect to the music source." message={error} />
    )
  }

  if (loading && !data) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }

  const tracks = data?.tracks || []
  const artists = data?.artists || []
  const collections = data?.collections || []

  // Distinguish the three outcomes precisely. An exhausted upstream quota is an
  // outage, NOT an empty catalogue, and saying "No results" during one is
  // simply wrong.
  const status = data?.status
  const hasAnything = tracks.length || artists.length || collections.length

  if (!hasAnything) {
    if (status === 'quota_exceeded') {
      return (
        <EmptyState
          icon="warning"
          title="YouTube search quota is temporarily unavailable. Local music is still available."
          message="The external music search quota has been reached. Please try again later."
        />
      )
    }
    if (status === 'error' || status === 'unavailable') {
      return (
        <EmptyState
          icon="warning"
          title="Unable to connect to the music source."
          message="The external music source could not be reached. Please try again shortly."
        />
      )
    }
    return (
      <EmptyState
        icon="search"
        title="No music found for this search."
        message={`Nothing matched "${term}". Try a different spelling, or search for an artist name.`}
      />
    )
  }

  return (
    <div className="space-y-9">
      {data?.degraded && hasAnything ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-panel border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted"
        >
          <Icon name="info" className="h-4 w-4 shrink-0 text-brand-400" />
          {status === 'quota_exceeded'
            ? 'The external music search quota has been reached, so some results are missing. Your own music is unaffected.'
            : 'Some music sources did not respond, so these results may be incomplete.'}
        </p>
      ) : null}

      {/* ---------- Songs ---------- */}
      {tracks.length ? (
        <section className="animate-fade-up">
          <SectionHeader title="Songs" icon="music" />
          <div className="rail">
            {tracks.map((track) => (
              <TrackCard key={track.id} track={track} onPlay={playTrack} />
            ))}
          </div>

          {/* Full-width rows make the Play control obvious; the rail above is
              for scanning artwork. */}
          <div className="mt-5 hidden space-y-0.5 sm:block">
            {tracks.slice(0, 8).map((track) => (
              <MusicResultRow key={track.id} track={track} onPlay={playTrack} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Artists ---------- */}
      {artists.length ? (
        <section className="animate-fade-up">
          <SectionHeader title="Artists" icon="users" />
          <div className="rail">
            {artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Collections ---------- */}
      {collections.length ? (
        <section className="animate-fade-up">
          <SectionHeader title="Collections" icon="playlist" />
          <div className="rail">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

/**
 * A single result row: artwork, title, artist/channel, duration and a play
 * button. Used under the artwork rail so each result has a clear, labelled
 * Play affordance rather than relying on hover.
 */
function MusicResultRow({ track, onPlay }) {
  const player = usePlayer()
  const toast = useToast()

  const isActive = player.currentSong?._id === track._id
  const isPlayingHere = isActive && player.isPlaying
  const remote = isRemoteTrack(track)

  const handlePlay = () => {
    if (track.playable === false) {
      toast.info('Playback is currently unavailable for this source.')
      return
    }
    if (isActive) player.toggle()
    else onPlay(track)
  }

  return (
    <div
      className={cx(
        'flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-white/5',
        isActive && 'bg-white/[0.06]',
      )}
    >
      <button
        type="button"
        onClick={handlePlay}
        disabled={track.playable === false}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-base-800 ring-1 ring-white/10 disabled:cursor-not-allowed"
        aria-label={`Play ${track.title} by ${track.artist}`}
      >
        {track.artwork ? (
          <img src={track.artwork} alt="" aria-hidden="true" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center">
            <Icon name="music" className="h-4 w-4 text-muted" />
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <Icon name={isPlayingHere ? 'pause' : 'play'} className="h-4 w-4 text-white" filled />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cx('truncate text-sm font-semibold', isActive ? 'text-brand-300' : 'text-white')}
          {...truncate(track.title, 2)}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-muted">
          {track.artist}
          {track.album ? ` · ${track.album}` : ''}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <span
          className={cx(
            'rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase',
            remote ? 'bg-white/10 text-soft' : 'bg-brand-600/30 text-brand-200',
          )}
        >
          {remote ? 'YouTube' : 'MUSICA'}
        </span>
        {Number.isFinite(track.viewCount) && track.viewCount > 0 ? (
          <span className="w-16 text-right text-[11px] tabular-nums text-muted">
            {compactNumber(track.viewCount)}
          </span>
        ) : null}
        <span className="w-10 text-right text-[11px] tabular-nums text-muted">
          {formatDuration(track.duration) || '--:--'}
        </span>
      </div>
    </div>
  )
}