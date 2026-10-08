import { useState } from 'react'
import { Link } from 'react-router-dom'
import { songsService } from '../services'
import { toFriendlyError } from '../services/api'
import { useToast } from '../context/ToastContext'
import ReportDialog from '../components/ui/ReportDialog'
import SongCover from '../components/music/SongCover'
import Icon from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'

/** Standalone page for reporting a song you can't reach from anywhere else. */
export default function Report() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState(null)

  const search = async (event) => {
    event.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setSearched(true)
    try {
      const { songs } = await songsService.list({ limit: 12 })
      const q = query.toLowerCase()
      setResults(
        (songs ?? []).filter(
          (song) =>
            song.title.toLowerCase().includes(q) || song.artistName.toLowerCase().includes(q),
        ),
      )
    } catch (error) {
      toast.error(toFriendlyError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">Report content</h1>
        <p className="mt-1 text-sm text-muted">
          Found music or a profile that shouldn't be here? Let our moderators know.
        </p>
      </header>

      <div className="card flex items-start gap-3 p-4 animate-fade-up">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
        <p className="text-xs leading-relaxed text-muted">
          Reports are anonymous to the person being reported. We review copyright concerns first and
          remove uploads that infringe a rights holder's work.
        </p>
      </div>

      <form onSubmit={search} className="relative animate-fade-up">
        <label htmlFor="report-q" className="sr-only">Search for the song to report</label>
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input id="report-q" className="field py-3.5 pl-12" value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a song or artist…" />
      </form>

      {busy ? (
        <p className="text-center text-sm text-muted">Searching…</p>
      ) : results.length ? (
        <div className="space-y-2">
          {results.map((song) => (
            <div key={song._id} className="card flex items-center gap-3 p-3">
              <SongCover song={song} size="sm" rounded="rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{song.title}</p>
                <p className="truncate text-xs text-muted">{song.artistName}</p>
              </div>
              <button type="button" onClick={() => setTarget(song)} className="btn-ghost px-4 py-2 text-xs">
                <Icon name="flag" className="h-3.5 w-3.5" />
                Report
              </button>
            </div>
          ))}
        </div>
      ) : searched ? (
        <EmptyState icon="search" title="No matches" message="Try a different title or artist name." />
      ) : null}

      {target ? (
        <ReportDialog
          targetType="song"
          targetId={target._id}
          targetLabel={`${target.title} — ${target.artistName}`}
          onClose={() => setTarget(null)}
        />
      ) : null}

      <p className="pt-2 text-center text-xs text-muted/70">
        You can also report any artist from their{' '}
        <Link to="/explore" className="text-brand-400 hover:underline">profile page</Link>.
      </p>
    </div>
  )
}
