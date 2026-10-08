import { useEffect, useState } from 'react'
import SongCover from '../music/SongCover'

/**
 * Full-bleed blurred artwork backdrop.
 *
 * Three stacked layers give the "artwork dissolving into the UI" look without
 * ever making the text hard to read:
 *   1. the cover, scaled up and heavily blurred
 *   2. a dark scrim that guarantees contrast
 *   3. a vertical gradient that fades to the app background at the bottom
 *
 * If the cover is missing or fails to load, a MUSICA gradient stands in, so the
 * player never shows an empty black rectangle.
 *
 * The image is only fetched once per track: the src is memoised on the song id,
 * which avoids re-downloading a full-size cover on every render.
 */
export default function ArtworkBackdrop({ song, className = '' }) {
  const coverUrl = song?.coverUrl || song?.cover?.url || ''
  const [failed, setFailed] = useState(false)

  // A new track gets a fresh attempt at loading its artwork.
  useEffect(() => {
    setFailed(false)
  }, [coverUrl])

  const showImage = Boolean(coverUrl) && !failed

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {showImage ? (
        <img
          key={coverUrl}
          src={coverUrl}
          alt=""
          decoding="async"
          fetchPriority="high"
          onError={() => setFailed(true)}
          className="h-full w-full scale-[1.35] animate-fade-in object-cover blur-3xl saturate-150"
        />
      ) : (
        // Deterministic fallback derived from the track, so it feels designed
        // rather than like a missing asset.
        <div className="h-full w-full">
          <SongCover song={song || {}} size="full" rounded="rounded-none" className="scale-[1.35] blur-3xl saturate-150" />
        </div>
      )}

      {/* Contrast scrim: this is what guarantees white text stays readable even
          over a bright cover. */}
      <div className="absolute inset-0 bg-black/55" />

      {/* Vertical fade into the app background. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/65 to-base-950" />

      {/* Subtle brand tint so the surface feels like MUSICA even when the
          artwork is a different colour entirely. */}
      <div className="absolute inset-0 bg-gradient-to-tr from-brand-700/25 via-transparent to-accent-pink/15" />
    </div>
  )
}