import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchService } from '../services'
import { toFriendlyError } from '../services/api'
import { useToast } from '../context/ToastContext'
import { usePlayer } from '../context/PlayerContext'
import { useSocial } from '../hooks/useSocial'
import useRecentSearches from '../hooks/useRecentSearches'
import SongCover from '../components/music/SongCover'
import SongCard from '../components/music/SongCard'
import SongRow from '../components/music/SongRow'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { RowSkeleton } from '../components/ui/Skeleton'
import { cx, truncate, compactNumber } from '../utils/format'
import UploadCta from '../components/music/UploadCta'
import MusicResults from '../components/music/MusicResults'

/**
 * Tabs. "Music" is the default and is the unified cross-source catalogue.
 *
 * The remaining tabs address the LOCAL index only, which is why they do not
 * consult the catalogue endpoint at all - that keeps the expensive cross-source
 * path on a single, deliberate tab.
 */
const TABS = [
  { key: 'music', label: 'Music' },
  { key: 'all', label: 'All' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const type = params.get('type') || 'music'

  const toast = useToast()
  const player = usePlayer()
  const { toggleLike } = useSocial()
  const { items: recentSearches, remember, remove, clear } = useRecentSearches()

  const [input, setInput] = useState(q)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const boxRef = useRef(null)

  // Keep the box in sync when the URL changes (e.g. clicking a category chip).
  useEffect(() => setInput(q), [q])

  // Local-index search. Debounced, and skipped entirely on the Music tab
  // because MusicResults owns that request.
  useEffect(() => {
    const query = q.trim()
    if (!query || type === 'music') {
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

  /**
   * Runs a search. Recording it as recent happens HERE, at the point the user
   * commits to a query, rather than on every keystroke.
   *
   * A little context is snapshotted so the recent list can show artwork and an
   * artist without needing another lookup later.
   */
  const runSearch = useCallback(
    (query, context) => {
      const trimmed = String(query || '').trim()
      if (trimmed.length < 2) return
      remember(trimmed, context || {})
      const next = { q: trimmed }
      if (type !== 'all') next.type = type
      setParams(next)
      setSuggestOpen(false)
    },
    [remember, setParams, type],
  )

  const submit = useCallback(
    (event) => {
      event.preventDefault()
      const trimmed = input.trim()
      if (!trimmed) return

      // Snapshot the best available artwork/artist from the visible results so
      // the recent entry is not a bare string.
      const context = {}
      const firstSong = songs[0] || artists[0]
      if (firstSong) {
        context.artist = firstSong.artistName || firstSong.displayName
        context.artwork = firstSong.coverUrl || firstSong.avatarUrl || ''
      }
      runSearch(trimmed, context)
    },
    // songs/artists are derived below; referencing them here keeps the callback
    // reading the current render's results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, runSearch],
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
  const counts = {
    all: total,
    songs: songs.length,
    artists: artists.length,
    albums: albums.length,
    playlists: playlists.length,
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Search hero */}
      <header className="animate-fade-up">
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Search</h1>

        <div ref={boxRef} className="relative mt-4" role="search">
          <form onSubmit={submit} className="relative">
            <label htmlFor="search-input" className="sr-only">
              Search artists, songs, lyrics and more
            </label>
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
            />
            <input
              id="search-input"
              type="search"
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setSuggestOpen(true)
              }}
              onFocus={() => setSuggestOpen(true)}
              placeholder="Artists, Songs, Lyrics and More"
              autoComplete="off"
              enterKeyHint="search"
              role="combobox"
              aria-expanded={suggestOpen}
              aria-controls="search-suggestions"
              className="search-hero"
            />
            {input ? (
              <button
                type="button"
                onClick={() => {
                  setInput('')
                  setSuggestions(null)
                  setParams({})
                }}
                className="absolute top-1/2 right-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
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
              className="glass-strong absolute inset-x-0 top-full z-40 mt-2 animate-scale-in overflow-hidden rounded-2xl p-1.5 shadow-2xl"
            >
              {suggestions.songs?.slice(0, 4).map((song) => (
                <button
                  key={song._id}
                  type="button"
                  onClick={() => {
                    setInput(song.title)
                    runSearch(song.title, { artist: song.artistName, artwork: song.coverUrl })
                  }}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5"
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
                  className="flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5"
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
                  className="flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5"
                >
                  <SongCover song={{ title: playlist.name, coverUrl: playlist.coverUrl }} size="xs" rounded="rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{playlist.name}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {/* Recent searches */}
      {!q && recentSearches.length ? (
        <section className="animate-fade-up" aria-labelledby="recent-searches">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-searches" className="text-sm font-bold text-white">
              Recent searches
            </h2>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Clear
            </button>
          </div>

          <ul className="space-y-1">
            {recentSearches.map((item) => (
              <li key={item.query} className="group flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInput(item.query)
                    runSearch(item.query)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {item.artwork ? (
                    <img
                      src={item.artwork}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-muted ring-1 ring-white/10">
                      <Icon name="clock" className="h-4 w-4" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{item.query}</span>
                    {item.artist ? (
                      <span className="block truncate text-xs text-muted">{item.artist}</span>
                    ) : null}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => remove(item.query)}
                  className="touch-target opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Remove ${item.query} from recent searches`}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      {/* Results */}
      {q && type === 'music' ? (
        <MusicResults query={q} onSearched={(context) => remember(q, context)} />
      ) : !q ? (
        <EmptyState
          icon="search"
          title="What do you want to listen to?"
          message="Search for a song, an artist, a collection or a playlist across every music source MUSICA can reach."
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
                    className="card-hover flex w-[150px] shrink-0 flex-col items-center gap-2 p-4 text-center sm:w-[176px]"
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
                  <div key={album._id} className="card-hover w-[150px] shrink-0 p-3 sm:w-[176px]">
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
                  <Link key={playlist._id} to={`/playlist/${playlist._id}`} className="card-hover w-[150px] shrink-0 p-3 sm:w-[176px]">
                    <SongCover
                      song={{ title: playlist.name, coverUrl: playlist.coverUrl || playlist.songs?.[0]?.coverUrl }}
                      size="full"
                      className="aspect-square w-full"
                    />
                    <p className="mt-3 truncate text-sm font-semibold text-white">{playlist.name}</p>
                    <p className="text-xs text-muted">
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