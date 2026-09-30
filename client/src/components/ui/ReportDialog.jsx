import { useEffect, useState } from 'react'
import { reportsService } from '../../services'
import { toFriendlyError } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import Icon from './Icon'

const REASONS = [
  { key: 'copyright', label: 'Copyright concern', hint: 'This is my work or belongs to someone else' },
  { key: 'inappropriate', label: 'Inappropriate content', hint: 'Offensive, explicit or harmful' },
  { key: 'spam', label: 'Spam or misleading', hint: 'Fake, misleading or repeated content' },
  { key: 'other', label: 'Something else', hint: 'Tell us what is wrong' },
]

/** Accessible modal for reporting a song or a profile. */
export default function ReportDialog({ targetType, targetId, targetLabel, onClose }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  // Close on Escape.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    if (!reason) {
      toast.error('Please choose a reason.')
      return
    }
    setBusy(true)
    try {
      await reportsService.create({ targetType, targetId, reason, details: details.trim() })
      toast.success('Thanks. Our moderators will take a look.')
      onClose()
    } catch (error) {
      toast.error(toFriendlyError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onClick={(event) => event.stopPropagation()}
        className="glass-strong w-full max-w-md animate-scale-in rounded-panel p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="report-title" className="text-lg font-bold text-white">Report {targetType}</h2>
            {targetLabel ? <p className="mt-1 truncate text-xs text-muted">{targetLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-icon -mr-2 -mt-1" aria-label="Close">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-2">
          {REASONS.map((option) => (
            <label
              key={option.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                reason === option.key
                  ? 'border-brand-500/60 bg-brand-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={option.key}
                checked={reason === option.key}
                onChange={() => setReason(option.key)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
              />
              <span>
                <span className="block text-sm font-semibold text-white">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}

          <div className="pt-2">
            <label htmlFor="report-details" className="field-label">
              Extra details <span className="normal-case">(optional)</span>
            </label>
            <textarea
              id="report-details"
              rows={3}
              className="field resize-none"
              placeholder="Anything that helps us review this faster…"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
            />
          </div>

          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="flag" className="h-4 w-4" />}
            {busy ? 'Sending…' : 'Submit report'}
          </button>
        </form>
      </div>
    </div>
  )
}
