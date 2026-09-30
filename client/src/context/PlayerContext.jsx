import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import api, { TOKEN_KEY, API_ORIGIN } from '../services/api'
import { getAudio } from './audioInstance'
import { ACTIONS, REPEAT_MODES, initialState, reducer } from './playerReducer'

const PlayerContext = createContext(null)

/**
 * play() rejects for a few very different reasons; treat them differently so a
 * transient autoplay-policy refusal never looks like a broken file.
 */
function handlePlayRejection(error, url, dispatch) {
  const name = error?.name

  // The browser refused because there was no user gesture (e.g. an autoplay
  // attempt). The user can simply press play; not an error worth shouting about.
  if (name === 'NotAllowedError') {
    dispatch({ type: ACTIONS.SET_PLAYING, value: false })
    return
  }

  // The file genuinely could not be decoded or fetched.
  console.error('[player] audio could not be played:', url, name, error)
  dispatch({ type: ACTIONS.SET_PLAYING, value: false })
}

/**
 * Turns a stored media path into a URL the browser can load directly.
 *
 * The database stores paths like "/uploads/audio/x.mp3". In development that
 * resolves against the Vite dev server (which proxies /uploads to Express), but
 * in production the front end is served from a different host than the API, so
 * a relative path would 404. Resolving it against the API base URL works in
 * both cases.
 *
 * @param {string} storedPath absolute URL, absolute path, or "/uploads/..." path
 * @param {string} apiBaseUrl base URL of the REST API, e.g. http://localhost:5000/api
 */
