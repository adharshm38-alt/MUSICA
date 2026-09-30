import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { playlistsService, songsService } from '../services'
import { toFriendlyError } from '../services/api'
import useFetch from '../hooks/useFetch'
import { useToast } from '../context/ToastContext'
import { usePlayer } from '../context/PlayerContext'
import { useSocial } from '../hooks/useSocial'
import SongRow from '../components/music/SongRow'
import SongCover from '../components/music/SongCover'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { RowSkeleton } from '../components/ui/Skeleton'
import { truncate } from '../utils/format'

export default function PlaylistDetail() {
  const { id } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const player = usePlayer()
  const { toggleLike } = useSocial()

  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPublic, setEditPublic] = useState(true)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useFetch(() => playlistsService.get(id), [id])
  const playlist = data?.playlist
  const songs = playlist?.songs ?? []
  const isOwner = Boolean(playlist?.isOwner)

  const startEditing = () => {
    setEditName(playlist.name)
    setEditDesc(playlist.description || '')
    setEditPublic(playlist.isPublic)
    setEditing(true)
  }

  const saveEdits = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await playlistsService.update(playlist._id, {
        name: editName.trim(),
        description: editDesc.trim(),
        isPublic: editPublic,
      })
      toast.success('Playlist updated.')
      setEditing(false)
      reload()
    } catch (err) {
      toast.error(toFriendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const removePlaylist = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return
    try {
      await playlistsService.remove(playlist._id)
      toast.success('Playlist deleted.')
      navigate('/playlists')
    } catch (err) {
      toast.error(toFriendlyError(err))
    }
  }

  const removeSong = async (songId) => {
    try {
      await playlistsService.removeSong(playlist._id, songId)
      toast.success('Removed from playlist.')
      reload()
    } catch (err) {
      toast.error(toFriendlyError(err))
    }
  }

  /** Move a track up or down by one, then persist the new order. */
  const moveSong = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= songs.length) return
    const order = songs.map((song) => song._id)
    ;[order[index], order[target]] = [order[target], order[index]]
    try {
      await playlistsService.reorder(playlist._id, order)
      reload()
    } catch (err) {
      toast.error(toFriendlyError(err))
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="skeleton h-48 w-48 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-3 pt-4">
            <div className="skeleton h-8 w-2/3 rounded" />
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </div>
        </div>
        <RowSkeleton count={6} />
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <EmptyState
        icon="playlist"
        title="Playlist unavailable"
        message={error || 'This playlist may have been deleted or is set to private.'}
        action={
          <Link to="/playlists" className="btn-primary px-6 py-3">
            <Icon name="arrowLeft" className="h-4 w-4" />
            Back to playlists
          </Link>
        }
      />
    )
  }

  const totalSeconds = songs.reduce((sum, song) => sum + (song.duration || 0), 0)
  const coverUrl = playlist.coverUrl || songs[0]?.coverUrl

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="relative animate-fade-up overflow-hidden rounded-panel">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/40 via-accent-pink/25 to-accent-blue/35" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:p-8">
          <div className="w-40 shrink-0 sm:w-52">
            <SongCover song={{ title: playlist.name, coverUrl }} size="full" className="aspect-square w-full rounded-2xl shadow-2xl shadow-black/50" />
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold tracking-[0.2em] text-white/60 uppercase">
              Playlist
            </span>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl" {...truncate(playlist.name, 2)}>
              {playlist.name}
            </h1>

            {playlist.description ? (
              <p className="mt-3 max-w-xl text-sm text-white/70" {...truncate(playlist.description, 2)}>
                {playlist.description}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/70">
              {playlist.owner ? (
                <>
                  <Avatar src={playlist.owner.avatarUrl} name={playlist.owner.displayName} size="xs" />
                  <Link to={`/artist/${playlist.owner._id}`} className="font-semibold hover:underline">
                    {playlist.owner.displayName || playlist.owner.username}
                  </Link>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span>{songs.length} song{songs.length === 1 ? '' : 's'}</span>
              {totalSeconds > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{Math.round(totalSeconds / 60)} min</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>{playlist.isPublic ? 'Public' : 'Private'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!songs.length}
          onClick={() => player.playQueue(songs, 0)}
          className="btn-primary px-7 py-3"
        >
          <Icon name="play" className="h-5 w-5" filled />
          Play
        </button>

        {isOwner ? (
          <>
            <button type="button" onClick={() => setAdding((v) => !v)} className="btn-ghost px-5 py-3">
              <Icon name={adding ? 'close' : 'plus'} className="h-4 w-4" />
              {adding ? 'Close' : 'Add songs'}
            </button>
            <button type="button" onClick={startEditing} className="btn-ghost px-5 py-3">
              <Icon name="edit" className="h-4 w-4" />
              Edit
            </button>
            <button type="button" onClick={removePlaylist} className="btn-icon text-rose-400 hover:text-rose-300" aria-label="Delete playlist">
              <Icon name="trash" />
            </button>
          </>
        ) : null}
      </div>

      {/* Edit form */}
      {editing ? (
        <form onSubmit={saveEdits} className="card mt-4 animate-slide-up space-y-4 p-5">
          <div>
            <label htmlFor="edit-name" className="field-label">Name</label>
            <input id="edit-name" className="field" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label htmlFor="edit-desc" className="field-label">Description</label>
            <textarea id="edit-desc" rows={2} className="field resize-none" value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)} maxLength={500} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-muted">
            <input type="checkbox" checked={editPublic} onChange={(e) => setEditPublic(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand-500" />
            Public playlist
          </label>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary px-6 py-2.5" disabled={busy}>Save changes</button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-6 py-2.5">Cancel</button>
          </div>
        </form>
      ) : null}

      {/* Add songs */}
      {adding ? <AddSongs playlist={playlist} existing={songs} onDone={reload} /> : null}

      {/* Song list */}
      {songs.length ? (
        <div className="mt-6">
          {songs.map((song, index) => (
            <div key={song._id} className="group/song relative">
              <SongRow
                song={song}
                index={index}
                queue={songs}
                onLike={toggleLike}
                onMenu={isOwner ? () => removeSong(song._id) : undefined}
              />
              {isOwner ? (
                <div className="absolute right-28 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/song:flex">
                  <button type="button" onClick={() => moveSong(index, -1)} className="btn-icon h-7 w-7"
                    aria-label={`Move ${song.title} up`} disabled={index === 0}>
                    <Icon name="chevronUp" className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => moveSong(index, 1)} className="btn-icon h-7 w-7"
                    aria-label={`Move ${song.title} down`} disabled={index === songs.length - 1}>
                    <Icon name="chevronDown" className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-6"
          icon="music"
          title="This playlist is empty"
          message={isOwner ? 'Add some songs to get it started.' : 'The owner hasn\'t added any songs yet.'}
          action={
            isOwner ? (
              <button type="button" onClick={() => setAdding(true)} className="btn-primary px-6 py-3">
                <Icon name="plus" className="h-4 w-4" />
                Add songs
              </button>
            ) : null
          }
        />
      )}
    </div>
  )
}

/** Picker that lets the owner add songs from the whole catalogue. */
function AddSongs({ playlist, existing, onDone }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)

  const existingIds = new Set(existing.map((song) => song._id))

  useEffect(() => {
    songsService
      .list({ limit: 30, sort: 'newest' })
      .then((result) => setSongs(result.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = songs.filter(
    (song) => !existingIds.has(song._id) && song.title.toLowerCase().includes(query.toLowerCase()),
  )

  const add = async (songId) => {
    try {
      await playlistsService.addSongs(playlist._id, [songId])
      setSongs((current) => current.filter((song) => song._id !== songId))
      toast.success('Added to playlist.')
      onDone()
    } catch (error) {
      toast.error(toFriendlyError(error))
    }
  }

  return (
    <div className="card mt-4 animate-slide-up p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white">
        <Icon name="plus" className="h-4 w-4 text-brand-400" />
        Add songs
      </h2>

      <input className="field mt-4" placeholder="Filter by title…" value={query}
        onChange={(event) => setQuery(event.target.value)} aria-label="Filter songs" />

      <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
        {loading ? (
          <p className="py-4 text-center text-sm text-muted">Loading songs…</p>
        ) : visible.length ? (
          visible.map((song) => (
            <div key={song._id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5">
              <SongCover song={song} size="xs" rounded="rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{song.title}</p>
                <p className="truncate text-xs text-muted">{song.artistName}</p>
              </div>
              <button type="button" onClick={() => add(song._id)} className="btn-ghost px-3 py-1.5 text-xs">
                <Icon name="plus" className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-muted">Nothing left to add.</p>
        )}
      </div>
    </div>
  )
}
