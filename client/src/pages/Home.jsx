import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalogueService } from '../services/catalogue'
import { songsService } from '../services'
import useFetch from '../hooks/useFetch'
import { usePlayer } from '../context/PlayerContext'
import { useAuth } from '../context/AuthContext'
import TrackCard, { ArtistCard, CollectionCard } from '../components/music/CatalogueCards'
import SongCard from '../components/music/SongCard'
import SectionHeader from '../components/ui/SectionHeader'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { CardSkeletonRail } from '../components/ui/Skeleton'

/**
 * Regional / worldwide discovery.
 *
 * The YouTube Data API exposes no language or region facet, so "worldwide" is
 * expressed through queries rather than a filter parameter. These are real
 * searches executed against the configured source - not hard-coded tracks.
 *
 * Lazy by design: a chip only spends quota when the listener actually taps it,
 * and the catalogue caches the result for 30 minutes afterwards.
 */
const REGIONS = [
  { id: 'malayalam', label: 'Malayalam', query: 'malayalam songs' },
  { id: 'tamil', label: 'Tamil', query: 'tamil songs' },
  { id: 'telugu', label: 'Telugu', query: 'telugu songs' },
  { id: 'hindi', label: 'Hindi', query: 'hindi songs' },
  { id: 'kannada', label: 'Kannada', query: 'kannada songs' },
  { id: 'bengali', label: 'Bengali', query: 'bengali songs' },
  { id: 'punjabi', label: 'Punjabi', query: 'punjabi songs' },
  { id: 'marathi', label: 'Marathi', query: 'marathi songs' },
  { id: 'gujarati', label: 'Gujarati', query: 'gujarati songs' },
  { id: 'korean', label: 'Korean', query: 'korean songs' },
  { id: 'japanese', label: 'Japanese', query: 'japanese songs' },
  { id: 'arabic', label: 'Arabic', query: 'arabic songs' },
  { id: 'spanish', label: 'Spanish', query: 'spanish songs' },
  { id: 'french', label: 'French', query: 'french songs' },
  { id: 'german', label: 'German', query: 'german songs' },
  { id: 'portuguese', label: 'Portuguese', query: 'portuguese songs' },
  { id: 'latin', label: 'Latin', query: 'latin songs' },
  { id: 'african', label: 'African', query: 'african songs' },
]

/** Quick Picks: short, real queries that surface a varied first page. */
/**
 * Quick Picks are genre shelves, each backed by a real search.
 *
 * Every one of these costs a YouTube `search.list` call (100 units), and the
 * server needs a second call to populate Collections, so the list is kept short
 * deliberately: six shelves cost 1200 units on a cold visit. Four keeps the
 * feature while cutting the worst-case cost by a third. The catalogue client's
 * query cache means a returning listener pays nothing for any of them.
 */
const QUICK_PICKS = [
  { id: 'qp-lofi', label: 'Lo-fi beats', query: 'lofi beats' },
  { id: 'qp-jazz', label: 'Jazz', query: 'jazz music' },
  { id: 'qp-workout', label: 'Workout', query: 'workout motivation music' },
  { id: 'qp-chill', label: 'Chill', query: 'chill music' },
]

/**
 * MUSICA Home.
 *
 * A music-streaming front page: a large hero, then horizontal rails of real
 * tracks, artists and collections pulled from every available source through
 * /api/catalogue/home.
 *
 * Two things matter here:
 *  - the catalogue is never hard-coded; every track comes from a live source
 *  - opening Home issues a small, fixed number of requests rather than one per
 *    rail, and the regional rail is lazy so it does not run on first paint
 */
