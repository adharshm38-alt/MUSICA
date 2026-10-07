import { Link } from 'react-router-dom'
import { songsService } from '../services'
import useFetch from '../hooks/useFetch'
import { usePlayer } from '../context/PlayerContext'
import { useSocial } from '../hooks/useSocial'
import SongCard from '../components/music/SongCard'
import SectionHeader from '../components/ui/SectionHeader'
import EmptyState from '../components/ui/EmptyState'
import { CardSkeletonRail } from '../components/ui/Skeleton'
import Icon from '../components/ui/Icon'
import UploadCta from '../components/music/UploadCta'

/** Discover = browse by genre and see what's popular right now. */
export default function Discover() {
  const { data, loading } = useFetch(() => songsService.discover(), [])
  const player = usePlayer()
  const { toggleLike } = useSocial()

  const genres = ['Electronic', 'Hip-Hop', 'Rock', 'Pop', 'Lo-fi', 'Jazz', 'Classical', 'Ambient', 'R&B', 'Indie']

  const handlePlay = (song, queue) =>
    player.playQueue(queue, Math.max(0, queue.findIndex((s) => s._id === song._id)))

  return (
    <div className="space-y-10 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">
          Find your next <span className="text-gradient">favourite track</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          Browse genres and see what the community is listening to right now.
        </p>
      </header>

      {/* Genres */}
      <section className="animate-fade-up">
        <SectionHeader title="Browse by genre" icon="grid" />
        <div className="flex flex-wrap gap-2.5">
          {genres.map((genre) => (
            <Link
              key={genre}
              to={`/search?q=${encodeURIComponent(genre)}`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-soft
                         transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/50
                         hover:bg-brand-500/20 hover:text-white"
            >
              {genre}
            </Link>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="space-y-10">
          {[1, 2].map((n) => (
            <div key={n}>
              <div className="skeleton mb-4 h-6 w-40 rounded" />
              <CardSkeletonRail />
            </div>
          ))}
        </div>
      ) : data?.trending?.length ? (
        <>
          <section className="animate-fade-up">
            <SectionHeader title="Trending Now" icon="fire" />
            <div className="rail">
              {data.trending.map((song) => (
                <SongCard
                  key={song._id}
                  song={song}
                  onPlay={handlePlay}
                  onLike={toggleLike}
                  liked={song.isLiked}
                  contextQueue={data.trending}
                />
              ))}
            </div>
          </section>

          <section className="animate-fade-up">
            <SectionHeader title="Popular Artists" icon="users" />
            <div className="rail">
              {data.popularArtists.map((artist) => (
                <SongCard key={artist._id} song={{ ...artist, title: artist.displayName }} variant="artist" to={`/artist/${artist._id}`} />
              ))}
            </div>
          </section>

          <section className="animate-fade-up">
            <SectionHeader title="Recently Added" icon="clock" />
            <div className="rail">
              {data.recentlyAdded.map((song) => (
                <SongCard
                  key={song._id}
                  song={song}
                  onPlay={handlePlay}
                  onLike={toggleLike}
                  liked={song.isLiked}
                  contextQueue={data.recentlyAdded}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          icon="compass"
          title="Nothing to discover yet"
          message="Be the first to upload a track. Once you do, it'll show up here for everyone to hear."
          action={
            <UploadCta className="btn-primary px-6 py-3">
              <Icon name="upload" className="h-4 w-4" />
              Upload music
            </UploadCta>
          }
        />
      )}
    </div>
  )
}
