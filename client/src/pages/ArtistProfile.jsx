import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usersService } from '../services'
import useFetch from '../hooks/useFetch'
import { usePlayer } from '../context/PlayerContext'
import { useSocial } from '../hooks/useSocial'
import SongRow from '../components/music/SongRow'
import SongCard from '../components/music/SongCard'
import Avatar from '../components/ui/Avatar'
import Icon from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'
import ReportDialog from '../components/ui/ReportDialog'
import { RowSkeleton } from '../components/ui/Skeleton'
import { compactNumber, timeAgo, truncate } from '../utils/format'

const TABS = [
  { key: 'songs', label: 'Popular' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'about', label: 'About' },
]

/** Public artist page: popular tracks, playlists and an about section. */
export default function ArtistProfile() {
  const { id } = useParams()
  const player = usePlayer()
  const { toggleLike, toggleFollow, busyIds } = useSocial()
  const [tab, setTab] = useState('songs')
  const [reporting, setReporting] = useState(false)

  const { data, loading, error } = useFetch(() => usersService.get(id), [id])

  if (loading) return <RowSkeleton count={6} />

  if (error || !data?.user) {
    return (
      <EmptyState
        icon="user"
        title="Artist not found"
        message={error || 'This profile may have been removed.'}
        action={<Link to="/discover" className="btn-primary px-6 py-3">Discover artists</Link>}
      />
    )
  }

  const artist = data.user
  const songs = data.songs ?? []
  const playlists = data.playlists ?? []
  const popular = [...songs].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
  const playAll = () => popular.length && player.playQueue(popular, 0)

  return (
    <div className="pb-6">
      {/* Banner */}
      <div className="relative animate-fade-up overflow-hidden rounded-panel">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/50 via-accent-pink/30 to-accent-blue/40" />

        <div className="relative flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:items-end sm:p-10 sm:text-left">
          <Avatar src={artist.avatarUrl} name={artist.displayName || artist.username} size="2xl" className="ring-4 ring-white/10" />

          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white/60 sm:justify-start">
              <Icon name="check" className="h-3.5 w-3.5 text-brand-300" strokeWidth={2.6} />
              Verified artist
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-5xl" {...truncate(artist.displayName, 2)}>
              {artist.displayName}
            </h1>
            <p className="mt-1 text-sm text-white/60">@{artist.username}</p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-white/70 sm:justify-start">
              <span><strong className="text-white">{compactNumber(artist.followerCount)}</strong> followers</span>
              <span><strong className="text-white">{songs.length}</strong> tracks</span>
              <span><strong className="text-white">{playlists.length}</strong> playlists</span>
            </div>
          </div>

          <div className="flex shrink-0 gap-3">
            {popular.length ? (
              <button type="button" onClick={playAll} className="btn-primary px-7 py-3">
                <Icon name="play" className="h-5 w-5" filled />
                Play
              </button>
            ) : null}
            {!artist.isSelf ? (
              <button
                type="button"
                onClick={() => toggleFollow(artist)}
                className={artist.isFollowing ? 'btn-ghost px-6 py-3' : 'btn-primary px-6 py-3'}
                aria-pressed={artist.isFollowing}
                disabled={busyIds.has(artist._id)}
              >
                <Icon name={artist.isFollowing ? 'check' : 'plus'} className="h-4 w-4" strokeWidth={2.2} />
                {artist.isFollowing ? 'Following' : 'Follow'}
              </button>
            ) : null}
            {!artist.isSelf ? (
              <button type="button" onClick={() => setReporting(true)} className="btn-icon" aria-label="Report this artist">
                <Icon name="flag" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-2 border-b border-white/10" role="tablist" aria-label="Artist sections">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`relative px-4 pb-3 pt-1 text-sm font-semibold transition-colors ${
              tab === item.key ? 'text-white' : 'text-muted hover:text-soft'
            }`}>
            {item.label}
            {tab === item.key ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-brand" /> : null}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'songs' ? (
          popular.length ? (
            popular.map((song, index) => (
              <SongRow key={song._id} song={song} index={index} queue={popular} onLike={toggleLike} showAlbum />
            ))
          ) : (
            <EmptyState icon="music" title="No tracks yet" message="This artist hasn't published any tracks." />
          )
        ) : null}

        {tab === 'playlists' ? (
          playlists.length ? (
            <div className="rail">
              {playlists.map((playlist) => (
                <SongCard key={playlist._id} variant="playlist" to={`/playlist/${playlist._id}`}
                  song={{ _id: playlist._id, title: playlist.name, coverUrl: playlist.coverUrl || playlist.songs?.[0]?.coverUrl }} />
              ))}
            </div>
          ) : (
            <EmptyState icon="playlist" title="No public playlists" message="Nothing shared here yet." />
          )
        ) : null}

        {tab === 'about' ? (
          <div className="card max-w-2xl space-y-4 p-6">
            <div>
              <h2 className="text-sm font-bold text-white">About</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {artist.bio || 'This artist hasn’t written a bio yet.'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Joined</dt>
                <dd className="mt-0.5 font-semibold text-white">{timeAgo(artist.createdAt).replace(' ago', '')} ago</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Followers</dt>
                <dd className="mt-0.5 font-semibold text-white">{compactNumber(artist.followerCount)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>

      {reporting ? (
        <ReportDialog
          targetType="user"
          targetId={artist._id}
          targetLabel={`@${artist.username}`}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  )
}