export default function Home() {
  const player = usePlayer()
  const { user } = useAuth()

  // Local-library data for the Recommended / Recently Added rails. This endpoint
  // is pure MongoDB - no YouTube call - so it is safe to always request.
  const { data: local } = useFetch(() => songsService.discover(), [])

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [region, setRegion] = useState(null)
  const [regionTracks, setRegionTracks] = useState(null)
  const [regionLoading, setRegionLoading] = useState(false)

  const [quickTracks, setQuickTracks] = useState({})

  // ---- Home rails: one request, not one per rail ----------------------
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    catalogueService
      .home(12)
      .then((payload) => {
        if (!cancelled) {
          setData(payload)
          setError('')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the music catalogue.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ---- Regional rail: lazy, only when the visitor asks for it ----------
  const loadRegion = useCallback(
    async (item) => {
      if (region?.id === item.id) return
      setRegion(item)
      setRegionLoading(true)
      setRegionTracks(null)
      try {
        const res = await catalogueService.search({ q: item.query, limit: 12 })
        setRegionTracks(res.tracks || [])
      } catch {
        setRegionTracks([])
      } finally {
        setRegionLoading(false)
      }
    },
    [region],
  )

  // ---- Quick Picks: lazy, only once the section is actually reached ------
  //
  // These are live searches (each one costs a YouTube search.list call). Running
  // them on first paint used to spend six searches before the visitor had even
  // looked at the page, which exhausted the shared daily allowance and left
  // later searches returning nothing. Two guards now apply: an
  // IntersectionObserver means they cost nothing unless the visitor scrolls to
  // them, and the catalogue client caches each query, so returning to Home
  // later costs nothing either.
  const quickRef = useRef(null)
  const [quickStarted, setQuickStarted] = useState(false)

  useEffect(() => {
    const node = quickRef.current
    if (!node || quickStarted) return undefined

    if (typeof IntersectionObserver === 'undefined') {
      setQuickStarted(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setQuickStarted(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [quickStarted])

  useEffect(() => {
    if (!quickStarted) return undefined
    let cancelled = false

    const run = async () => {
      for (const pick of QUICK_PICKS) {
        if (cancelled) return
        try {
          const res = await catalogueService.search({ q: pick.query, limit: 8 })
          if (cancelled) return
          setQuickTracks((prev) => ({ ...prev, [pick.id]: res.tracks || [] }))

          // Stop on the first exhausted quota rather than continuing through the
          // remaining shelves. The server already refuses further upstream calls,
          // so this is about not queueing pointless round trips and not showing
          // four identically-empty rails.
          if (res.status === 'quota_exceeded') {
            for (const rest of QUICK_PICKS.slice(QUICK_PICKS.indexOf(pick) + 1)) {
              setQuickTracks((prev) => ({ ...prev, [rest.id]: [] }))
            }
            return
          }
        } catch {
          if (cancelled) return
          setQuickTracks((prev) => ({ ...prev, [pick.id]: [] }))
        }
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [quickStarted])

  const popular = data?.popular || []
  const collections = data?.collections || []
  const recent = data?.recent || []
  const artists = data?.artists || []

  // Local-library rails. /api/songs/discover is served entirely from MongoDB, so
  // these sections cost ZERO YouTube quota. That is why Recommended and Recently
  // Added can be added without touching the daily search budget.
  const localPlay = useCallback(
    (song, queue) =>
      player.playQueue(queue, Math.max(0, queue.findIndex((s) => s._id === song._id))),
    [player],
  )

  const hero = popular[0] || null
  const quickPicks = useMemo(
    () => QUICK_PICKS.map((p) => ({ ...p, tracks: quickTracks[p.id] })).filter((p) => p.tracks?.length),
    [quickTracks],
  )

  const playTrack = useCallback(
    (track) => {
      player.playSong(track, [track])
    },
    [player],
  )

  const hasAnySource = (data?.sources || []).some((s) => s.available)

  return (
    <div className="space-y-10 pb-6">
      {/* ---------- Hero: Listen Now ---------- */}
      <header className="animate-fade-up">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
          Listen now
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
          {user ? `Welcome back, ${user.displayName || user.username}` : 'Your music, everywhere'}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Browse music from every source MUSICA can reach.
        </p>
      </header>

      {error ? (
        <EmptyState icon="warning" title="Catalogue unavailable" message={error} />
      ) : null}

      {/* ---------- Hero feature ---------- */}
      {hero ? (
        <section className="animate-fade-up overflow-hidden rounded-2xl bg-base-900 ring-1 ring-white/10">
          <div className="grid gap-0 sm:grid-cols-[240px_1fr]">
            <div className="relative aspect-square sm:aspect-auto">
              {hero.artwork ? (
                <img
                  src={hero.artwork}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-600/50 to-accent-blue/30">
                  <Icon name="music" className="h-10 w-10 text-white/40" />
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center gap-3 p-5 sm:p-7">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-soft uppercase">
                <Icon name="fire" className="h-3 w-3" />
                Featured
              </span>
              <h2 className="text-2xl font-bold text-balance text-white sm:text-3xl">
                {hero.title}
              </h2>
              <p className="text-sm text-muted">{hero.artist}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => playTrack(hero)}
                  className="btn-primary px-6 py-2.5"
                >
                  <Icon name="play" className="h-4 w-4" filled />
                  Play
                </button>
                <Link to={`/search?q=${encodeURIComponent(hero.title)}`} className="btn-ghost px-5 py-2.5">
                  See more like this
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : loading ? (
        <div className="grid gap-0 overflow-hidden rounded-2xl ring-1 ring-white/10 sm:grid-cols-[240px_1fr]">
          <div className="aspect-square animate-pulse bg-white/5 sm:aspect-auto" />
          <div className="space-y-3 p-7">
            <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-white/5" />
            <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      ) : null}

      {/* ---------- Recents ---------- */}
      {recent.length ? (
        <Rail title="Recents" icon="clock" subtitle="Pick up where you left off">
          {recent.slice(0, 8).map((track) => (
            <TrackCard key={track.id} track={track} onPlay={playTrack} />
          ))}
        </Rail>
      ) : null}

      {/* ---------- Trending (source-agnostic) ---------- */}
      <Rail title="Trending" icon="fire" subtitle="Popular right now">
        {loading
          ? null
          : popular.map((track) => <TrackCard key={track.id} track={track} onPlay={playTrack} />)}
      </Rail>

      {/* ---------- Albums & Singles ---------- */}
      <Rail title="Albums & Singles" icon="album" subtitle="Collections from every source">
        {loading
          ? null
          : collections.map((c) => <CollectionCard key={c.id} collection={c} />)}
      </Rail>

      {/* ---------- Recommended (local library; no upstream quota) ---------- */}
      {local?.trending?.length ? (
        <Rail title="Recommended" icon="spark" subtitle="From your library">
          {local.trending.slice(0, 12).map((song) => (
            <SongCard
              key={song._id}
              song={song}
              onPlay={(s) => localPlay(s, local.trending)}
              contextQueue={local.trending}
            />
          ))}
        </Rail>
      ) : null}

      {/* ---------- Artists ---------- */}
      <Rail title="Artists" icon="users">
        {loading
          ? null
          : artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}
      </Rail>

      {/* ---------- Recently Added (local library; no upstream quota) ---------- */}
      {local?.recentlyAdded?.length ? (
        <Rail title="Recently Added" icon="plus" subtitle="Fresh in the library">
          {local.recentlyAdded.slice(0, 12).map((song) => (
            <SongCard
              key={song._id}
              song={song}
              onPlay={(s) => localPlay(s, local.recentlyAdded)}
              contextQueue={local.recentlyAdded}
            />
          ))}
        </Rail>
      ) : null}

      {/* ---------- Quick Picks ---------- */}
      {quickPicks.length ? (
        <section ref={quickRef}>
          <SectionHeader title="Quick Picks" icon="spark" />
          <div className="space-y-6">
            {quickPicks.map((pick) => (
              <Rail key={pick.id} title={pick.label} bare>
                {pick.tracks.slice(0, 8).map((track) => (
                  <TrackCard key={track.id} track={track} onPlay={playTrack} />
                ))}
              </Rail>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Regional Music ---------- */}
      <section>
        <SectionHeader title="Regional Music" icon="compass" />
        <div className="rail -mx-1 px-1 pb-1">
          {REGIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => loadRegion(item)}
              aria-pressed={region?.id === item.id}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                region?.id === item.id
                  ? 'border-brand-400 bg-brand-500/20 text-white'
                  : 'border-white/10 text-muted hover:border-white/25 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {regionLoading ? (
          <div className="mt-4">
            <CardSkeletonRail count={8} />
          </div>
        ) : null}

        {region && !regionLoading ? (
          <div className="mt-4">
            <p className="mb-3 text-xs text-muted">{region.label} music</p>
            {regionTracks?.length ? (
              <div className="rail">
                {regionTracks.slice(0, 12).map((track) => (
                  <TrackCard key={track.id} track={track} onPlay={playTrack} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Nothing found for {region.label} right now.</p>
            )}
          </div>
        ) : null}
      </section>

      {/* ---------- Empty state when no source is configured ---------- */}
      {!loading && !error && !hasAnySource ? (
        <EmptyState
          icon="music"
          title="No music source configured"
          message="This server has no music source available yet."
        />
      ) : null}
    </div>
  )
}

/** A horizontal scrolling rail of cards. */
function Rail({ title, icon, subtitle, children, bare = false }) {
  const hasContent = Array.isArray(children) ? children.filter(Boolean).length > 0 : Boolean(children)

  if (!bare && !hasContent) return null

  return (
    <section className="animate-fade-up">
      {!bare ? <SectionHeader title={title} icon={icon} subtitle={subtitle} /> : null}
      <div className="rail">{children}</div>
    </section>
  )
}