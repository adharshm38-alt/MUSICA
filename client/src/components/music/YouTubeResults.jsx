import { useCallback, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePlayer } from '../../context/PlayerContext'
import { useToast } from '../../context/ToastContext'
import { youtubeService, youtubeToSong } from '../../services/youtube'
import { toFriendlyError } from '../../services/api'
import { compactNumber, truncate } from '../../utils/format'
import EmptyState from '../ui/EmptyState'
import Icon from '../ui/Icon'
import { RowSkeleton } from '../ui/Skeleton'

/** m:ss / h:mm:ss */
function formatDuration(seconds = 0) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * YouTube search results.
 *
 * Selecting a result queues it through the normal player path, which routes it
 * to the official embedded player. Nothing here downloads or proxies media -
 * the row only holds public metadata returned by our own backend.
 */
export default function YouTubeResults({ query }) {
  const toast = useToast()
  const player = usePlayer()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [savedIds, setSavedIds] = useState(() => new Set())

  const term = (query || '').trim()

  useEffect(() => {
    if (!term) {
      setResults(null)
      setError('')
      setLoading(false)
      return undefined
    }

    // The server restricts YouTube search to signed-in users so the shared daily
    // quota cannot be drained by anonymous traffic. Ask for a sign-in instead of
    // firing a request that would come back 401.
    if (!isAuthenticated) {
      setResults(null)
      setError('')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const timer = setTimeout(() => {
      youtubeService
        .search({ q: term, maxResults: 20 })
        .then((data) => {
          if (cancelled) return
          setResults(data?.items ?? [])
        })
        .catch((err) => {
          if (cancelled) return
          setResults([])
          setError(toFriendlyError(err))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 340)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, isAuthenticated])

  // Play the chosen result in the official player via the standard queue path.
  const handlePlay = useCallback(
    (video) => {
      const song = youtubeToSong(video)
      player.playSong(song, [song])
    },
    [player],
  )

  const handleSave = useCallback(
    async (video) => {
      if (!isAuthenticated) {
        toast.info('Sign in to save this to your library.')
        navigate('/login')
        return
      }
      setSavingId(video.videoId)
      try {
        await youtubeService.saveSong(video.videoId)
        setSavedIds((prev) => new Set(prev).add(video.videoId))
        toast.success('Saved to your library.')
      } catch (err) {
        toast.error(toFriendlyError(err))
      } finally {
        setSavingId('')
      }
    },
    [isAuthenticated, navigate, toast],
  )

  if (!term) {
    return (
      <EmptyState
        icon="search"
        title="Search YouTube"
        message="Find music videos on YouTube and play them here in the official player."
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon="lock"
        title="Sign in to search YouTube"
        message="YouTube search runs on the server and uses a shared daily quota, so it is available to signed-in listeners only."
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
      <EmptyState icon="warning" title="YouTube search unavailable" message={error} />
    )
  }

  if (loading && !results) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }

  if (!results?.length) {
    return (
      <EmptyState
        icon="search"
        title={`No YouTube results for "${term}"`}
        message="Try a different artist or song title."
      />
    )
  }

  return (
    <div className="space-y-2">
      {results.map((video) => {
        const isCurrent = player.currentSong?.youtubeVideoId === video.videoId
        const isPlayingHere = isCurrent && player.isPlaying
        const busy = savingId === video.videoId
        const saved = savedIds.has(video.videoId)

        return (
          <article
            key={video.videoId}
            className="card-hover flex flex-col gap-4 p-3 sm:flex-row sm:items-center"
          >
            {/* Thumbnail. Clicking plays it; the overlay is the only play
                affordance, because the official player appears in the stage. */}
            <button
              type="button"
              onClick={() => handlePlay(video)}
              disabled={video.embeddable === false}
              className="group relative block aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-white/10 sm:w-[200px] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Play ${video.title} on YouTube`}
            >
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center bg-white/5">
                  <Icon name="music" className="h-6 w-6 text-muted" />
                </span>
              )}

              <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-base-900">
                  <Icon
                    name={isPlayingHere ? 'pause' : 'play'}
                    className="h-5 w-5"
                    filled
                    strokeWidth={2.2}
                  />
                </span>
              </span>

              {video.durationSeconds ? (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {formatDuration(video.durationSeconds)}
                </span>
              ) : null}

              {/* The player is the only way to hear it, so be explicit that a
                  video we cannot embed will not play here. */}
              {video.embeddable === false ? (
                <span className="absolute inset-x-0 bottom-0 bg-black/85 px-2 py-1 text-center text-[10px] font-semibold text-white">
                  Embedding disabled
                </span>
              ) : null}
            </button>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-white" {...truncate(video.title, 2)}>
                {video.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted">{video.channelTitle}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {compactNumber(video.viewCount)} views
                {video.publishedAt
                  ? ` · ${new Date(video.publishedAt).getFullYear()}`
                  : ''}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePlay(video)}
                  disabled={video.embeddable === false}
                  className="btn-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="play" className="h-3.5 w-3.5" filled />
                  Play
                </button>

                <button
                  type="button"
                  onClick={() => handleSave(video)}
                  disabled={busy || saved}
                  className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  <Icon name={saved ? 'check' : 'plus'} className="h-3.5 w-3.5" />
                  {saved ? 'Saved' : busy ? 'Saving…' : 'Save to library'}
                </button>

                <a
                  href={video.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  <Icon name="external" className="h-3.5 w-3.5" />
                  YouTube
                </a>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}