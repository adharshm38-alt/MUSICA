import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '../services'
import { toFriendlyError } from '../services/api'
import useFetch from '../hooks/useFetch'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/ui/Avatar'
import SongCover from '../components/music/SongCover'
import Icon from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'
import { compactNumber, timeAgo, cx } from '../utils/format'

const TABS = [
  { key: 'reports', label: 'Reports', icon: 'flag' },
  { key: 'songs', label: 'Uploads', icon: 'music' },
  { key: 'users', label: 'Users', icon: 'users' },
]

const STATUS_STYLES = {
  open: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  reviewing: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  dismissed: 'bg-white/10 text-muted ring-white/15',
}

export default function Admin() {
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('reports')

  const { data: statsData } = useFetch(() => adminService.stats(), [])
  const stats = statsData?.stats

  return (
    <div className="space-y-6 pb-6">
      <header className="animate-fade-up">
        <div className="flex items-center gap-2">
          <Icon name="shield" className="h-6 w-6 text-brand-400" />
          <h1 className="text-3xl font-black tracking-tight text-white">Admin dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          Signed in as {user?.displayName} ({user?.username}).
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Users', stats?.users, 'users'],
          ['Songs', stats?.songs, 'music'],
          ['Playlists', stats?.playlists, 'playlist'],
          ['Open reports', stats?.openReports, 'flag'],
          ['New users (7d)', stats?.newUsersThisWeek, 'spark'],
          ['Uploads (7d)', stats?.uploadsThisWeek, 'upload'],
        ].map(([label, value, icon]) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</span>
              <Icon name={icon} className="h-3.5 w-3.5 text-brand-400" />
            </div>
            <p className="mt-2 text-2xl font-black text-white">
              {value === undefined ? <span className="skeleton block h-7 w-12" /> : compactNumber(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10" role="tablist" aria-label="Admin sections">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cx('relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-semibold transition-colors',
              tab === item.key ? 'text-white' : 'text-muted hover:text-soft')}>
            <Icon name={item.icon} className={cx('h-4 w-4', tab === item.key && 'text-brand-400')} />
            {item.label}
            {tab === item.key ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-brand" /> : null}
          </button>
        ))}
      </div>

      {tab === 'reports' ? <ReportsTab toast={toast} /> : null}
      {tab === 'songs' ? <SongsTab toast={toast} /> : null}
      {tab === 'users' ? <UsersTab toast={toast} meId={user?._id} /> : null}
    </div>
  )
}

/* ----------------------------- Reports ----------------------------- */

