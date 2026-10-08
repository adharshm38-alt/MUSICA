import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { songsService } from '../services'
import { catalogueService } from '../services/catalogue'
import useFetch from '../hooks/useFetch'
import { usePlayer } from '../context/PlayerContext'
import SongCover from '../components/music/SongCover'
import SongCard from '../components/music/SongCard'
import SectionHeader from '../components/ui/SectionHeader'
import EmptyState from '../components/ui/EmptyState'
import { CardSkeletonRail } from '../components/ui/Skeleton'
import Icon from '../components/ui/Icon'

/**
 * Browse categories.
 *
 * Each category maps to a real search query and goes through the SAME unified
 * catalogue endpoint the Search page uses. There is deliberately no YouTube-only
 * path here: the results are one MUSICA catalogue regardless of where they came
 * from.
 *
 * Quota discipline: selecting a category issues one catalogue search. That
 * request goes through the client response cache (30 min) and the server cache
 * (30 min), so re-selecting a category - or arriving here again - costs nothing.
 */
/**
 * Browse categories.
 *
 * These are QUERIES, not a fixed track list: selecting one runs the same unified
 * catalogue search the Search page uses, so the catalogue is whatever YouTube's
 * API can actually return rather than something hard-coded here.
 *
 * Quota discipline: one selection = one catalogue search, served from the client
 * response cache (30 min) and the server cache (30 min). Re-selecting, or
 * returning to Explore, costs nothing.
 */
export const CATEGORIES = [
  { id: 'global', label: 'Global', query: 'top music hits' },
  { id: 'malayalam', label: 'Malayalam', query: 'malayalam songs' },
  { id: 'tamil', label: 'Tamil', query: 'tamil songs' },
  { id: 'telugu', label: 'Telugu', query: 'telugu songs' },
  { id: 'hindi', label: 'Hindi', query: 'hindi songs' },
  { id: 'kannada', label: 'Kannada', query: 'kannada songs' },
  { id: 'bengali', label: 'Bengali', query: 'bengali songs' },
  { id: 'punjabi', label: 'Punjabi', query: 'punjabi songs' },
  { id: 'marathi', label: 'Marathi', query: 'marathi songs' },
  { id: 'gujarati', label: 'Gujarati', query: 'gujarati songs' },
  { id: 'english', label: 'English', query: 'english pop music' },
  { id: 'korean', label: 'Korean', query: 'korean songs' },
  { id: 'japanese', label: 'Japanese', query: 'japanese songs' },
  { id: 'arabic', label: 'Arabic', query: 'arabic songs' },
  { id: 'spanish', label: 'Spanish', query: 'spanish songs' },
  { id: 'french', label: 'French', query: 'french songs' },
  { id: 'german', label: 'German', query: 'german songs' },
  { id: 'portuguese', label: 'Portuguese', query: 'portuguese songs' },
  { id: 'instrumental', label: 'Instrumental', query: 'instrumental music' },
  { id: 'covers', label: 'Covers', query: 'cover songs' },
  { id: 'remixes', label: 'Remixes', query: 'remix songs' },
  { id: 'live', label: 'Live Music', query: 'live music performance' },
]

