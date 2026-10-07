import { usePlayer } from '../../context/PlayerContext'
import Icon from '../ui/Icon'
import YouTubeFrame from './YouTubeFrame'

/**
 * The visible stage for YouTube playback.
 *
 * WHY THIS EXISTS
 * ---------------
 * YouTube's Terms require the embedded player to be visible and usable (at
 * least 200x200) whenever it is playing. That rules out the two places the
 * existing player normally lives:
 *
 *   - the desktop bottom bar is only 88px tall
 *   - the mobile strip is a single ~56px row
 *
 * So YouTube tracks get their own dedicated, generously sized surface. It opens
 * automatically when a YouTube track becomes current, and closing it does not
 * stop playback - the user can still control the video from YouTube's own
 * on-screen controls, and the bottom bar still shows play/pause.
 *
 * This deliberately mirrors the full player's behaviour rather than replacing
 * it: uploads never render here, so the existing player is untouched.
 */
export default function YouTubeStage() {
  const { currentSong, isYouTube, ytStageOpen, closeYouTubeStage, next, prev, toggle, isPlaying } =
    usePlayer()

  // Never render for a first-party upload, and never render an empty stage.
  if (!isYouTube || !ytStageOpen || !currentSong?.youtubeVideoId) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-base-950/95 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="YouTube player"
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/50 uppercase">
              Playing from YouTube
            </p>
            <p className="truncate text-sm text-white/80">Seeking and volume use YouTube's controls</p>
          </div>

          <button type="button" onClick={closeYouTubeStage} className="btn-icon" aria-label="Close YouTube player">
            <Icon name="chevronDown" className="h-6 w-6" strokeWidth={2} />
          </button>
        </header>

        {/*
          The official player. Deliberately large and unobstructed - this is the
          surface that satisfies YouTube's visible-player requirement.
        */}
        <YouTubeFrame song={currentSong} />

        {/* Queue navigation. We do NOT draw our own seek bar or volume slider
            over the player; YouTube's own controls remain the primary UI. */}
        <div className="flex items-center justify-center gap-6">
          <button type="button" onClick={prev} className="btn-icon" aria-label="Previous track">
            <Icon name="prev" className="h-6 w-6" filled />
          </button>

          <button
            type="button"
            onClick={toggle}
            className="grid h-14 w-14 place-items-center rounded-full bg-white text-base-900 transition-transform duration-200 hover:scale-105 active:scale-95"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} className="h-6 w-6" filled strokeWidth={2.2} />
          </button>

          <button type="button" onClick={next} className="btn-icon" aria-label="Next track">
            <Icon name="next" className="h-6 w-6" filled />
          </button>
        </div>

        <p className="text-center text-xs text-muted">
          Video and audio stream directly from YouTube. MUSICA hosts no copy of this content.
        </p>
      </div>
    </div>
  )
}