function ReportsTab({ toast }) {
  const [status, setStatus] = useState('')
  const { data, loading, reload } = useFetch(
    () => adminService.reports(status ? { status } : {}),
    [status],
  )
  const reports = data?.items ?? []

  const changeStatus = async (report, next) => {
    try {
      await adminService.updateReport(report._id, { status: next })
      toast.success(`Report marked ${next}.`)
      reload()
    } catch (error) {
      toast.error(toFriendlyError(error))
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {['', 'open', 'reviewing', 'resolved', 'dismissed'].map((option) => (
          <button key={option || 'all'} type="button" onClick={() => setStatus(option)}
            className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              status === option ? 'bg-gradient-brand text-white' : 'bg-white/5 text-muted hover:bg-white/10 hover:text-white')}>
            {option || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="skeleton h-24 rounded-card" />)}</div>
      ) : reports.length ? (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report._id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ring-1',
                      STATUS_STYLES[report.status] ?? STATUS_STYLES.open)}>
                      {report.status}
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase">
                      {report.reason}
                    </span>
                    <span className="text-[11px] text-muted">{report.targetType}</span>
                  </div>

                  <p className="mt-2 text-sm font-semibold text-white">
                    {report.targetSnapshot?.title || 'Deleted item'}
                  </p>
                  {report.targetSnapshot?.ownerName ? (
                    <p className="text-xs text-muted">by {report.targetSnapshot.ownerName}</p>
                  ) : null}

                  {report.details ? (
                    <p className="mt-2 rounded-lg bg-white/[0.04] p-3 text-xs text-soft">{report.details}</p>
                  ) : null}

                  <p className="mt-2 text-[11px] text-muted">
                    Reported by @{report.reporter?.username ?? 'unknown'} · {timeAgo(report.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {report.status !== 'reviewing' ? (
                    <button type="button" onClick={() => changeStatus(report, 'reviewing')}
                      className="btn-ghost px-3 py-1.5 text-xs">Reviewing</button>
                  ) : null}
                  {report.status !== 'resolved' ? (
                    <button type="button" onClick={() => changeStatus(report, 'resolved')}
                      className="btn-primary px-3 py-1.5 text-xs">Resolve</button>
                  ) : null}
                  {report.status !== 'dismissed' ? (
                    <button type="button" onClick={() => changeStatus(report, 'dismissed')}
                      className="btn-subtle px-3 py-1.5 text-xs">Dismiss</button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="check" title="Queue is clear" message="No reports match this filter." />
      )}
    </div>
  )
}

/* ------------------------------ Songs ------------------------------ */

function SongsTab({ toast }) {
  const { data, loading, reload } = useFetch(() => adminService.songs({ limit: 30 }), [])
  const songs = data?.items ?? []

  const remove = async (song) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove "${song.title}"? The audio file will be deleted.`)) return
    try {
      await adminService.removeSong(song._id)
      toast.success('Upload removed.')
      reload()
    } catch (error) {
      toast.error(toFriendlyError(error))
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-card" />

  if (!songs.length) {
    return <EmptyState icon="music" title="No uploads yet" message="Songs will appear here as users upload them." />
  }

  return (
    <div className="space-y-2">
      {songs.map((song) => (
        <div key={song._id} className="card flex items-center gap-3 p-3">
          <SongCover song={song} size="sm" rounded="rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{song.title}</p>
            <p className="truncate text-xs text-muted">
              {song.artistName} · by @{song.uploadedBy?.username ?? 'unknown'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted/70">
              {compactNumber(song.playCount)} plays · {compactNumber(song.likeCount)} likes
              {song.rightsNote ? ' · note provided' : ''}
            </p>
          </div>
          <Link to={`/search?q=${encodeURIComponent(song.title)}`} className="btn-icon" aria-label="View song">
            <Icon name="external" className="h-4 w-4" />
          </Link>
          <button type="button" onClick={() => remove(song)}
            className="btn-icon text-rose-400 hover:text-rose-300" aria-label={`Remove ${song.title}`}>
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ Users ------------------------------ */

function UsersTab({ toast, meId }) {
  const [search, setSearch] = useState('')
  const { data, loading, reload } = useFetch(
    () => adminService.users({ search: search || undefined, limit: 30 }),
    [search],
  )
  const users = data?.items ?? []

  const setRole = async (user, role) => {
    try {
      const { message } = await adminService.setRole(user._id, role)
      toast.success(message)
      reload()
    } catch (error) {
      toast.error(toFriendlyError(error))
    }
  }

  const setStatus = async (user, isActive) => {
    try {
      const { message } = await adminService.setStatus(user._id, isActive)
      toast.success(message)
      reload()
    } catch (error) {
      toast.error(toFriendlyError(error))
    }
  }

  return (
    <div>
      <div className="relative mb-4">
        <label htmlFor="admin-user-q" className="sr-only">Search users</label>
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input id="admin-user-q" className="field pl-11" value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by username, name or email…" />
      </div>

      {loading ? (
        <div className="skeleton h-64 rounded-card" />
      ) : users.length ? (
        <div className="space-y-2">
          {users.map((person) => (
            <div key={person._id} className="card flex flex-wrap items-center gap-3 p-3">
              <Avatar src={person.avatarUrl} name={person.displayName} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {person.displayName}
                  {person._id === meId ? <span className="ml-1.5 text-xs text-muted">(you)</span> : null}
                </p>
                <p className="truncate text-xs text-muted">@{person.username} · {person.email}</p>
              </div>

              <span className={cx('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ring-1',
                person.role === 'admin' ? 'bg-brand-500/15 text-brand-300 ring-brand-500/30' : 'bg-white/10 text-muted ring-white/15')}>
                {person.role}
              </span>
              {!person.isActive ? (
                <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-bold text-rose-300 uppercase ring-1 ring-rose-500/30">
                  inactive
                </span>
              ) : null}

              <div className="flex gap-2">
                {person._id !== meId ? (
                  <>
                    <button type="button"
                      onClick={() => setRole(person, person.role === 'admin' ? 'user' : 'admin')}
                      className="btn-ghost px-3 py-1.5 text-xs">
                      {person.role === 'admin' ? 'Demote' : 'Make admin'}
                    </button>
                    <button type="button"
                      onClick={() => setStatus(person, !person.isActive)}
                      className={cx('px-3 py-1.5 text-xs', person.isActive ? 'btn-subtle text-rose-400' : 'btn-primary')}>
                      {person.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="users" title="No users found" message="Try a different search." />
      )}
    </div>
  )
}
