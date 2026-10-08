import { usePlayer } from '../../context/PlayerContext'
import SongCover from '../music/SongCover'
import Sheet from '../ui/Sheet'
import Icon from '../ui/Icon'
import EmptyState from '../ui/EmptyState'
import { cx, truncate } from '../../utils/format'

/**
 * Playback queue panel.
 *
 * Purely a view over state the player already owns (`queue`, `index`,
 * `removeFromQueue`, `playAt`), so it introduces no new playback logic and no
 * second audio element. The queue itself is unchanged from before.
 */
export default function QueuePanel() {
  const {
    queue,
    index,
    currentSong,
    // The reducer stores this as `queueOpen`; PlayerContext spreads the whole
    // reducer state, so that is the name exposed here.
    queueOpen,
    closeQueue,
    removeFromQueue,
    clearQueue,
    playAt,
  } = usePlayer()

  // Everything before the current index is "already played", which is what makes
  // shuffling intuitive: those tracks stay in the list rather than vanishing.
  const nowPlaying = currentSong ? { song: currentSong, position: index } : null
  const upNext = queue
    .map((song, position) => ({ song, position }))
    .filter(({ position }) => position > index)

  return (
    <Sheet
      open={queueOpen}
      onClose={closeQueue}
      title="Queue"
      description={
        upNext.length
          ? `${upNext.length} track${upNext.length === 1 ? '' : 's'} up next`
          : undefined
      }
      footer={
        queue.length ? (
          <button
            type="button"
            onClick={clearQueue}
            className="btn-ghost w-full justify-center py-3 text-sm font-semibold"
          >
            Clear queue
          </button>
        ) : null
      }
    >
      {!queue.length ? (
        <EmptyState
          icon="queue"
          title="Nothing queued"
          message="Play a song and the rest of its list will appear here."
        />
      ) : (
        <div className="space-y-5">
          {nowPlaying ? (
            <section aria-labelledby="queue-now-playing">
              <h3
                id="queue-now-playing"
                className="mb-2 text-[11px] font-bold tracking-[0.16em] text-muted uppercase"
              >
                Now playing
              </h3>
              <QueueRow
                song={nowPlaying.song}
                active
                isYouTube={nowPlaying.song?.source === 'youtube' || Boolean(nowPlaying.song?.youtubeVideoId)}
                onRemove={() => removeFromQueue(nowPlaying.song._id)}
              />
            </section>
          ) : null}

          {upNext.length ? (
            <section aria-labelledby="queue-up-next">
              <h3
                id="queue-up-next"
                className="mb-2 text-[11px] font-bold tracking-[0.16em] text-muted uppercase"
              >
                Up next
              </h3>
              <ul className="space-y-1">
                {upNext.map(({ song, position }, offset) => (
                  <li key={`${song._id}-${position}`}>
                    <QueueRow
                      song={song}
                      onPlay={() => playAt(position)}
                      onRemove={() => removeFromQueue(song._id)}
                      isYouTube={song?.source === 'youtube' || Boolean(song?.youtubeVideoId)}
                      upNextPosition={offset + 1}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Sheet>
  )
}

function artistOf(song) {
  return song?.artistName || song?.artist?.displayName || 'Unknown artist'
}

function QueueRow({ song, active, onPlay, onRemove, upNextPosition, isYouTube }) {
  if (!song) return null

  return (
    <div
      className={cx(
        'group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
        active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]',
      )}
    >
      {/* Whole-row tap target for playback; the remove button is a sibling so
          nested interactive elements never occur. */}
      <button
        type="button"
        onClick={onPlay}
        disabled={!onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label={
          onPlay
            ? `Play ${song.title} by ${artistOf(song)}`
            : `${song.title} by ${artistOf(song)}`
        }
      >
        <SongCover song={song} size="sm" rounded="rounded-lg" />

        <span className="min-w-0 flex-1">
          <span
            className={cx(
              'block truncate text-sm font-semibold',
              active ? 'text-brand-300' : 'text-white',
            )}
            {...truncate(song.title, 1)}
          >
            {song.title}
          </span>
          <span className="block truncate text-xs text-muted">
            {isYouTube ? `YouTube · ${artistOf(song)}` : artistOf(song)}
          </span>
        </span>

        {upNextPosition ? (
          <span className="hidden shrink-0 text-xs tabular-nums text-muted/70 sm:block">
            {upNextPosition}
          </span>
        ) : null}
      </button>

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="touch-target opacity-60 transition-opacity group-hover:opacity-100"
          aria-label={`Remove ${song.title} from queue`}
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}