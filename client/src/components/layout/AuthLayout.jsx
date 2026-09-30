import { Link } from 'react-router-dom'
import Logo from './Logo'
import Icon from '../ui/Icon'

/** Split-screen shell used by Login and Register. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Logo className="mb-8" />

          <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          {footer ? <div className="mt-6 text-sm text-muted">{footer}</div> : null}

          <p className="mt-10 text-center text-xs text-muted/70">
            <Link to="/" className="inline-flex items-center gap-1 hover:text-white">
              <Icon name="arrowLeft" className="h-3.5 w-3.5" />
              Back to MUSICA
            </Link>
          </p>
        </div>
      </div>

      {/* Decorative side (hidden on mobile) */}
      <aside className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/50 via-accent-pink/30 to-accent-blue/50" />
        <div className="absolute inset-0 backdrop-blur-3xl" />

        <div className="relative flex h-full flex-col justify-center px-14">
          <blockquote className="max-w-md">
            <p className="text-3xl font-bold leading-tight text-white">
              &ldquo;A home for the music you make and the music you love.&rdquo;
            </p>
            <footer className="mt-5 text-sm text-white/60">— the MUSICA community</footer>
          </blockquote>

          <ul className="mt-12 space-y-4">
            {[
              ['mic', 'Upload and share your own tracks'],
              ['users', 'Follow artists and build a fanbase'],
              ['playlist', 'Organise everything into playlists'],
              ['shield', 'Copyright-friendly, report-based moderation'],
            ].map(([icon, label]) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/80">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
                  <Icon name={icon} className="h-[18px] w-[18px]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
