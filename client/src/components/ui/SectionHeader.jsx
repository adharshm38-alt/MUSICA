import Icon from '../ui/Icon'

/** Section title with optional "See all" link and icon. */
export default function SectionHeader({ title, icon, subtitle, action, className = '' }) {
  return (
    <div className={`mb-4 flex items-end justify-between ${className}`}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-lg font-bold text-white sm:text-xl">
          {icon ? <Icon name={icon} className="h-5 w-5 text-brand-400" /> : null}
          {title}
        </h2>
        {subtitle ? <p className="mt-1 truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}
