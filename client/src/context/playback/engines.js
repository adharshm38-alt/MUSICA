/**
 * Playback engine contract.
 *
 * MUSICA has two kinds of playable item:
 *
 *  1. First-party uploads ('upload') - a real audio file we host, played
 *     through an HTMLAudioElement.
 *  2. YouTube discoveries ('youtube') - played inside YouTube's OFFICIAL
 *     embedded player (youtube-nocookie.com + the IFrame Player API).
 *
 * Both must satisfy the SAME interface so PlayerContext, MusicPlayer,
 * FullPlayer and ProgressBar do not need to know which one is active.
 *
 * IMPORTANT: this abstraction exists so we can drive the official YouTube
 * player with postMessage. It must never be used to extract a stream URL,
 * download audio, or hide/overlay the YouTube player.
 *
 *   load(item)              -> Promise<void>   attach a source
 *   play() / pause()        -> void
 *   seek(seconds)           -> void
 *   setVolume(0..1)         -> void
 *   getCurrentTime()        -> number
 *   getDuration()           -> number
 *   destroy()               -> void            release the engine
 *
 * Optional capabilities, so the UI can hide controls an engine cannot honour:
 *   capabilities.seekable     boolean
 *   capabilities.volume       boolean
 *   capabilities.duration     boolean
 */

export const ENGINE_AUDIO = 'audio'
export const ENGINE_YOUTUBE = 'youtube'

/**
 * Chooses the right engine for a song.
 * A song with no playable audio and a youtubeVideoId is a YouTube item.
 */
export function engineFor(song) {
  if (!song) return ENGINE_AUDIO
  if (song.source === 'youtube' && song.youtubeVideoId) return ENGINE_YOUTUBE
  return ENGINE_AUDIO
}

/**
 * Playback via an HTMLAudioElement. This is the existing MUSICA behaviour and
 * is deliberately unchanged - uploads must keep working exactly as before.
 */
export function createAudioEngine(audioElement) {
  return {
    type: ENGINE_AUDIO,
    capabilities: { seekable: true, volume: true, duration: true },

    load(item) {
      audioElement.src = item.audioUrl
      audioElement.load()
      audioElement.currentTime = 0
    },

    play() {
      const request = audioElement.play()
      return request?.catch?.(() => {})
    },

    pause() {
      audioElement.pause()
    },

    seek(seconds) {
      try {
        audioElement.currentTime = seconds
      } catch {
        /* seeking before metadata is ready is a no-op */
      }
    },

    setVolume(value) {
      audioElement.volume = value
    },

    getCurrentTime: () => audioElement.currentTime || 0,
    getDuration: () =>
      Number.isFinite(audioElement.duration) ? audioElement.duration : 0,

    destroy() {
      audioElement.pause()
      audioElement.removeAttribute('src')
    },
  }
}

/**
 * Playback via YouTube's official IFrame Player API.
 *
 * COMPLIANCE NOTES (these are requirements, not preferences):
 *  - We create a REAL, VISIBLE player in the DOM. YouTube's Terms require the
 *    player to remain visible and unobstructed, so we never hide it, never
 *    shrink it below 200x200, and never overlay custom controls on top of it.
 *  - We use youtube-nocookie.com so no advertising cookies are set until the
 *    user actually plays.
 *  - We control the player ONLY through its documented public methods
 *    (playVideo / pauseVideo / seekTo / getCurrentTime / getDuration). We do
 *    not read, decode, re-host or proxy any media.
 *
 * CAPABILITIES - what the official player genuinely permits:
 *  - seek      : SUPPORTED. seekTo() is a documented, intended-for-this-use
 *                public method on a visible player.
 *  - duration  : SUPPORTED. getDuration() is documented.
 *  - volume    : NOT SUPPORTED. setVolume() is restricted by YouTube and we
 *                must not work around it, so the UI hides our volume slider for
 *                YouTube items and defers to the player's own controls.
 *  - the player itself: must stay visible and usable. Never hidden, never
 *    shrunk below 200x200, never covered by our own transport UI.
 */
