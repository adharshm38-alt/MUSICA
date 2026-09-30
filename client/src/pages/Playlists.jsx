import { useState } from 'react'
import { Link } from 'react-router-dom'
import { playlistsService } from '../services'
import { toFriendlyError } from '../services/api'
import useFetch from '../hooks/useFetch'
import { useToast } from '../context/ToastContext'
import SongCard from '../components/music/SongCard'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { CardSkeletonRail } from '../components/ui/Skeleton'
import { cx } from '../utils/format'

/** Manage your own playlists, and browse public ones from the community. */
export default function Playlists() {
  const [scope, setScope] = useState('mine')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [busy, setBusy] = useState(false)

  const toast = useToast()
  const { data, loading, error, reload } = useFetch(() => playlistsService.list({ scope }), [scope])

  const playlists = data?.items ?? []

  const create = async (event) => {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Give your playlist a name.')
      return
    }
    setBusy(true)
    try {
      const { playlist } = await playlistsService.create({
        name: name.trim(),
        description: description.trim(),
        isPublic,
      })
      toast.success(`Created "${playlist.name}".`)
      setName('')
      setDescription('')
      setCreating(false)
      reload()
    } catch (err) {
      toast.error(toFriendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Playlists</h1>
          <p className="mt-1 text-sm text-muted">Group tracks together however you like.</p>
        </div>
        <button type="button" onClick={() => setCreating((v) => !v)} className="btn-primary px-5 py-2.5">
          <Icon name={creating ? 'close' : 'plus'} className="h-4 w-4" />
          {creating ? 'Cancel' : 'New playlist'}
        </button>
      </header>

      <div className="flex gap-2" role="tablist" aria-label="Playlist scope">
        {[
          { key: 'mine', label: 'My playlists' },
          { key: 'public', label: 'Community' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={scope === item.key}
            onClick={() => setScope(item.key)}
            className={cx(
              'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
              scope === item.key
                ? 'bg-gradient-brand text-white shadow-lg shadow-brand-600/25'
                : 'border border-white/10 bg-white/5 text-muted hover:bg-white/10 hover:text-white',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {creating ? (
        <form onSubmit={create} className="card animate-slide-up space-y-4 p-5">
          <div>
            <label htmlFor="pl-name" className="field-label">Name *</label>
            <input id="pl-name" className="field" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Late night drives" maxLength={100} autoFocus />
          </div>
          <div>
            <label htmlFor="pl-desc" className="field-label">Description</label>
            <input id="pl-desc" className="field" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional" maxLength={500} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-muted">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand-500" />
            Make this playlist public
          </label>
          <button type="submit" className="btn-primary px-6 py-2.5" disabled={busy}>
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
            Create playlist
          </button>
        </form>
      ) : null}

      {error ? (
        <EmptyState icon="wifiOff" title="Could not load playlists" message={error}
          action={<button type="button" onClick={reload} className="btn-primary px-5 py-2.5">Try again</button>} />
      ) : loading ? (
        <CardSkeletonRail />
      ) : playlists.length ? (
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
          title={scope === 'mine' ? 'No playlists yet' : 'No public playlists yet'}
          message={
            scope === 'mine'
              ? 'Create your first playlist and start adding songs to it.'
              : 'When someone makes a playlist public, it will show up here.'
          }
          action={
            scope === 'mine' ? (
              <button type="button" onClick={() => setCreating(true)} className="btn-primary px-6 py-3">
                <Icon name="plus" className="h-4 w-4" />
                New playlist
              </button>
            ) : (
              <Link to="/discover" className="btn-ghost px-6 py-3">Browse music</Link>
            )
          }
        />
      )}
    </div>
  )
}
