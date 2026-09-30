import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usersService } from '../services'
import useFetch from '../hooks/useFetch'
import { useAuth } from '../context/AuthContext'
import { usePlayer } from '../context/PlayerContext'
import { useSocial } from '../hooks/useSocial'
import SongRow from '../components/music/SongRow'
import SongCard from '../components/music/SongCard'
import Avatar from '../components/ui/Avatar'
import Icon from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'
import { RowSkeleton } from '../components/ui/Skeleton'
import { compactNumber, timeAgo, truncate } from '../utils/format'

const TABS = [
  { key: 'songs', label: 'Songs' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'followers', label: 'Followers' },
  { key: 'following', label: 'Following' },
]

export default function Profile() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const player = usePlayer()
  const { toggleLike, toggleFollow } = useSocial()

  const [tab, setTab] = useState('songs')
  const targetId = id || me?._id

  const { data, loading, error } = useFetch(
    () => (targetId ? usersService.get(targetId) : Promise.reject(new Error('No user'))),
    [targetId],
  )

  if (loading) return <RowSkeleton count={6} />

  if (error || !data?.user) {
    return (
      <EmptyState
        icon="user"
        title="Profile not found"
        message={error || 'This profile may have been deleted.'}
        action={<Link to="/" className="btn-primary px-6 py-3">Back to Home</Link>}
      />
    )
  }

  const profile = data.user
  const songs = data.songs ?? []
  const playlists = data.playlists ?? []
  const isSelf = Boolean(profile.isSelf)

  const playAll = () => songs.length && player.playQueue(songs, 0)

  return (
    <div className="pb-6">
      {/* Banner */}
      <div className="relative animate-fade-up overflow-hidden rounded-panel">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/50 via-accent-pink/30 to-accent-blue/40" />
        <div className="absolute inset-0 backdrop-blur-sm" />

        <div className="relative flex flex-col items-center gap-5 p-8 text-center sm:flex-row sm:items-end sm:p-10 sm:text-left">
          <Avatar src={profile.avatarUrl} name={profile.displayName || profile.username} size="2xl" className="ring-4 ring-white/10" />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white/60">@{profile.username}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {profile.displayName}
            </h1>
            {profile.bio ? (
              <p className="mt-2 max-w-xl text-sm text-white/75" {...truncate(profile.bio, 3)}>
                {profile.bio}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-white/70 sm:justify-start">
              <span><strong className="text-white">{compactNumber(profile.followerCount)}</strong> followers</span>
              <span><strong className="text-white">{compactNumber(profile.followingCount)}</strong> following</span>
              <span><strong className="text-white">{compactNumber(songs.length)}</strong> songs</span>
              <span className="text-xs">Joined {timeAgo(profile.createdAt).replace(' ago', '')}</span>
            </div>
          </div>

          <div className="flex shrink-0 gap-3">
            {songs.length ? (
              <button type="button" onClick={playAll} className="btn-primary px-7 py-3">
                <Icon name="play" className="h-5 w-5" filled />
                Play
              </button>
            ) : null}

            {isSelf ? (
              <Link to="/upload" className="btn-ghost px-5 py-3">
                <Icon name="upload" className="h-4 w-4" />
                Upload
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => toggleFollow(profile)}
                className={profile.isFollowing ? 'btn-ghost px-6 py-3' : 'btn-primary px-6 py-3'}
                aria-pressed={profile.isFollowing}
              >
                <Icon name={profile.isFollowing ? 'check' : 'plus'} className="h-4 w-4" strokeWidth={2.2} />
                {profile.isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-2 overflow-x-auto border-b border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist" aria-label="Profile sections">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`relative shrink-0 px-4 pb-3 pt-1 text-sm font-semibold transition-colors ${
              tab === item.key ? 'text-white' : 'text-muted hover:text-soft'
            }`}>
            {item.label}
            {tab === item.key ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-brand" /> : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {tab === 'songs' ? (
          songs.length ? (
            songs.map((song, index) => (
              <SongRow key={song._id} song={song} index={index} queue={songs} onLike={toggleLike} showAlbum />
            ))
          ) : (
            <EmptyState
              icon="music"
              title={isSelf ? 'You haven\'t uploaded anything yet' : 'No songs yet'}
              message={isSelf ? 'Share your first track with the community.' : 'This artist hasn\'t published any tracks yet.'}
              action={isSelf ? <Link to="/upload" className="btn-primary px-6 py-3"><Icon name="upload" className="h-4 w-4" />Upload a track</Link> : null}
            />
          )
        ) : null}

        {tab === 'playlists' ? (
          playlists.length ? (
            <div className="rail">
              {playlists.map((playlist) => (
                <SongCard
                  key={playlist._id}
                  variant="playlist"
                  to={`/playlist/${playlist._id}`}
                  song={{
                    _id: playlist._id,
                    title: playlist.name,
                    coverUrl: playlist.coverUrl || playlist.songs?.[0]?.coverUrl,
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="playlist" title="No public playlists"
              message={isSelf ? 'Create a playlist to organise your favourites.' : 'Nothing shared here yet.'}
              action={isSelf ? <Link to="/playlists" className="btn-primary px-6 py-3">Create playlist</Link> : null} />
          )
        ) : null}

        {tab === 'followers' || tab === 'following' ? (
          <UserList users={tab === 'followers' ? data.followers : data.following} emptyLabel={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
        ) : null}
      </div>
    </div>
  )
}

/** Grid of people, used for both followers and following. */
function UserList({ users = [], emptyLabel }) {
  const { toggleFollow } = useSocial()

  if (!users.length) {
    return <EmptyState icon="users" title={emptyLabel} message="People will show up here." />
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((person) => (
        <div key={person._id} className="card-hover flex items-center gap-3 p-3">
          <Link to={`/artist/${person._id}`}>
            <Avatar src={person.avatarUrl} name={person.displayName} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/artist/${person._id}`} className="block truncate text-sm font-semibold text-white hover:underline">
              {person.displayName}
            </Link>
            <p className="truncate text-xs text-muted">@{person.username}</p>
          </div>
          <button type="button" onClick={() => toggleFollow(person)}
            className={person.isFollowing ? 'btn-ghost px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}
            aria-pressed={person.isFollowing}>
            {person.isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      ))}
    </div>
  )
}
