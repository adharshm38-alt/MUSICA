import Icon from '../ui/Icon'

/** Friendly placeholder for empty lists and error states. */
export default function EmptyState({
  icon = 'music',
  title,
  message,
  action,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-panel border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center ${className}`}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-pink/20 text-brand-300 ring-1 ring-white/10">
        <Icon name={icon} className="h-7 w-7" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
      {message ? <p className="mt-2 max-w-sm text-sm text-muted">{message}</p> : null}

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
