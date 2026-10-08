import { useEffect, useRef } from 'react'
import { cx } from '../../utils/format'
import Icon from './Icon'

/**
 * Bottom sheet / side panel used by the queue, lyrics, output picker and menus.
 *
 * Accessibility choices that matter here:
 *  - role="dialog" + aria-modal, labelled by its own heading
 *  - Escape closes it
 *  - focus moves into the panel on open and returns to the trigger on close
 *  - Tab is trapped inside, so a keyboard user cannot tab into the page behind
 *  - background scroll is locked while it is open
 *
 * Mobile renders as a drag-to-dismiss-style bottom sheet; on desktop it becomes a
 * right-hand panel, which suits wide screens better than a full-width sheet.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = false,
}) {
  const panelRef = useRef(null)
  const restoreFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    restoreFocusRef.current = document.activeElement

    // Lock background scroll without the layout shifting as the scrollbar goes.
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    // Focus the panel so the first Tab lands inside it.
    const focusTimer = setTimeout(() => panelRef.current?.focus(), 0)

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusables = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
      // Hand focus back so keyboard users continue where they were.
      const target = restoreFocusRef.current
      if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Scrim. Clicking it is a deliberate, discoverable way to dismiss. */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default animate-fade-in bg-black/70 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'absolute flex flex-col overflow-hidden border-white/10 bg-base-900/95 shadow-2xl shadow-black/80 outline-none backdrop-blur-2xl',
          side
            ? 'inset-y-0 right-0 w-full max-w-md animate-slide-up border-l'
            : 'inset-x-0 bottom-0 max-h-[85dvh] animate-sheet-up rounded-t-3xl border-t',
        )}
      >
        {/* Grab handle on mobile: signals the sheet can be dragged away. */}
        {!side ? (
          <div className="flex justify-center pt-3 pb-1 lg:hidden" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-white/25" />
          </div>
        ) : null}

        <header className="flex items-center justify-between gap-3 px-5 pt-3 pb-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-white">{title}</h2>
            {description ? (
              <p className="truncate text-xs text-muted">{description}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="touch-target" aria-label="Close">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>

        {footer ? (
          <footer className="border-t border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}