export default function Explore() {
  const navigate = useNavigate()
  const { playQueue } = usePlayer()
  const { data, loading } = useFetch(() => songsService.discover(), [])

  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  // Remounting the list is how the "play from here" button starts the right
  // queue; a key change is cheaper and clearer than syncing an effect.
  const [queueNonce, setQueueNonce] = useState(0)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  const openCategory = useCallback(
    async (category) => {
      setSelected(category)
      setBusy(true)
      try {
        const res = await catalogueService.search({ q: category.query, limit: 24 })
        if (mounted.current) setResults(res)
      } catch {
        if (mounted.current) setResults({ tracks: [], artists: [], collections: [], status: 'error' })
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    [],
  )

  const playFrom = (queue) => (song) =>
    playQueue(queue, Math.max(0, queue.findIndex((s) => s._id === song._id)))

  return (
    <div className="space-y-8 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">Explore</h1>
        <p className="mt-1 text-sm text-muted">
          Browse by language and mood. Everything you see is one catalogue.
        </p>
      </header>

      {/* Categories */}
      <section className="animate-fade-up" aria-labelledby="explore-categories">
        <SectionHeader title="Browse categories" icon="grid" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES.map((category) => {
            const isActive = selected?.id === category.id
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => openCategory(category)}
                  aria-pressed={isActive}
                  className={`art-card group flex aspect-square w-full flex-col justify-end p-3 text-left
                    ${isActive ? 'ring-2 ring-brand-400' : ''}`}
                >
                  <SongCover
                    song={{ _id: category.id, title: category.label }}
                    size="full"
                    rounded="rounded-none"
                    className="absolute inset-0 !rounded-none opacity-90"
                  />
                  {/* Contrast layer so the label stays readable over any artwork. */}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <span className="relative text-sm font-bold text-white">{category.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Selected category results */}
      {selected ? (
        <section className="animate-fade-up space-y-6" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-white">{selected.label}</h2>
              <p className="text-xs text-muted">
                {busy
                  ? 'Loading…'
                  : `${results?.tracks?.length || 0} track${results?.tracks?.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/search?q=${encodeURIComponent(selected.query)}`)}
              className="btn-ghost shrink-0 px-4 py-2 text-sm"
            >
              Open in Search
            </button>
          </div>

          {results?.status === 'quota_exceeded' ? (
            <EmptyState
              icon="warning"
              title="YouTube search quota is temporarily unavailable. Local music is still available."
              message="The external music search quota has been reached. Please try again later."
            />
          ) : busy ? (
            <CardSkeletonRail />
          ) : results?.tracks?.length ? (
            <>
              <div key={queueNonce}>
                <div className="rail">
                  {results.tracks.map((track) => (
                    <SongCard
                      key={track.id}
                      song={{
                        _id: track.id,
                        title: track.title,
                        artistName: track.artist,
                        album: track.album,
                        coverUrl: track.artwork,
                        source: track.sourceId,
                        youtubeVideoId: track.youtubeVideoId,
                      }}
                      onPlay={playFrom(results.tracks)}
                      contextQueue={results.tracks}
                    />
                  ))}
                </div>
              </div>

              {/* Play-all starts the whole category as one queue. */}
              <button
                type="button"
                onClick={() => {
                  setQueueNonce((n) => n + 1)
                  playQueue(results.tracks, 0)
                }}
                className="btn-primary px-5 py-2.5"
              >
                <Icon name="play" className="h-4 w-4" filled />
                Play all
              </button>
            </>
          ) : (
            <EmptyState
              icon="search"
              title={`Nothing found for ${selected.label}`}
              message="Try another category, or search for a specific artist or song."
            />
          )}
        </section>
      ) : null}

      {/* Community rails from the existing discover endpoint (local data only) */}
      {loading ? (
        <div className="space-y-8">
          <CardSkeletonRail />
          <CardSkeletonRail />
        </div>
      ) : data?.trending?.length ? (
        <>
          <section className="animate-fade-up">
            <SectionHeader title="Trending on MUSICA" icon="fire" />
            <div className="rail">
              {data.trending.map((song) => (
                <SongCard
                  key={song._id}
                  song={song}
                  onPlay={playFrom(data.trending)}
                  contextQueue={data.trending}
                />
              ))}
            </div>
          </section>

          {data.popularArtists?.length ? (
            <section className="animate-fade-up">
              <SectionHeader title="Popular Artists" icon="users" />
              <div className="rail">
                {data.popularArtists.map((artist) => (
                  <SongCard
                    key={artist._id}
                    song={{ ...artist, title: artist.displayName }}
                    variant="artist"
                    to={`/artist/${artist._id}`}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}