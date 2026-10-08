import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usersService } from '../services'
import useFetch from '../hooks/useFetch'
import { useAuth } from '../context/AuthContext'
import { useSocial } from '../hooks/useSocial'
import Avatar from '../components/ui/Avatar'
import Icon from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'
import { compactNumber, cx } from '../utils/format'

const TABS = [
  { key: 'following', label: 'Following' },
  { key: 'followers', label: 'Followers' },
]

/** Artists and people the signed-in user follows, and who follows them back. */
export default function Following() {
  const { user } = useAuth()
  const { toggleFollow } = useSocial()
  const [tab, setTab] = useState('following')

  const { data, loading, error, reload } = useFetch(
    () => usersService.connections(user._id, tab, 1),
    [user?._id, tab],
  )

  const people = data?.items ?? []

  return (
    <div className="space-y-6 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">Following</h1>
        <p className="mt-1 text-sm text-muted">The people whose music you want to hear first.</p>
      </header>

      <div className="flex gap-2 border-b border-white/10" role="tablist" aria-label="Connection type">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cx('relative px-4 pb-3 pt-1 text-sm font-semibold transition-colors',
              tab === item.key ? 'text-white' : 'text-muted hover:text-soft')}>
            {item.label}
            {tab === item.key ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-brand" /> : null}
          </button>
        ))}
      </div>

      {error ? (
        <EmptyState icon="wifiOff" title="Could not load this list" message={error}
          action={<button type="button" onClick={reload} className="btn-primary px-5 py-2.5">Try again</button>} />
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="skeleton h-[76px] rounded-card" />
          ))}
        </div>
      ) : people.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <div key={person._id} className="card-hover flex items-center gap-3 p-3">
              <Link to={`/artist/${person._id}`}>
                <Avatar src={person.avatarUrl} name={person.displayName} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/artist/${person._id}`} className="block truncate text-sm font-semibold text-white hover:underline">
                  {person.displayName}
                </Link>
                <p className="truncate text-xs text-muted">
                  @{person.username} · {compactNumber(person.followerCount)} followers
                </p>
              </div>
              <button type="button" onClick={() => toggleFollow(person)}
                className={person.isFollowing ? 'btn-ghost px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}
                aria-pressed={person.isFollowing}>
                {person.isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="users"
          title={tab === 'following' ? "You're not following anyone yet" : 'No followers yet'}
          message={
            tab === 'following'
              ? 'Follow artists you like and their newest uploads will show up here.'
              : 'Share your profile and your music so people can find you.'
          }
          action={
            <Link to="/explore" className="btn-primary px-6 py-3">
              <Icon name="compass" className="h-4 w-4" />
              Discover artists
            </Link>
          }
        />
      )}
    </div>
  )
}
