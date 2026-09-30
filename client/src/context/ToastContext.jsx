import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

const ICONS = {
  success: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 12.75l6 6 9-13.5"
    />
  ),
  error: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 18L18 6M6 6l12 12"
    />
  ),
  info: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.25 11.25h1.5v5.25m-1.5-9h1.5v1.5h-1.5V7.5zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
}

const TONE = {
  success: 'text-emerald-400 bg-emerald-500/15 ring-emerald-500/30',
  error: 'text-rose-400 bg-rose-500/15 ring-rose-500/30',
  info: 'text-brand-400 bg-brand-500/15 ring-brand-500/30',
}

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, type = 'info', duration = 4000) => {
      nextId += 1
      const id = nextId
      setToasts((current) => [...current.slice(-3), { id, message, type }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, duration) => push(message, 'success', duration),
      error: (message, duration) => push(message, 'error', duration ?? 5000),
      info: (message, duration) => push(message, 'info', duration),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Live region so screen readers announce toasts too. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="glass-strong pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl px-4 py-3 shadow-2xl shadow-black/50"
          >
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 ${TONE[toast.type] ?? TONE.info}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden="true"
              >
                {ICONS[toast.type] ?? ICONS.info}
              </svg>
            </span>

            <p className="flex-1 text-sm leading-snug text-white">{toast.message}</p>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="btn-icon -mr-1 -mt-1 h-7 w-7"
              aria-label="Dismiss notification"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
