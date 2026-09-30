import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePlayer } from '../context/PlayerContext'
import api, { toFriendlyError } from '../services/api'
import { useToast } from '../context/ToastContext'
import SongCard from '../components/music/SongCard'
import SectionHeader from '../components/ui/SectionHeader'
import Icon from '../components/ui/Icon'
import { CardSkeletonRail } from '../components/ui/Skeleton'
import { gradientFor, truncate } from '../utils/format'

export default function Home() {
  const { user } = useAuth()
  const player = usePlayer()
  const toast = useToast()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get('/songs/discover')
      .then(({ data: res }) => {
        if (!cancelled) setData(res.data)
      })
      .catch((error) => {
        if (!cancelled) toast.error(toFriendlyError(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const handlePlay = (song, queue) => player.playQueue(queue, queue.findIndex((s) => s._id === song._id))

  const hero = data?.featured?.[0]
  const greeting = user ? `Welcome back, ${user.displayName?.split(' ')[0] || user.username}` : 'Welcome to MUSICA'

  return (
    <div className="space-y-10 pb-6">
      {/* ---------- Header ---------- */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            {greeting.split(' ').slice(0, 2).join(' ')}{' '}
            {greeting.split(' ').slice(2).join(' ') ? (
              <span className="text-gradient">{greeting.split(' ').slice(2).join(' ')}</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user ? 'Pick up where you left off.' : 'Stream music shared by the community.'}
          </p>
        </div>

        <Link to="/search" className="btn-ghost hidden sm:inline-flex">
          <Icon name="search" className="h-4 w-4" />
          Search
        </Link>
      </header>

      {/* ---------- Hero ---------- */}
      <section
        className="relative animate-fade-in overflow-hidden rounded-panel border border-white/10"
        aria-label="Featured music"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientFor(hero?._id || 'musica')} opacity-70`} />
        {hero?.coverUrl ? (
          <img
            src={hero.coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-luminosity"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />

        <div className="relative flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-end sm:p-10">
          <div className="max-w-lg">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold tracking-wider text-white uppercase backdrop-blur-sm">
              <Icon name="spark" className="h-3.5 w-3.5" />
              Featured today
            </span>

            <h2
              className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl"
              {...truncate(hero?.title || 'Discover something new', 2)}
            >
              {hero?.title || 'Discover something new'}
            </h2>

            <p className="mt-3 text-sm text-white/70">
              {hero
                ? `${hero.artistName || 'Unknown artist'} · ${hero.playCount || 0} plays`
                : 'Share your own music and start a community.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => hero && handlePlay(hero, data.featured)}
                className="btn-primary px-6 py-3"
              >
                <Icon name="play" className="h-4 w-4" filled />
                Play
              </button>
              <Link to="/discover" className="btn-ghost px-6 py-3">
                Explore
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Sections ---------- */}
      {loading ? (
        <div className="space-y-10">
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <div className="skeleton mb-4 h-6 w-40 rounded" />
              <CardSkeletonRail />
            </div>
          ))}
        </div>
      ) : (
        <>
          <HomeRail title="Recently Added" icon="clock" songs={data?.recentlyAdded} onPlay={handlePlay} />
          <HomeRail title="Trending Now" icon="fire" songs={data?.trending} onPlay={handlePlay} />
          <HomeRail title="Most Played" icon="chart" songs={data?.mostPlayed} onPlay={handlePlay} />
          <HomeRail
            title="Popular Artists"
            icon="users"
            artists={data?.popularArtists}
          />
          <HomeRail
            title="Featured Playlists"
            icon="playlist"
            playlists={data?.featuredPlaylists}
            onPlay={(song) => player.playQueue([song])}
          />
          {user ? <HomeRail title="Recently Played" icon="clock" songs={data?.recentlyPlayed} onPlay={handlePlay} /> : null}
        </>
      )}
    </div>
  )
}

/** One horizontal scrolling section on the Home page. */
function HomeRail({ title, icon, songs, artists, playlists, onPlay }) {
  const items = songs || artists || playlists
  if (!items?.length) return null

  const variant = artists ? 'artist' : playlists ? 'playlist' : 'song'
  const collection = items

  return (
    <section className="animate-fade-up">
      <SectionHeader
        title={title}
        icon={icon}
        action={
          <Link to={variant === 'playlist' ? '/playlists' : variant === 'artist' ? '/discover' : '/search'} className="btn-subtle text-xs">
            See all
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        }
      />

      <div className="rail">
        {collection.map((item) => (
          <SongCard
            key={item._id}
            song={item}
            variant={variant}
            to={
              variant === 'artist'
                ? `/artist/${item._id}`
                : variant === 'playlist'
                  ? `/playlist/${item._id}`
                  : undefined
            }
            onPlay={variant === 'song' ? (song, queue) => onPlay(song, queue) : undefined}
            contextQueue={collection}
          />
        ))}
      </div>
    </section>
  )
}