export function absoluteSrc(storedPath, apiBaseUrl) {
  if (!storedPath) return ''
  // Already a full URL (http://, https://, blob:, data:) - leave it alone.
  if (/^(https?:|blob:|data:)/i.test(storedPath)) return storedPath

  const path = storedPath.startsWith('/') ? storedPath : `/${storedPath}`

  // No API configured (e.g. served from the same origin behind a proxy).
  if (!apiBaseUrl) return path

  try {
    const origin = new URL(apiBaseUrl).origin
    return `${origin}${path}`
  } catch {
    return path
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  // ---- The audio element ----
  // getAudio() returns one module-level element shared by the whole app, so
  // StrictMode's mount/unmount/mount cycle cannot produce competing elements.
  // `audioRef` is just a stable handle onto it for this component.
  const audioRef = useRef(null)
  if (audioRef.current === null) {
    audioRef.current = getAudio()
  }
  const audio = audioRef.current
  const volumeBeforeMute = useRef(0.8)

  const currentSong = state.index >= 0 ? state.queue[state.index] ?? null : null

  // ---- Tell the backend about plays (drives trending + history) ----
  const lastRecordedRef = useRef(null)

  useEffect(() => {
    const songId = currentSong?._id
    if (!songId || songId === lastRecordedRef.current) return
    lastRecordedRef.current = songId
    api.post(`/songs/${songId}/play`).catch(() => {
      // Play tracking must never interrupt listening.
    })
  }, [currentSong?._id])

  // ---- Seed the shared element's initial settings ----
  // Deliberately NO cleanup that pauses or clears the source: the element is
  // shared and long-lived, so tearing it down on unmount is what used to cut
  // playback off when a parent re-rendered.
  useEffect(() => {
    if (!audio) return
    audio.volume = initialState.volume
  }, [audio])

  // Tracks whether WE want audio playing, independent of what the element
  // currently reports. Native `pause`/`emptied` events that load() fires are
  // reconciled against this instead of blindly resetting the UI - that blind
  // reset is what made playback cut out a moment after it started.
  const wantPlayingRef = useRef(false)
  wantPlayingRef.current = state.isPlaying

  // The URL currently assigned to the element, so a song change is detected
  // reliably.
  const loadedUrlRef = useRef(null)

  // Monotonic token: async callbacks belonging to an older source are ignored.
  const sourceTokenRef = useRef(0)

  // ---- Keep the audio element in sync with the current song + play state ----
  useEffect(() => {
    if (!audio) return undefined

    const url = absoluteSrc(currentSong?.audioUrl, API_ORIGIN)

    // ---- 1. Song changed: replace the source, THEN play. ----
    if (url !== loadedUrlRef.current) {
      loadedUrlRef.current = url
      sourceTokenRef.current += 1
      const token = sourceTokenRef.current

      if (!url) {
        audio.removeAttribute('src')
        audio.load()
      } else {
        // load() must run after the new src is assigned and BEFORE play(),
        // because load() aborts any playback that is in flight.
        audio.src = url
        audio.load()
        // Start the new track from the beginning rather than resuming.
        audio.currentTime = 0
      }

      if (!wantPlayingRef.current) return undefined

      // The new source needs a moment before it can play. Waiting for
      // 'canplay' also keeps the call inside the user-activation window that
      // the click established, which is what browsers require for audible
      // autoplay.
      const start = () => {
        if (sourceTokenRef.current !== token) return
        audio.play().catch((error) => {
          if (sourceTokenRef.current !== token) return
          handlePlayRejection(error, url, dispatch)
        })
      }

      if (audio.readyState >= 3 /* HAVE_FUTURE_DATA */) {
        start()
        return undefined
      }
      audio.addEventListener('canplay', start, { once: true })
      return () => audio.removeEventListener('canplay', start)
    }

    // ---- 2. Same song: just apply the transport state (play / pause). ----
    if (!state.isPlaying) {
      audio.pause()
      return undefined
    }
    if (!url) return undefined

    const request = audio.play()
    if (request?.catch) {
      request.catch((error) => handlePlayRejection(error, url, dispatch))
    }
    return undefined
  }, [audio, state.isPlaying, currentSong?._id, currentSong?.audioUrl])

  // ---- Volume ----
  useEffect(() => {
    if (!audio) return
    audio.volume = state.isMuted ? 0 : state.volume
  }, [audio, state.volume, state.isMuted])

  // ---- Wire native audio events into our state ----
  useEffect(() => {
    if (!audio) return undefined

    const onTime = () => dispatch({ type: ACTIONS.SET_PROGRESS, value: audio.currentTime })
    const onMeta = () => {
      // Some browsers report Infinity until the user seeks; fall back to 0.
      const d = audio.duration
      dispatch({
        type: ACTIONS.SET_DURATION,
        value: Number.isFinite(d) ? d : 0,
      })
    }
    const onEnd = () => dispatch({ type: ACTIONS.ENDED })
    const onPlay = () => dispatch({ type: ACTIONS.SET_PLAYING, value: true })

    // load() emits `pause` while it restarts the pipeline. That is not the user
    // pressing pause, so reconcile against our intent instead of stomping the
    // play button - this is exactly what made tracks stop a moment after they
    // started.
    const onPause = () => {
      if (wantPlayingRef.current) return
      dispatch({ type: ACTIONS.SET_PLAYING, value: false })
    }

    const onError = () => {
      console.error('[player] audio element reported an error for', audio.currentSrc || audio.src)
      dispatch({ type: ACTIONS.SET_PLAYING, value: false })
    }

    const onWaiting = () => {
      // Buffering stall: keep playing state as-is, the browser resumes itself.
    }
    const onStalled = onWaiting

    const onSeeking = () =>
      dispatch({ type: ACTIONS.SET_PROGRESS, value: audio.currentTime })

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('seeking', onSeeking)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('seeking', onSeeking)
    }
  }, [audio, dispatch])

  // ---- Media Session (lock screen / hardware media keys) ----
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return
    navigator.mediaSession.metadata = currentSong
      ? new window.MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artistName || 'Unknown artist',
          album: currentSong.album || 'MUSICA',
          artwork: currentSong.coverUrl
            ? [{ src: currentSong.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        })
      : null
  }, [currentSong])

  // ---- Public actions -------------------------------------------------
  const playQueue = useCallback((songs, startIndex = 0) => {
    if (!songs?.length) return
    dispatch({ type: ACTIONS.SET_QUEUE, songs, startIndex, autoplay: true })
  }, [])

  const playSong = useCallback((song, contextQueue = []) => {
    // If clicked from a list, play the whole list starting at that song.
    const list = contextQueue?.length ? contextQueue : [song]
    const index = Math.max(
      0,
      list.findIndex((item) => item._id === song._id),
    )
    dispatch({ type: ACTIONS.SET_QUEUE, songs: list, startIndex: index, autoplay: true })
  }, [])

  const toggle = useCallback(() => dispatch({ type: ACTIONS.TOGGLE }), [])
  const next = useCallback(() => dispatch({ type: ACTIONS.NEXT }), [])
  const prev = useCallback(() => dispatch({ type: ACTIONS.PREV }), [])

  const seek = useCallback((seconds) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    dispatch({ type: ACTIONS.SET_PROGRESS, value: seconds })
  }, [])

  const setVolume = useCallback((value) => {
    dispatch({ type: ACTIONS.SET_VOLUME, value })
  }, [])

  const toggleMute = useCallback(() => {
    if (!state.isMuted && state.volume > 0) volumeBeforeMute.current = state.volume
    dispatch({ type: ACTIONS.SET_VOLUME, value: state.isMuted ? volumeBeforeMute.current || 0.8 : 0 })
  }, [state.isMuted, state.volume])

  const toggleShuffle = useCallback(() => dispatch({ type: ACTIONS.TOGGLE_SHUFFLE }), [])

  const cycleRepeat = useCallback(() => {
    dispatch({ type: ACTIONS.CYCLE_REPEAT })
  }, [])

  const enqueue = useCallback((songs) => dispatch({ type: ACTIONS.ENQUEUE, songs }), [])
  const removeFromQueue = useCallback((index) => dispatch({ type: ACTIONS.REMOVE_FROM_QUEUE, index }), [])
  const clearQueue = useCallback(() => dispatch({ type: ACTIONS.CLEAR_QUEUE }), [])
  const playAt = useCallback((index) => dispatch({ type: ACTIONS.PLAY_AT, index }), [])

  // Set by useSocial while a like/unlike request is in flight, so this
  // reconciliation does not clobber the optimistic heart the user just toggled.
  const likePendingRef = useRef(false)

  // Track whether the *current* song is liked so the heart can render correctly.
  //
  // This always re-checks with the server for the active song. Trusting a cached
  // `isLiked` flag on the queued object is unreliable: the queue can hold a
  // song that was fetched before the like happened (or a different copy of the
  // same song), so the heart would show "unliked" after a reload even though
  // the database has the like. The request is cheap and only runs for the one
  // song currently loaded in the player.
  useEffect(() => {
    const songId = currentSong?._id
    if (!songId) {
      dispatch({ type: ACTIONS.SET_LIKED, value: null })
      return undefined
    }

    let cancelled = false
    api
      .get(`/songs/${songId}`)
      .then(({ data }) => {
        if (cancelled) return
        // A like toggle is in flight; its own update is authoritative.
        if (likePendingRef.current) return
        const song = data.data.song
        const liked = Boolean(song?.isLiked)
        // Also refresh the counter shown in the player / lists.
        if (song && currentSong) {
          currentSong.likeCount = song.likeCount
          currentSong.isLiked = liked
        }
        dispatch({ type: ACTIONS.SET_LIKED, value: liked ? songId : null })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentSong?._id])

  const value = useMemo(
    () => ({
      ...state,
      currentSong,
      isLiked: Boolean(state.likedSongId && state.likedSongId === currentSong?._id),
      playQueue,
      playSong,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      enqueue,
      removeFromQueue,
      clearQueue,
      playAt,
      openQueue: () => dispatch({ type: ACTIONS.SET_QUEUE_OPEN, value: true }),
      closeQueue: () => dispatch({ type: ACTIONS.SET_QUEUE_OPEN, value: false }),
      openFullPlayer: () => dispatch({ type: ACTIONS.SET_FULL_PLAYER, value: true }),
      closeFullPlayer: () => dispatch({ type: ACTIONS.SET_FULL_PLAYER, value: false }),
      setLiked: (value2) => dispatch({ type: ACTIONS.SET_LIKED, value: value2 }),
      // Lets useSocial mark "a like request is running" so the reconciliation
      // effect above does not overwrite the heart the user just toggled.
      setLikePending: (value2) => {
        likePendingRef.current = Boolean(value2)
      },
    }),
    [state, currentSong, playQueue, playSong, toggle, next, prev, seek, setVolume, toggleMute, toggleShuffle, cycleRepeat, enqueue, removeFromQueue, clearQueue, playAt],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return context
}
