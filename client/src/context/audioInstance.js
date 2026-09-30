/**
 * The single, persistent <audio> element that MUSICA plays through.
 *
 * Why this lives in its own module instead of inside PlayerProvider:
 *
 *   React 18 StrictMode intentionally mounts effects twice (mount -> unmount
 *   -> mount) to surface unsafe side effects. If PlayerProvider created its
 *   Audio with `new Audio()` inside a useEffect, StrictMode would build TWO
 *   elements: the first mount's cleanup nulls the ref, and the second mount
 *   builds a replacement. Depending on when the click landed, the UI could end
 *   up driving a different element than the one holding the playing buffer -
 *   which showed up as playback that starts and then cuts out, and a Pause
 *   button that appeared to do nothing.
 *
 *   Creating the element lazily, at module scope, gives exactly one Audio for
 *   the whole app, and it survives StrictMode's double mount. A module-level
 *   instance is intentional here: the music player is a page-level singleton,
 *   the same kind of thing as the Audio element the browser exposes globally.
 */

/** @type {HTMLAudioElement | null} */
let instance = null

/**
 * Returns the one shared Audio element, creating it on first use.
 * Every consumer in the app goes through here, so there is never a second one.
 */
export function getAudio() {
  if (instance) return instance
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null

  const audio = new Audio()
  // 'auto' so a click starts playing as soon as enough data is buffered
  // instead of waiting for the whole file.
  audio.preload = 'auto'
  audio.volume = 0.8
  // Don't let the browser's own media session controls confuse our own.
  audio.controls = false
  instance = audio
  return audio
}

/** Test/dev helper: forget the shared element. */
export function __resetAudioForTests() {
  if (instance) {
    instance.pause()
    instance.removeAttribute('src')
  }
  instance = null
}

export default getAudio
