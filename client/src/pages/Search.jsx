import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchService } from '../services'
import { toFriendlyError } from '../services/api'
import { useToast } from '../context/ToastContext'
import { usePlayer } from '../context/PlayerContext'
import { useSocial } from '../hooks/useSocial'
import SongCard from '../components/music/SongCard'
import SongRow from '../components/music/SongRow'
import SongCover from '../components/music/SongCover'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { RowSkeleton } from '../components/ui/Skeleton'
import { compactNumber, cx, truncate } from '../utils/format'
import YouTubeResults from '../components/music/YouTubeResults'
import UploadCta from '../components/music/UploadCta'
import { youtubeService } from '../services/youtube'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'youtube', label: 'YouTube' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const type = params.get('type') || 'all'

  const toast = useToast()
  const player = usePlayer()
  const { toggleLike } = useSocial()

  const [input, setInput] = useState(q)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [ytAvailable, setYtAvailable] = useState(null)
  const boxRef = useRef(null)

  // Ask the server whether YouTube discovery is configured. The API key never
  // reaches the browser; this is just a feature flag so we can hide the tab and
  // explain why when the server has no key.
  useEffect(() => {
    let cancelled = false
    youtubeService
      .status()
      .then((data) => {
        if (!cancelled) setYtAvailable(Boolean(data?.configured))
      })
      .catch(() => {
        if (!cancelled) setYtAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the box in sync when the URL changes (e.g. clicking a genre chip).
  useEffect(() => setInput(q), [q])

  // Keep the box in sync when the URL changes (e.g. clicking a genre chip).
  useEffect(() => setInput(q), [q])

  // Debounced search so we don't hit the API on every keystroke.
  useEffect(() => {
    const query = q.trim()
    if (!query) {
      setResults(null)
      setLoading(false)
      return undefined
    }

    // The YouTube tab runs its own request (see YouTubeResults); the local
    // index is not consulted, so we skip it entirely.
    if (type === 'youtube') {
      setResults(null)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const timer = setTimeout(() => {
      searchService
        .search(query, type)
        .then(setResults)
        .catch((error) => toast.error(toFriendlyError(error)))
        .finally(() => setLoading(false))
    }, 320)

    return () => clearTimeout(timer)
  }, [q, type, toast])

  // Type-ahead suggestions (separate, lighter endpoint).
  useEffect(() => {
    const term = input.trim()
    if (term.length < 2) {
      setSuggestions(null)
      return undefined
    }
    const timer = setTimeout(() => {
      searchService.suggest(term).then(setSuggestions).catch(() => setSuggestions(null))
    }, 220)
    return () => clearTimeout(timer)
  }, [input])

  // Close the suggestion dropdown when clicking outside.
  useEffect(() => {
    if (!suggestOpen) return undefined
    const onClickAway = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setSuggestOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [suggestOpen])

  const submit = useCallback(
    (event) => {
      event.preventDefault()
      const next = { q: input.trim() }
      if (type !== 'all') next.type = type
      setParams(next)
    },
    [input, type, setParams],
  )

  const setType = (next) => {
    const params2 = {}
    if (q) params2.q = q
    if (next !== 'all') params2.type = next
    setParams(params2)
  }

  const playFrom = (queue) => (song) =>
    player.playQueue(queue, Math.max(0, queue.findIndex((s) => s._id === song._id)))

  const songs = results?.songs ?? []
  const artists = results?.artists ?? []
  const albums = results?.albums ?? []
  const playlists = results?.playlists ?? []
  const total = songs.length + artists.length + albums.length + playlists.length

  const counts = { all: total, songs: songs.length, artists: artists.length, albums: albums.length, playlists: playlists.length }

  return (
    <div className="space-y-6 pb-6">
      {/* Search box */}
      <header className="animate-fade-up">
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Search</h1>

        <div ref={boxRef} className="relative mt-5" role="search">
          <form onSubmit={submit} className="relative">
            <label htmlFor="search-input" className="sr-only">
              Search songs, artists, albums and playlists
            </label>
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              id="search-input"
              type="search"
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setSuggestOpen(true)
              }}
              onFocus={() => setSuggestOpen(true)}
              placeholder="Songs, artists, albums or playlists\u2026"
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestOpen}
              aria-controls="search-suggestions"
              className="field py-3.5 pl-12 pr-12 text-base"
            />
            {input ? (
              <button
                type="button"
                onClick={() => {
                  setInput('')
                  setSuggestions(null)
                  setParams({})
                }}
                className="btn-icon absolute right-2 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            ) : null}
          </form>

          {suggestOpen && suggestions &&
          (suggestions.songs?.length || suggestions.artists?.length || suggestions.playlists?.length) ? (
            <div
              id="search-suggestions"
              className="glass-strong absolute inset-x-0 top-full z-40 mt-2 animate-scale-in overflow-hidden rounded-xl p-1.5 shadow-2xl"
            >
              {suggestions.songs?.slice(0, 4).map((song) => (
                <button
                  key={song._id}
                  type="button"
                  onClick={() => {
                    setInput(song.title)
                    setSuggestOpen(false)
                    setParams({ q: song.title })
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/5"
                >
                  <SongCover song={song} size="xs" rounded="rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{song.title}</span>
                    <span className="block truncate text-xs text-muted">{song.artistName}</span>
                  </span>
                </button>
              ))}

              {suggestions.artists?.slice(0, 3).map((artist) => (
                <Link
                  key={artist._id}
                  to={`/artist/${artist._id}`}
                  onClick={() => setSuggestOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                >
                  <Avatar src={artist.avatarUrl} name={artist.displayName} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{artist.displayName}</span>
                    <span className="block truncate text-xs text-muted">@{artist.username}</span>
                  </span>
                  <span className="text-[10px] font-semibold text-muted uppercase">Artist</span>
                </Link>
              ))}

              {suggestions.playlists?.slice(0, 3).map((playlist) => (
                <Link
                  key={playlist._id}
                  to={`/playlist/${playlist._id}`}
                  onClick={() => setSuggestOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                >
                  <SongCover song={{ title: playlist.name, coverUrl: playlist.coverUrl }} size="xs" rounded="rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{playlist.name}</span>
                  <span className="text-[10px] font-semibold text-muted uppercase">Playlist</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {/* Tabs */}
      {q ? (
        <div className="rail border-b border-white/10" role="tablist" aria-label="Search filters">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={type === tab.key}
              onClick={() => setType(tab.key)}
              className={cx(
                'relative shrink-0 px-4 pb-3 pt-1 text-sm font-semibold transition-colors',
                type === tab.key ? 'text-white' : 'text-muted hover:text-soft',
              )}
            >
              {tab.label}
              {counts[tab.key] ? (
                <span className="ml-1.5 text-xs text-muted">{counts[tab.key]}</span>
              ) : null}
              {type === tab.key ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-brand" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Not-configured notice. The API key lives server-side; when it is absent
          we say so plainly instead of failing on a generic network error. */}
      {q && type === 'youtube' && ytAvailable === false ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-panel border border-white/10 bg-white/[0.03] p-4"
        >
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">YouTube discovery is not configured</p>
            <p className="mt-1 text-xs text-muted">
              This server has no <code className="text-soft">YOUTUBE_API_KEY</code> set, so YouTube
              search and playback are unavailable. Add the key to{' '}
              <code className="text-soft">server/.env</code> and restart the API. The key stays
              server-side and is never sent to the browser.
            </p>
          </div>
        </div>
      ) : null}

      {/* Results */}
      {q && type === 'youtube' ? (
        ytAvailable === false ? null : <YouTubeResults query={q} />
      ) : !q ? (
        <EmptyState
          icon="search"
          title="What do you want to listen to?"
          message="Search for a song, an artist, an album or a playlist, or switch to the YouTube tab to discover music videos."
        />
      ) : loading && !results ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <RowSkeleton />
          <RowSkeleton />
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon="search"
          title={`No results for "${q}"`}
          message="Try a different spelling, or search for an artist name instead."
          action={
            <UploadCta className="btn-ghost px-5 py-2.5">
              <Icon name="upload" className="h-4 w-4" />
              Upload this song
            </UploadCta>
          }
        />
      ) : (
        <div className="space-y-8">
          {type === 'all' && songs.length ? (
            <SearchBlock title="Songs" icon="music">
              <div className="hidden sm:block">
                {songs.slice(0, 5).map((song, index) => (
                  <SongRow key={song._id} song={song} index={index} queue={songs} onLike={toggleLike} />
                ))}
              </div>
              <div className="rail sm:hidden">
                {songs.slice(0, 6).map((song) => (
                  <SongCard key={song._id} song={song} onPlay={playFrom(songs)} onLike={toggleLike} contextQueue={songs} />
                ))}
              </div>
            </SearchBlock>
          ) : null}

          {type === 'songs' && songs.length ? (
            <SearchBlock title="Songs" icon="music">
              {songs.map((song, index) => (
                <SongRow key={song._id} song={song} index={index} queue={songs} onLike={toggleLike} showAlbum />
              ))}
            </SearchBlock>
          ) : null}

          {(type === 'all' || type === 'artists') && artists.length ? (
            <SearchBlock title="Artists" icon="users">
              <div className="rail">
                {artists.map((artist) => (
                  <Link
                    key={artist._id}
                    to={`/artist/${artist._id}`}
                    className="card-hover flex w-[172px] shrink-0 flex-col items-center gap-2 p-4 text-center sm:w-[200px]"
                  >
                    <Avatar src={artist.avatarUrl} name={artist.displayName} size="lg" />
                    <p className="mt-1 w-full truncate text-sm font-semibold text-white">{artist.displayName}</p>
                    <p className="text-xs text-muted">{compactNumber(artist.followerCount)} followers</p>
                  </Link>
                ))}
              </div>
            </SearchBlock>
          ) : null}

          {(type === 'all' || type === 'albums') && albums.length ? (
            <SearchBlock title="Albums" icon="album">
              <div className="rail">
                {albums.map((album) => (
                  <div key={album._id} className="card-hover w-[172px] shrink-0 p-3 sm:w-[200px]">
                    <SongCover song={{ title: album.name, coverUrl: album.coverUrl }} size="full" className="aspect-square w-full" />
                    <p className="mt-3 truncate text-sm font-semibold text-white" {...truncate(album.name, 1)}>
                      {album.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {album.artistName} · {album.songCount} song{album.songCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </div>
            </SearchBlock>
          ) : null}

          {(type === 'all' || type === 'playlists') && playlists.length ? (
            <SearchBlock title="Playlists" icon="playlist">
              <div className="rail">
                {playlists.map((playlist) => (
                  <Link key={playlist._id} to={`/playlist/${playlist._id}`} className="card-hover w-[172px] shrink-0 p-3 sm:w-[200px]">
                    <SongCover
                      song={{ title: playlist.name, coverUrl: playlist.coverUrl || playlist.songs?.[0]?.coverUrl }}
                      size="full"
                      className="aspect-square w-full"
                    />
                    <p className="mt-3 truncate text-sm font-semibold text-white">{playlist.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {playlist.songs?.length ?? 0} song{(playlist.songs?.length ?? 0) === 1 ? '' : 's'}
                    </p>
                  </Link>
                ))}
              </div>
            </SearchBlock>
          ) : null}
        </div>
      )}
    </div>
  )
}

function SearchBlock({ title, icon, children }) {
  return (
    <section className="animate-fade-up">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-white">
        <Icon name={icon} className="h-4 w-4 text-brand-400" />
        {title}
      </h2>
      {children}
    </section>
  )
}
