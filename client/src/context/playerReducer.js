import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'

const PlayerContext = createContext(null)

/** How a queue ended when we ran off the end of the list. */
export const REPEAT_MODES = { OFF: 'off', ALL: 'all', ONE: 'one' }

export const ACTIONS = {
  SET_QUEUE: 'setQueue',
  PLAY_AT: 'playAt',
  TOGGLE: 'toggle',
  NEXT: 'next',
  PREV: 'prev',
  ENDED: 'ended',
  SET_PLAYING: 'setPlaying',
  SET_PROGRESS: 'setProgress',
  SET_DURATION: 'setDuration',
  SET_VOLUME: 'setVolume',
  TOGGLE_SHUFFLE: 'toggleShuffle',
  CYCLE_REPEAT: 'cycleRepeat',
  SET_LIKED: 'setLiked',
  ENQUEUE: 'enqueue',
  REMOVE_FROM_QUEUE: 'removeFromQueue',
  CLEAR_QUEUE: 'clearQueue',
  SET_QUEUE_OPEN: 'setQueueOpen',
  SET_FULL_PLAYER: 'setFullPlayer',
}

export const initialState = {
  queue: [],
  index: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  shuffle: false,
  repeat: REPEAT_MODES.OFF,
  likedSongId: null,
  queueOpen: false,
  fullPlayerOpen: false,
}

export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_QUEUE: {
      const { songs, startIndex = 0, autoplay = true } = action
      if (!songs?.length) return state
      const index = Math.max(0, Math.min(startIndex, songs.length - 1))
      return {
        ...state,
        queue: songs,
        index,
        currentTime: 0,
        duration: 0,
        isPlaying: autoplay,
      }
    }

    case ACTIONS.PLAY_AT: {
      const index = action.index
      if (index < 0 || index >= state.queue.length) return state
      return { ...state, index, currentTime: 0, duration: 0, isPlaying: true }
    }

    case ACTIONS.TOGGLE:
      // Nothing loaded yet -> can't toggle.
      if (state.index < 0) return state
      return { ...state, isPlaying: !state.isPlaying }

    case ACTIONS.NEXT: {
      if (!state.queue.length) return state
      // Shuffle picks a random *different* track.
      if (state.shuffle && state.queue.length > 1) {
        let next = state.index
        while (next === state.index) next = Math.floor(Math.random() * state.queue.length)
        return { ...state, index: next, currentTime: 0, duration: 0, isPlaying: true }
      }
      if (state.index < state.queue.length - 1) {
        return {
          ...state,
          index: state.index + 1,
          currentTime: 0,
          duration: 0,
          isPlaying: true,
        }
      }
      // End of queue.
      if (state.repeat === REPEAT_MODES.ALL && state.queue.length) {
        return { ...state, index: 0, currentTime: 0, duration: 0, isPlaying: true }
      }
      return { ...state, isPlaying: false, currentTime: 0 }
    }

    case ACTIONS.PREV: {
      if (!state.queue.length) return state
      // Common UX: restart the track if we're more than 3s in.
      if (state.currentTime > 3) {
        return { ...state, currentTime: 0 }
      }
      if (state.index > 0) {
        return {
          ...state,
          index: state.index - 1,
          currentTime: 0,
          duration: 0,
          isPlaying: true,
        }
      }
      if (state.repeat === REPEAT_MODES.ALL && state.queue.length) {
        return {
          ...state,
          index: state.queue.length - 1,
          currentTime: 0,
          duration: 0,
          isPlaying: true,
        }
      }
      return { ...state, currentTime: 0 }
    }

    case ACTIONS.ENDED:
      if (state.repeat === REPEAT_MODES.ONE) {
        return { ...state, currentTime: 0, isPlaying: true }
      }
      return reducer(state, { type: ACTIONS.NEXT })

    case ACTIONS.SET_PLAYING:
      return { ...state, isPlaying: Boolean(action.value) }

    case ACTIONS.SET_PROGRESS:
      return { ...state, currentTime: action.value }

    case ACTIONS.SET_DURATION:
      return {
        ...state,
        duration: Number.isFinite(action.value) ? action.value : 0,
      }

    case ACTIONS.SET_VOLUME: {
      const volume = Math.max(0, Math.min(1, action.value))
      return { ...state, volume, isMuted: volume === 0 }
    }

    case ACTIONS.TOGGLE_SHUFFLE:
      return { ...state, shuffle: !state.shuffle }

    case ACTIONS.CYCLE_REPEAT: {
      const order = [REPEAT_MODES.OFF, REPEAT_MODES.ALL, REPEAT_MODES.ONE]
      const nextMode = order[(order.indexOf(state.repeat) + 1) % order.length]
      return { ...state, repeat: nextMode }
    }

    case ACTIONS.SET_LIKED:
      return { ...state, likedSongId: action.value }

    case ACTIONS.ENQUEUE: {
      const songs = action.songs ?? [action.song]
      return { ...state, queue: [...state.queue, ...songs] }
    }

    case ACTIONS.REMOVE_FROM_QUEUE: {
      const removedIndex = state.index
      const queue = state.queue.filter((_, i) => i !== action.index)
      let index = state.index
      if (action.index < state.index) index -= 1
      if (action.index === state.index) index = Math.min(index, queue.length - 1)
      return { ...state, queue, index, wasRemovedCurrent: removedIndex === state.index }
    }

    case ACTIONS.CLEAR_QUEUE:
      return { ...state, queue: [], index: -1, isPlaying: false, currentTime: 0 }

    case ACTIONS.SET_QUEUE_OPEN:
      return { ...state, queueOpen: Boolean(action.value) }

    case ACTIONS.SET_FULL_PLAYER:
      return { ...state, fullPlayerOpen: Boolean(action.value) }

    default:
      return state
  }
}
