import { useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import Icon from '../ui/Icon'
import YouTubeFrame from './YouTubeFrame'

/**
 * The persistent YouTube dock.
 *
 * WHY THIS IS A DOCK AND NOT A MODAL
 * -----------------------------------
 * YouTube's Terms require the embedded player to stay visible and at least
 * 200x200 while it plays. That rules out hiding it inside the 88px player bar,
 * but it does NOT require covering the whole application. An earlier version
 * opened as a full-screen overlay, which meant that starting a YouTube track
 * from Search buried the search results and the user had to dismiss the player
 * to keep browsing.
 *
 * Instead the official player is docked above the persistent mini-player. The
 * page keeps its own scroll and stays fully usable, so searching for another
 * song, or tapping another result, happens in place: the page updates, the
 * player stays mounted, and only the video id changes.
 *
 * COMPLIANCE
 * - The player is always visible while a YouTube track is loaded and never
 *   collapsed, scaled, faded or covered by our own controls.
 * - It is YouTube's official player (youtube-nocookie.com + the IFrame Player
 *   API). No audio is extracted, downloaded, cached or separated, and no
 *   hidden audio-only player is created.
 * - Channel credit and a link to the original video are always shown.
 *
 * This component renders nothing at all for first-party uploads.
 */
export default function YouTubeStage() {
  const { currentSong, isYouTube, toggle, isPlaying, next, prev } = usePlayer()
  const [expanded, setExpanded] = useState(false)

  if (!isYouTube || !currentSong?.youtubeVideoId) return null

  return (
    <div
      data-youtube-dock
      // Sits directly ABOVE the persistent player bar so both stay visible: the
      // bar keeps transport and identity for every source, and the dock hosts
      // the official player above it.
      //
      // `pointer-events-none` on the wrapper, re-enabled on the panel: without
      // this the full-width fixed container swallowed every click aimed at the
      // page underneath, because it is as wide as the viewport even where it is
      // visually empty. The page must stay fully interactive.
      // Mobile: bottom nav (60px) + mini-player dock (~62px) = ~122px, so the dock
      // clears both without covering them. Desktop: the 88px bar.
      className="pointer-events-none fixed inset-x-0 bottom-[122px] z-30 lg:bottom-[88px] lg:left-[260px]"
      // Not a dialog: the page behind stays interactive and visible.
      role="region"
      aria-label="YouTube player"
    >
      <div className="pointer-events-none mx-auto w-full max-w-5xl px-3 pb-2 sm:px-4">
        <div className="pointer-events-auto overflow-hidden rounded-t-2xl border border-b-0 border-white/10 bg-base-900/95 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {/* Dock header: identity + transport, always visible. */}
          <div className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={toggle}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-base-900 transition-transform hover:scale-105 active:scale-95"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <Icon
                name={isPlaying ? 'pause' : 'play'}
                className="h-4 w-4"
                filled
                strokeWidth={2.2}
              />
            </button>

            <button
              type="button"
              onClick={prev}
              className="btn-icon shrink-0"
              aria-label="Previous track"
            >
              <Icon name="prev" className="h-4 w-4" filled />
            </button>

            <button
              type="button"
              onClick={next}
              className="btn-icon shrink-0"
              aria-label="Next track"
            >
              <Icon name="next" className="h-4 w-4" filled />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{currentSong.title}</p>
              <p className="truncate text-[11px] text-muted">
                {currentSong.youtubeChannelTitle || currentSong.artistName || 'Unknown channel'}
              </p>
            </div>

            {/* Expands the player to a larger, still-visible size. It is never
                collapsed to nothing: that would hide the official player. */}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="btn-icon shrink-0"
              aria-label={expanded ? 'Shrink the YouTube player' : 'Expand the YouTube player'}
              aria-expanded={expanded}
              title={expanded ? 'Shrink player' : 'Expand player'}
            >
              <Icon name={expanded ? 'chevronDown' : 'chevronUp'} className="h-4 w-4" />
            </button>
          </div>

          {/* The official player. The aspect-ratio box always has a real,
              non-zero size so the iframe stays visible and >=200x200. */}
          <div
            className={
              expanded
                ? 'mx-auto w-full max-w-4xl'
                : 'mx-auto w-full max-w-md'
            }
          >
            <YouTubeFrame song={currentSong} compact />
          </div>
        </div>
      </div>
    </div>
  )
}