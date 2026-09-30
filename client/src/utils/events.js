/**
 * Tiny event bus so non-React code (the <audio> element) can tell React
 * components that something happened, without prop-drilling.
 *
 * The player owns one real <audio> element and listens to these events.
 */
const listeners = new Map()

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(handler)
  return () => off(event, handler)
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler)
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload)
    } catch (error) {
      console.error(`[events] handler for "${event}" failed`, error)
    }
  })
}

export const EVENTS = {
  PLAYBACK_ERROR: 'playback:error',
  REQUEST_PLAY: 'playback:request-play',
  REQUEST_TOGGLE: 'playback:request-toggle',
  REQUEST_NEXT: 'playback:request-next',
  REQUEST_PREV: 'playback:request-prev',
  REQUEST_SEEK: 'playback:request-seek',
  REQUEST_VOLUME: 'playback:request-volume',
  REQUEST_SHUFFLE: 'playback:request-shuffle',
  REQUEST_REPEAT: 'playback:request-repeat',
  OPEN_QUEUE: 'player:open-queue',
}
