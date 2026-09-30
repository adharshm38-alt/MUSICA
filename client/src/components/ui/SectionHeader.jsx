import Icon from '../ui/Icon'

/** Section title with optional "See all" link and icon. */
export default function SectionHeader({ title, icon, action, className = '' }) {
  return (
    <div className={`mb-4 flex items-end justify-between ${className}`}>
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-white sm:text-xl">
        {icon ? <Icon name={icon} className="h-5 w-5 text-brand-400" /> : null}
        {title}
      </h2>
      {action}
    </div>
  )
}
