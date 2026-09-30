import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersService } from '../services'
import api, { toFriendlyError } from '../services/api'
import { getApiBaseUrl, setApiBaseUrl } from '../config/runtime'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Icon from '../components/ui/Icon'
import Avatar from '../components/ui/Avatar'

export default function Settings() {
  const { user, isAdmin, refresh } = useAuth()
  const toast = useToast()
  const avatarInput = useRef(null)

  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    bio: user?.bio ?? '',
    email: user?.email ?? '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)

  // Android app: the backend address must be editable on the device, because
  // "localhost" on a phone means the phone itself, not your computer.
  const [serverUrl, setServerUrl] = useState(() => getApiBaseUrl())

  const update = (field) => (event) => {
    setForm((c) => ({ ...c, [field]: event.target.value }))
  }

  const pickAvatar = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile image must be under 5 MB.')
      return
    }
    setAvatarFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    if (!form.displayName.trim()) {
      toast.error('Display name is required.')
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      body.append('displayName', form.displayName.trim())
      body.append('bio', form.bio.trim())
      body.append('email', form.email.trim())
      if (avatarFile) body.append('avatar', avatarFile)

      const { user: updated } = await usersService.update(user._id, body)
      setAvatarFile(null)
      setPreview('')
      if (avatarInput.current) avatarInput.current.value = ''
      await refresh()
      toast.success('Profile updated.')
      void updated
    } catch (error) {
      toast.error(toFriendlyError(error))
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (event) => {
    event.preventDefault()
    if (pw.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.')
      return
    }
    if (pw.newPassword !== pw.confirm) {
      toast.error('The new passwords do not match.')
      return
    }
    setPwBusy(true)
    try {
      await api.put('/auth/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      })
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Password changed.')
    } catch (error) {
      toast.error(toFriendlyError(error))
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-6">
      <header className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account and profile.</p>
      </header>

      {/* Profile */}
      <form onSubmit={saveProfile} className="card space-y-5 p-6 animate-fade-up">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Icon name="user" className="h-4 w-4 text-brand-400" />
          Profile
        </h2>

        <div className="flex items-center gap-4">
          <label htmlFor="avatar" className="cursor-pointer">
            <Avatar src={preview || user?.avatarUrl} name={user?.displayName} size="lg"
              className="ring-2 ring-white/10 transition-transform hover:scale-105" />
          </label>
          <div>
            <label htmlFor="avatar" className="text-sm font-semibold text-white">Profile picture</label>
            <p className="mt-0.5 text-xs text-muted">JPG or PNG, up to 5 MB.</p>
          </div>
          <input ref={avatarInput} id="avatar" type="file" accept="image/*" onChange={pickAvatar} className="sr-only" />
        </div>

        <div>
          <label htmlFor="s-displayName" className="field-label">Display name</label>
          <input id="s-displayName" className="field" value={form.displayName} onChange={update('displayName')} maxLength={50} />
        </div>

        <div>
          <label htmlFor="s-username" className="field-label">Username</label>
          <input id="s-username" className="field opacity-60" value={`@${user?.username}`} disabled
            readOnly aria-describedby="username-hint" />
          <p id="username-hint" className="mt-1.5 text-xs text-muted/70">Usernames can't be changed.</p>
        </div>

        <div>
          <label htmlFor="s-email" className="field-label">Email</label>
          <input id="s-email" type="email" className="field" value={form.email} onChange={update('email')} />
        </div>

        <div>
          <label htmlFor="s-bio" className="field-label">Bio</label>
          <textarea id="s-bio" rows={3} className="field resize-none" value={form.bio}
            onChange={update('bio')} maxLength={300} placeholder="Tell people about your music…" />
          <p className="mt-1 text-right text-xs text-muted">{form.bio.length}/300</p>
        </div>

        <button type="submit" className="btn-primary px-6 py-2.5" disabled={busy}>
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />}
          Save changes
        </button>
      </form>

      {/* Password */}
      <form onSubmit={savePassword} className="card space-y-5 p-6 animate-fade-up">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Icon name="lock" className="h-4 w-4 text-brand-400" />
          Password
        </h2>

        <div>
          <label htmlFor="s-cur" className="field-label">Current password</label>
          <input id="s-cur" type="password" autoComplete="current-password" className="field"
            value={pw.currentPassword} onChange={(e) => setPw((c) => ({ ...c, currentPassword: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="s-new" className="field-label">New password</label>
          <input id="s-new" type="password" autoComplete="new-password" className="field"
            value={pw.newPassword} onChange={(e) => setPw((c) => ({ ...c, newPassword: e.target.value }))}
            placeholder="At least 8 characters" />
        </div>
        <div>
          <label htmlFor="s-conf" className="field-label">Confirm new password</label>
          <input id="s-conf" type="password" autoComplete="new-password" className="field"
            value={pw.confirm} onChange={(e) => setPw((c) => ({ ...c, confirm: e.target.value }))} />
        </div>

        <button type="submit" className="btn-ghost px-6 py-2.5" disabled={pwBusy}>
          <Icon name="shield" className="h-4 w-4" />
          Change password
        </button>
      </form>

      {/* Server address - required on Android */}
      <section className="card space-y-3 p-6 animate-fade-up">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Icon name="server" className="h-4 w-4 text-brand-400" />
          Music server
        </h2>
        <p className="text-xs leading-relaxed text-muted">
          On Android the app needs the address of your MUSICA server. Use your computer&apos;s
          LAN address &mdash; not <code className="text-soft">localhost</code>, which on a phone
          means the phone itself &mdash; for example{' '}
          <code className="text-soft">http://192.168.1.5:5000/api</code>.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="server-url"
            className="field flex-1"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.1.5:5000/api"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <button
            type="button"
            className="btn-primary shrink-0 px-5 py-2.5"
            onClick={() => {
              try {
                setApiBaseUrl(serverUrl)
                toast.success('Server address saved.')
              } catch (err) {
                toast.error(err.message)
              }
            }}
          >
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
            Save
          </button>
        </div>
        <p className="text-[11px] text-muted/70">
          Currently using: <span className="text-soft">{getApiBaseUrl()}</span>
        </p>
      </section>

      {/* Moderation policy */}
      <section className="card space-y-3 p-6 animate-fade-up">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Icon name="flag" className="h-4 w-4 text-brand-400" />
          Content policy
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Only upload audio you own or are authorised to distribute. Copyrighted commercial music,
          unauthorised remixes and covers may be removed after review. Use the report button on any
          song or profile to flag a problem.
        </p>
        <Link to="/report" className="btn-ghost px-5 py-2.5 text-sm">
          <Icon name="flag" className="h-4 w-4" />
          Report content
        </Link>
      </section>

      {/* Admin */}
      {isAdmin ? (
        <section className="card space-y-3 border-brand-500/30 bg-brand-500/5 p-6 animate-fade-up">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Icon name="shield" className="h-4 w-4 text-brand-400" />
            Administration
          </h2>
          <p className="text-sm text-muted">You have admin access on MUSICA.</p>
          <Link to="/admin" className="btn-primary px-5 py-2.5 text-sm">
            Open admin dashboard
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </section>
      ) : null}
    </div>
  )
}
