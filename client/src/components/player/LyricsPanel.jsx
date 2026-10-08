import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import { lyricsService } from '../../services/lyrics'
import Sheet from '../ui/Sheet'
import Icon from '../ui/Icon'
import { cx } from '../../utils/format'

/**
 * Lyrics panel.
 *
 * Behaviour contract, so nobody is tempted to fake content:
 *   - the server currently has no lyrics provider, so `available` is false
 *   - when unavailable the panel states that plainly and stops there
 *   - nothing is inferred from the title, and no lyric site is scraped
 *
 * If a provider is added later, `available: true` with time-stamped lines turns
 * the same panel into synced lyrics with no changes here beyond styling.
 */
export default function LyricsPanel({ open, onClose }) {
  const { currentSong, currentTime, isPlaying } = usePlayer()
  const [lyrics, setLyrics] = useState({ available: false, lines: [], synced: false })
  const [loading, setLoading] = useState(false)
  const activeRef = useRef(null)

  const songId = currentSong?._id

  useEffect(() => {
    if (!open || !songId) return undefined

    let cancelled = false
    setLoading(true)

    lyricsService
      .forSong(songId)
      .then((result) => {
        if (!cancelled) setLyrics(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, songId])

  // Highlight the line matching the current playback position. Only meaningful
  // when the server actually supplied timings.
  const activeIndex = useMemo(() => {
    if (!lyrics.synced || !isPlaying) return -1
    let found = -1
    lyrics.lines.forEach((line, i) => {
      if (line.time !== null && line.time <= currentTime) found = i
    })
    return found
  }, [lyrics, currentTime, isPlaying])

  useEffect(() => {
    if (activeIndex < 0 || !activeRef.current) return
    activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lyrics"
      description={currentSong?.title}
    >
      {loading ? (
        <div className="space-y-3 py-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-4 w-full rounded" />
          ))}
        </div>
      ) : lyrics.available ? (
        <ol className="space-y-3 py-2">
          {lyrics.lines.map((line, i) => (
            <li key={`${line.time}-${i}`} ref={i === activeIndex ? activeRef : null}>
              <p
                className={cx(
                  'text-base leading-relaxed transition-all duration-300',
                  i === activeIndex
                    ? 'font-bold text-white'
                    : 'font-medium text-white/45',
                )}
              >
                {line.text}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/5 text-white/40">
            <Icon name="mic" className="h-6 w-6" />
          </span>
          <p className="max-w-[22rem] text-sm text-white/70">
            Lyrics aren&rsquo;t available for this track yet.
          </p>
          <p className="max-w-[24rem] text-xs text-muted">
            MUSICA doesn&rsquo;t guess lyrics or copy them from other sites. When a
            properly licensed lyrics source is connected, they&rsquo;ll appear here.
          </p>
        </div>
      )}
    </Sheet>
  )
}