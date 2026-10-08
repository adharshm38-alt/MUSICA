import { useEffect, useState } from 'react'
import { usePlayer } from '../../context/PlayerContext'
import Sheet from '../ui/Sheet'
import Icon from '../ui/Icon'
import { cx } from '../../utils/format'

/**
 * Audio output picker.
 *
 * Reports what the browser actually reports and nothing more. Two real sources:
 *
 *   1. `AudioContext.destination` / `HTMLMediaElement.setSinkId` - the standard
 *      way to move audio to a chosen output. Supported on Chromium; Firefox and
 *      Safari do not implement it.
 *   2. `navigator.mediaDevices.enumerateDevices()` - lists real audio outputs
 *      that are currently exposed to the page.
 *
 * Nothing is invented. If the browser exposes no devices, or the API is missing,
 * the panel says so and falls back to describing the single default output
 * rather than fabricating a device list. YouTube tracks are excluded because
 * the official IFrame player does not permit programmatic output switching.
 */
export default function OutputSelector({ open, onClose }) {
  const { isYouTube, volume, isMuted, setVolume, toggleMute } = usePlayer()
  const [devices, setDevices] = useState([])
  const [currentId, setCurrentId] = useState('')
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState('idle')

  // Device labels are only exposed once permission has been granted, so the
  // initial list is often just "default". That is honest and still useful.
  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    const audio = typeof Audio !== 'undefined' ? new Audio() : null

    const supportsSinkId = Boolean(audio && typeof audio.setSinkId === 'function')
    setSupported(supportsSinkId)

    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return () => {
        cancelled = true
      }
    }

    const load = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setDevices(all.filter((device) => device.kind === 'audiooutput'))
      } catch {
        if (!cancelled) setDevices([])
      }
    }

    load()

    // Outputs appear and disappear as devices connect; keep the list live.
    navigator.mediaDevices.addEventListener?.('devicechange', load)

    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener?.('devicechange', load)
    }
  }, [open])

  const handleSelect = async (deviceId) => {
    // The shared element is what actually plays audio; route its output.
    const audio = document.querySelector('audio')
    const target = audio || null

    if (!target || typeof target.setSinkId !== 'function') {
      setStatus('unsupported')
      return
    }

    try {
      await target.setSinkId(deviceId)
      setCurrentId(deviceId)
      setStatus('ok')
    } catch {
      // Firefox rejects setSinkId even when the property exists.
      setStatus('unsupported')
    }
  }

  const options = devices.length
    ? devices
    : [{ deviceId: '', label: "This device's speakers" }]

  return (
    <Sheet open={open} onClose={onClose} title="Audio output" description="Where this track is playing">
      {isYouTube ? (
        <p className="py-6 text-center text-sm text-muted">
          Output is chosen inside the YouTube player, which manages its own audio.
        </p>
      ) : (
        <div className="space-y-5">
          <ul className="space-y-1" role="radiogroup" aria-label="Audio output device">
            {options.map((device) => {
              const id = device.deviceId || ''
              const selected = currentId === id
              return (
                <li key={id || 'default'}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleSelect(id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                      selected ? 'bg-brand-500/15 ring-1 ring-brand-400/40' : 'hover:bg-white/5',
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-white/70">
                      <Icon name="volume" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {device.label || "This device's speakers"}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {id ? 'Connected output' : 'System default'}
                      </span>
                    </span>
                    {selected ? (
                      <Icon name="check" className="h-5 w-5 shrink-0 text-brand-400" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          {!supported ? (
            <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-xs text-muted">
              This browser doesn&rsquo;t let a web page move audio between outputs. Volume
              is still under your control below.
            </p>
          ) : null}

          {status === 'unsupported' ? (
            <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-xs text-muted">
              That output couldn&rsquo;t be selected from the browser.
            </p>
          ) : null}

          {/* Volume stays here too, so output and level are adjustable together. */}
          <div className="space-y-2 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="output-volume" className="text-xs font-semibold text-muted uppercase">
                Volume
              </label>
              <button
                type="button"
                onClick={toggleMute}
                className="touch-target"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                <Icon
                  name={isMuted || volume === 0 ? 'mute' : 'volume'}
                  className="h-4 w-4"
                />
              </button>
            </div>
            <input
              id="output-volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="slider-track"
              style={{
                background: `linear-gradient(to right, #a78bfa ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>
        </div>
      )}
    </Sheet>
  )
}