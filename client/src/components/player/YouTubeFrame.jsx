import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { createYouTubeEngine } from '../../context/playback/engines'
import Icon from '../ui/Icon'
import { cx } from '../../utils/format'

/**
 * Human-readable messages for the official player's documented error codes.
 *
 * MUSICA never attempts to work around any of these. If YouTube declines to play
 * a video through the official player, the honest outcome is to say so and let
 * the listener pick something else.
 */
function describeError(code) {
  if (code === 150 || code === 101) return 'This track can’t be played here — the creator has disabled embedding.'
  if (code === 100) return 'This track can’t be played here — the video is no longer available.'
  if (code === 2) return 'This track can’t be played here — the video is invalid.'
  if (code === 5) return 'This track can’t be played here — the video cannot be played in this context.'
  return 'This track can’t be played here — the YouTube player reported an error.'
}

/**
 * A VISIBLE YouTube embedded player.
 *
 * COMPLIANCE REQUIREMENTS (non-negotiable, and enforced by the markup below):
 *  - The player renders at a real size inside an aspect-ratio box that is never
 *    collapsed, scaled down, faded or moved off-screen. YouTube's Terms require
 *    the embedded player to stay visible and usable.
 *  - We never overlay our own transport controls on top of the player, and we
 *    never hide it behind a static thumbnail. Users keep YouTube's own controls.
 *  - We drive it only through its documented public methods, and we always show
 *    the channel name plus a link to the original video.
 *  - This component never reads, decodes, downloads or re-hosts media. The only
 *    data crossing the bridge is playback state.
 *
 * This component owns the YT engine lifecycle and registers it with
 * PlayerContext, which is what lets the existing play/pause/seek actions work
 * for YouTube tracks without changing their public signatures.
 */
export default function YouTubeFrame({ song, compact = false, className = '' }) {
  const hostRef = useRef(null)
  const engineRef = useRef(null)
  const { registerYouTubeEngine, setYouTubeState } = usePlayer()
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  const videoId = song?.youtubeVideoId

  // Mirror the official player's own state into the shared player state, so the
  // existing play/pause button and progress bar stay truthful.
  const handleState = useCallback(
    (state) => {
      setYouTubeState(state)
    },
    [setYouTubeState],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host || !videoId) return undefined

    let disposed = false
    setError('')
    setReady(false)

    const engine = createYouTubeEngine(host, {
      onReady: () => {
        if (!disposed) setReady(true)
      },
      onStateChange: handleState,
      onError: (code) => {
        if (!disposed) setError(describeError(code))
      },
    })

    engineRef.current = engine
    // Hand the engine to PlayerContext so play/pause/seek route correctly.
    registerYouTubeEngine(engine)

    engine.load(song).catch((loadError) => {
      if (!disposed) setError(loadError?.message || 'The YouTube player could not start.')
    })

    return () => {
      disposed = true
      engine.destroy()
      engineRef.current = null
      registerYouTubeEngine(null)
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!videoId) return null

  return (
    <div className={`space-y-3 ${className}`}>
      {/*
        The player surface.

        `aspect-video` gives a real, non-zero box at every breakpoint, so the
        iframe is always visible and comfortably above YouTube's 200x200
        minimum. There is deliberately no conditional class, opacity or
        transform on this container.
      */}
      <div
        ref={hostRef}
        role="region"
        aria-label={`YouTube player: ${song?.title || 'video'}`}
        className="aspect-video w-full overflow-hidden rounded-panel bg-black ring-1 ring-white/10"
      />

      {/* Attribution - required when presenting third-party content. In compact
          mode the dock header already shows title + channel, so only the link
          and the source label are repeated here. */}
      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03]',
          compact ? 'px-3 py-1.5' : 'px-4 py-3',
        )}
      >
        {compact ? null : (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{song?.title}</p>
            <p className="truncate text-xs text-muted">
              {song?.youtubeChannelTitle || song?.artistName || 'Unknown channel'}
            </p>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-soft uppercase">
            YouTube
          </span>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            <Icon name="external" className="h-3.5 w-3.5" />
            Watch on YouTube
          </a>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-accent-pink/30 bg-accent-pink/10 px-4 py-3 text-sm text-white"
        >
          <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      {!ready && !error ? (
        <p className="text-xs text-muted">Loading the YouTube player…</p>
      ) : null}
    </div>
  )
}