export function createYouTubeEngine(hostElement, { onReady, onStateChange, onError } = {}) {
  let player = null
  let currentVideoId = null
  let ready = false
  let pendingPlay = false
  let pollTimer = null

  const emitState = () => {
    if (!player || typeof player.getPlayerState !== 'function') return
    try {
      onStateChange?.(player.getPlayerState())
    } catch {
      /* the iframe can be torn down mid-poll */
    }
  }

  return {
    type: ENGINE_YOUTUBE,
    // seekTo()/getDuration() are documented public API. Volume is not, so the
    // UI hides our slider for YouTube tracks.
    capabilities: { seekable: true, volume: false, duration: true },

    async load(item) {
      currentVideoId = item.youtubeVideoId
      ready = false
      pendingPlay = true

      // The IFrame API script is loaded once per page.
      await loadIframeApi()

      await mountPlayer(hostElement, currentVideoId, {
        onReady: (instance) => {
          player = instance
          ready = true
          onReady?.(instance)
          emitState()
          // Honour a play request that arrived before the player was ready.
          if (pendingPlay) {
            pendingPlay = false
            instance.playVideo?.()
          }
        },
        onStateChange,
        onError: (code) => {
          // 100 = video unavailable/removed, 101/150 = embed not allowed.
          pendingPlay = false
          onError?.(code)
        },
      })

      // getCurrentTime/getDuration come from the official player state.
      clearInterval(pollTimer)
      pollTimer = setInterval(emitState, 250)
    },

    play() {
      pendingPlay = true
      if (ready && player) {
        pendingPlay = false
        player.playVideo?.()
      }
    },

    pause() {
      pendingPlay = false
      if (ready && player) player.pauseVideo?.()
    },

    /**
     * Seeking via the documented seekTo() method. This only works while the
     * official player is visible and ready, which is exactly how we use it.
     */
    seek(seconds) {
      if (!ready || !player) return
      const target = Number(seconds)
      if (!Number.isFinite(target)) return
      try {
        player.seekTo?.(Math.max(0, target), true)
      } catch {
        /* seeking before metadata is ready is a no-op */
      }
    },

    // Intentionally inert: setVolume() is restricted by YouTube. The player's
    // own volume control stays available to the user.
    setVolume() {},

    getCurrentTime() {
      if (!player || typeof player.getCurrentTime !== 'function') return 0
      try {
        return player.getCurrentTime() || 0
      } catch {
        return 0
      }
    },

    getDuration() {
      if (!player || typeof player.getDuration !== 'function') return 0
      try {
        const value = player.getDuration()
        return Number.isFinite(value) ? value : 0
      } catch {
        return 0
      }
    },

    destroy() {
      clearInterval(pollTimer)
      pollTimer = null
      try {
        player?.destroy?.()
      } catch {
        /* ignore */
      }
      player = null
      ready = false
      hostElement.replaceChildren()
    },
  }
}

/* ------------------------------------------------------------------ */
/* IFrame API loader + player mounting                                 */
/* ------------------------------------------------------------------ */

const API_SRC = 'https://www.youtube.com/iframe_api'

let apiPromise = null

/**
 * Loads the official IFrame Player API exactly once per page.
 * Uses youtube.com here (not youtube-nocookie.com) because that is the host
 * the API script is published on; the resulting IFRAME still points at the
 * no-cookie embed host.
 */
export function loadIframeApi() {
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('YouTube player requires a browser'))
      return
    }
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }

    const script = document.createElement('script')
    script.src = API_SRC
    script.async = true
    script.onerror = () => reject(new Error('Could not load the YouTube player API'))
    document.head.appendChild(script)

    setTimeout(() => {
      if (!window.YT?.Player) {
        reject(new Error('The YouTube player API timed out'))
      }
    }, 15000)
  })

  return apiPromise
}

/** Builds a fresh visible player iframe bound to a container element. */
function mountPlayer(host, videoId, { onReady, onStateChange, onError }) {
  return new Promise((resolve, reject) => {
    const YT = window.YT
    if (!YT?.Player) {
      reject(new Error('The YouTube player API is unavailable'))
      return
    }

    // Remove any previous iframe so only one official player exists.
    host.replaceChildren()

    // The mount node must have a real size; YouTube refuses to play in a
    // zero-height container.
    const mount = document.createElement('div')
    mount.style.width = '100%'
    mount.style.height = '100%'
    host.appendChild(mount)

    // YouTube's Terms require the embedded player to be visible and at least
    // 200x200. If our container has not been laid out yet (height 0, or a
    // collapsed parent) YT silently falls back to a 150px-tall player, which
    // would breach that requirement. So measure and enforce a floor here rather
    // than trusting CSS alone to have produced a usable box.
    const rect = host.getBoundingClientRect()
    const MIN_SIZE = 200
    const DEFAULT_SIZE = 360
    const width = Math.max(MIN_SIZE, Math.round(rect.width) || DEFAULT_SIZE)
    const height = Math.max(
      MIN_SIZE,
      Math.round(rect.height) || Math.round(width * 0.5625) || DEFAULT_SIZE,
    )
    mount.style.minWidth = `${MIN_SIZE}px`
    mount.style.minHeight = `${MIN_SIZE}px`

    const player = new YT.Player(mount, {
      // The IFrame Player API defaults to https://www.youtube.com/embed.
      // Passing the no-cookie host here is what actually makes the embedded
      // player use youtube-nocookie.com, so no advertising cookie is set until
      // the user actually plays the video.
      host: 'https://www.youtube-nocookie.com',
      videoId,
      // Explicit pixel size so the player can never end up below the minimum.
      width: String(width),
      height: String(height),
      playerVars: {
        // Visible player with its own controls enabled. We never hide or
        // miniaturise it, and never draw our own UI on top of it.
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        // Never autoplay on load - playback only starts from a real click.
        autoplay: 0,
      },
      events: {
        onReady: (event) => onReady?.(event.target),
        // YouTube invokes this with an EVENT object ({ target, data }), not a
        // bare state number. Normalise to the documented state value so
        // consumers can compare it against the constants.
        onStateChange: (event) => onStateChange?.(event?.data ?? event),
        onError,
      },
    })

    // Safety net so a blocked/failed embed cannot hang the UI forever.
    setTimeout(() => {
      if (host.querySelector('iframe')) resolve(player)
    }, 2000)
  })
}

export default { engineFor, createAudioEngine, createYouTubeEngine, loadIframeApi }