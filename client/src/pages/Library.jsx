import { useState } from 'react'
import { Link } from 'react-router-dom'
import { songsService, historyService, playlistsService } from '../services'
import { toFriendlyError } from '../services/api'
import useFetch from '../hooks/useFetch'
import { useToast } from '../context/ToastContext'
import { usePlayer } from '../context/PlayerContext'
import { useAuth } from '../context/AuthContext'
import { useSocial } from '../hooks/useSocial'
import SongRow from '../components/music/SongRow'
import SongCard from '../components/music/SongCard'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { RowSkeleton, CardSkeletonRail } from '../components/ui/Skeleton'
import { cx } from '../utils/format'
import UploadCta from '../components/music/UploadCta'

const TABS = [
  { key: 'liked', label: 'Liked Songs', icon: 'heart' },
  { key: 'recent', label: 'Recently Played', icon: 'clock' },
  { key: 'playlists', label: 'Playlists', icon: 'playlist' },
  { key: 'uploads', label: 'My Uploads', icon: 'upload' },
]

export default function Library() {
  const [tab, setTab] = useState('liked')
  const { user } = useAuth()
  const toast = useToast()
  const player = usePlayer()
  const { toggleLike } = useSocial()

  const fetcher = () => {
    if (tab === 'liked') return songsService.liked()
    if (tab === 'recent') return historyService.list(50)
    if (tab === 'playlists') return playlistsService.list({ scope: 'mine' })
    return songsService.mine()
  }

  const { data, loading, error, reload } = useFetch(fetcher, [tab])

  const songs = tab === 'playlists' ? [] : data?.songs ?? []
  const playlists = data?.items ?? []

  const playAll = () => {
    if (songs.length) player.playQueue(songs, 0)
  }

  const clearHistory = async () => {
    try {
      await historyService.clear()
      toast.success('Listening history cleared.')
      reload()
    } catch (err) {
      toast.error(toFriendlyError(err))
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">Your Library</h1>
        <p className="mt-1 text-sm text-muted">Everything you've saved and played, in one place.</p>
      </header>

      {/* Tabs */}
      <div className="rail border-b border-white/10" role="tablist" aria-label="Library sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cx(
              'relative flex shrink-0 items-center gap-2 px-4 pb-3 pt-1 text-sm font-semibold transition-colors',
              tab === item.key ? 'text-white' : 'text-muted hover:text-soft',
            )}
          >
            <Icon name={item.icon} className={cx('h-4 w-4', tab === item.key && 'text-brand-400')} />
            {item.label}
            {tab === item.key ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-brand" />
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <EmptyState icon="wifiOff" title="Could not load your library" message={error} action={<button type="button" onClick={reload} className="btn-primary px-5 py-2.5">Try again</button>} />
      ) : loading ? (
        tab === 'playlists' ? <CardSkeletonRail /> : <RowSkeleton count={6} />
      ) : tab === 'playlists' ? (
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
                  songCount: playlist.songs?.length ?? 0,
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="playlist"
            title="You have no playlists yet"
            message="Group your favourite tracks together and they'll show up here."
            action={
              <Link to="/playlists" className="btn-primary px-6 py-3">
                <Icon name="plus" className="h-4 w-4" />
                Create a playlist
              </Link>
            }
          />
        )
      ) : songs.length ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={playAll} className="btn-primary px-6 py-3">
              <Icon name="play" className="h-4 w-4" filled />
              Play all
            </button>
            <span className="text-sm text-muted">
              {songs.length} song{songs.length === 1 ? '' : 's'}
            </span>
            {tab === 'recent' ? (
              <button type="button" onClick={clearHistory} className="btn-subtle ml-auto text-xs">
                <Icon name="trash" className="h-4 w-4" />
                Clear history
              </button>
            ) : null}
          </div>

          <div>
            {songs.map((song, index) => (
              <SongRow key={song._id} song={song} index={index} queue={songs} onLike={toggleLike} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyStateForTab tab={tab} user={user} />
      )}
    </div>
  )
}

/** Different copy per empty tab - clearer than one generic message. */
function EmptyStateForTab({ tab, user }) {
  if (tab === 'liked') {
    return (
      <EmptyState
        icon="heart"
        title="No liked songs yet"
        message="Tap the heart on any song to keep it here for quick access."
        action={
          <Link to="/discover" className="btn-primary px-6 py-3">
            <Icon name="compass" className="h-4 w-4" />
            Find music
          </Link>
        }
      />
    )
  }
  if (tab === 'recent') {
    return (
      <EmptyState
        icon="clock"
        title="Nothing played yet"
        message="Songs you listen to show up here automatically."
      />
    )
  }
  return (
    <EmptyState
      icon="upload"
      title="You haven't uploaded anything yet"
      message={`Share your own music, ${user?.displayName || 'and let people hear it'}.`}
      action={
        <UploadCta className="btn-primary px-6 py-3">
          <Icon name="upload" className="h-4 w-4" />
          Upload a track
        </UploadCta>
      }
    />
  )
}
