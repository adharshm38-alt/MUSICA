import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { songsService } from '../services'
import { toFriendlyError } from '../services/api'
import { useToast } from '../context/ToastContext'
import Icon from '../components/ui/Icon'

const MAX_AUDIO_MB = 25
const MAX_IMAGE_MB = 5

const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
]

const GENRES = [
  'Electronic', 'Hip-Hop', 'Pop', 'Rock', 'R&B', 'Jazz', 'Classical',
  'Lo-fi', 'Ambient', 'Metal', 'Folk', 'Reggae', 'Blues', 'Soul', 'Funk', 'Other',
]

const emptyForm = {
  title: '',
  artistName: '',
  album: '',
  genre: '',
  description: '',
  releaseYear: String(new Date().getFullYear()),
  rightsNote: '',
}

export default function Upload() {
  const toast = useToast()
  const navigate = useNavigate()

  const audioInput = useRef(null)
  const coverInput = useRef(null)

  const [audioFile, setAudioFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const pickAudio = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!AUDIO_TYPES.includes(file.type)) {
      setErrors((c) => ({ ...c, audio: 'Choose an MP3, M4A, WAV, OGG or FLAC file.' }))
      return
    }
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
      setErrors((c) => ({ ...c, audio: `Audio must be ${MAX_AUDIO_MB} MB or smaller.` }))
      return
    }
    setErrors((c) => ({ ...c, audio: undefined }))
    setAudioFile(file)
    // Default the title to the filename when it's still untouched.
    if (!form.title) {
      const guess = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
      setForm((c) => ({ ...c, title: guess.slice(0, 120) }))
    }
  }

  const pickCover = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrors((c) => ({ ...c, cover: 'Cover must be an image file.' }))
      return
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setErrors((c) => ({ ...c, cover: `Cover image must be ${MAX_IMAGE_MB} MB or smaller.` }))
      return
    }
    setErrors((c) => ({ ...c, cover: undefined }))
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  const validate = () => {
    const next = {}
    if (!audioFile) next.audio = 'Please choose an audio file.'
    if (!form.title.trim()) next.title = 'Title is required.'
    else if (form.title.length > 120) next.title = 'Title is too long (120 characters max).'
    if (!form.artistName.trim()) next.artistName = 'Artist name is required.'
    if (form.releaseYear) {
      const year = Number(form.releaseYear)
      const maxYear = new Date().getFullYear() + 1
      if (!Number.isInteger(year) || year < 1900 || year > maxYear) {
        next.releaseYear = `Enter a year between 1900 and ${maxYear}.`
      }
    }
    if (!rightsConfirmed) next.rightsConfirmed = 'You must confirm you have the rights to this recording.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    const body = new FormData()
    body.append('audio', audioFile)
    if (coverFile) body.append('cover', coverFile)
    body.append('title', form.title.trim())
    body.append('artistName', form.artistName.trim())
    body.append('album', form.album.trim())
    body.append('genre', form.genre)
    body.append('description', form.description.trim())
    if (form.releaseYear) body.append('releaseYear', form.releaseYear)
    body.append('rightsConfirmed', 'true')
    if (form.rightsNote.trim()) body.append('rightsNote', form.rightsNote.trim())

    setBusy(true)
    setProgress(0)

    try {
      await songsService.upload(body, setProgress)
      toast.success('Your track is live. Thanks for sharing!')
      setAudioFile(null)
      setCoverFile(null)
      setCoverPreview('')
      setForm(emptyForm)
      setRightsConfirmed(false)
      if (audioInput.current) audioInput.current.value = ''
      if (coverInput.current) coverInput.current.value = ''
      navigate('/profile')
    } catch (error) {
      toast.error(toFriendlyError(error))
      setProgress(0)
    } finally {
      setBusy(false)
    }
  }

  const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">Upload your music</h1>
        <p className="mt-1 text-sm text-muted">
          Share a track you own or are licensed to distribute.
        </p>
      </header>

      {/* Copyright notice - always visible */}
      <div className="flex items-start gap-3 rounded-panel border border-amber-400/25 bg-amber-400/10 p-4">
        <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="text-sm">
          <p className="font-semibold text-amber-200">Upload only what you own</p>
          <p className="mt-1 leading-relaxed text-amber-100/80">
            By uploading you confirm that you own this recording or have written permission from
            the rights holder. Commercial copyrighted music, remixes and covers may not be uploaded
            without authorisation. Uploads can be reported and removed at any time.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Audio file */}
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
            <Icon name="mic" className="h-4 w-4 text-brand-400" />
            Audio file
          </h2>

          <input ref={audioInput} type="file" accept="audio/*" onChange={pickAudio} className="sr-only" id="audio" />

          {audioFile ? (
            <div className="flex items-center gap-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-400/20 text-emerald-300">
                <Icon name="music" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{audioFile.name}</p>
                <p className="text-xs text-emerald-200/80">{formatBytes(audioFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAudioFile(null)
                  if (audioInput.current) audioInput.current.value = ''
                }}
                className="btn-icon"
                aria-label="Remove audio file"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="audio"
              className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center transition-colors hover:border-brand-400/50 hover:bg-brand-500/5"
            >
              <Icon name="upload" className="h-8 w-8 text-brand-400" />
              <p className="mt-3 text-sm font-semibold text-white">Choose your audio file</p>
              <p className="mt-1 text-xs text-muted">
                MP3, M4A, WAV, OGG or FLAC · up to {MAX_AUDIO_MB} MB
              </p>
            </label>
          )}
          {errors.audio ? <p className="mt-2 text-xs text-rose-400">{errors.audio}</p> : null}
        </div>

        {/* Cover art */}
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
            <Icon name="image" className="h-4 w-4 text-brand-400" />
            Cover artwork <span className="font-normal text-muted">(optional)</span>
          </h2>

          <input ref={coverInput} type="file" accept="image/*" onChange={pickCover} className="sr-only" id="cover" />

          <div className="flex items-center gap-4">
            <label
              htmlFor="cover"
              className="grid h-32 w-32 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] transition-colors hover:border-brand-400/50"
            >
              {coverPreview ? (
                <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-muted">
                  <Icon name="image" className="h-6 w-6" />
                  <span className="text-[10px]">Add</span>
                </span>
              )}
            </label>

            <div className="flex-1 text-xs text-muted">
              <p>A square image (at least 600×600) looks best.</p>
              <p className="mt-1">JPG, PNG or WEBP · up to {MAX_IMAGE_MB} MB.</p>
              {coverFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setCoverFile(null)
                    setCoverPreview('')
                    if (coverInput.current) coverInput.current.value = ''
                  }}
                  className="btn-subtle mt-3 text-xs"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                  Remove cover
                </button>
              ) : null}
            </div>
          </div>
          {errors.cover ? <p className="mt-2 text-xs text-rose-400">{errors.cover}</p> : null}
        </div>

        {/* Details */}
        <div className="card space-y-5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Icon name="edit" className="h-4 w-4 text-brand-400" />
            Song details
          </h2>

          <div>
            <label htmlFor="title" className="field-label">Title *</label>
            <input id="title" className="field" value={form.title} onChange={update('title')} maxLength={120}
              placeholder="Midnight Drive" aria-invalid={Boolean(errors.title)} />
            {errors.title ? <p className="mt-1.5 text-xs text-rose-400">{errors.title}</p> : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="artistName" className="field-label">Artist name *</label>
              <input id="artistName" className="field" value={form.artistName} onChange={update('artistName')} maxLength={80}
                placeholder="Your artist name" aria-invalid={Boolean(errors.artistName)} />
              {errors.artistName ? <p className="mt-1.5 text-xs text-rose-400">{errors.artistName}</p> : null}
            </div>

            <div>
              <label htmlFor="album" className="field-label">Album</label>
              <input id="album" className="field" value={form.album} onChange={update('album')} maxLength={120}
                placeholder="Optional" />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="genre" className="field-label">Genre</label>
              <select id="genre" className="field" value={form.genre} onChange={update('genre')}>
                <option value="">Select a genre</option>
                {GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="releaseYear" className="field-label">Release year</label>
              <input id="releaseYear" type="number" inputMode="numeric" className="field" value={form.releaseYear}
                onChange={update('releaseYear')} min={1900} max={new Date().getFullYear() + 1}
                aria-invalid={Boolean(errors.releaseYear)} />
              {errors.releaseYear ? <p className="mt-1.5 text-xs text-rose-400">{errors.releaseYear}</p> : null}
            </div>
          </div>

          <div>
            <label htmlFor="description" className="field-label">Description</label>
            <textarea id="description" rows={3} className="field resize-none" value={form.description}
              onChange={update('description')} maxLength={1000} placeholder="Tell listeners about this track…" />
            <p className="mt-1 text-right text-xs text-muted">{form.description.length}/1000</p>
          </div>
        </div>

        {/* Rights confirmation */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Icon name="shield" className="h-4 w-4 text-brand-400" />
            Rights confirmation *
          </h2>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]">
            <input type="checkbox" checked={rightsConfirmed}
              onChange={(event) => {
                setRightsConfirmed(event.target.checked)
                setErrors((c) => ({ ...c, rightsConfirmed: undefined }))
              }}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500" />
            <span className="text-xs leading-relaxed text-muted">
              I own this recording, or I have written permission from the rights holder to
              distribute it on MUSICA. I understand that infringing uploads may be removed
              without notice.
            </span>
          </label>
          {errors.rightsConfirmed ? (
            <p className="mt-2 text-xs text-rose-400">{errors.rightsConfirmed}</p>
          ) : null}

          <div className="mt-4">
            <label htmlFor="rightsNote" className="field-label">
              Rights note <span className="normal-case">(optional)</span>
            </label>
            <input id="rightsNote" className="field" value={form.rightsNote} onChange={update('rightsNote')}
              maxLength={300} placeholder="e.g. Licensed from my label, written and produced by me" />
          </div>
        </div>

        {/* Progress */}
        {busy ? (
          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-white">Uploading…</span>
              <span className="tabular-nums text-brand-300">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-brand transition-[width] duration-300"
                style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">Keep this tab open until it finishes.</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary px-8 py-3.5" disabled={busy}>
            <Icon name={busy ? 'loader' : 'upload'} className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Uploading…' : 'Publish track'}
          </button>
          <Link to="/profile" className="btn-ghost px-6 py-3.5">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
