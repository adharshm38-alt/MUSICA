import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/layout/AuthLayout'
import Icon from '../components/ui/Icon'
import FIELDS from '../components/auth/registerFields'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { toFriendlyError } from '../services/api'

export default function Register() {
  const { register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const pickAvatar = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrors((current) => ({ ...current, avatar: 'Please choose an image file.' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, avatar: 'Profile image must be under 5 MB.' }))
      return
    }
    setErrors((current) => ({ ...current, avatar: undefined }))
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const validate = () => {
    const next = {}
    if (!form.username.trim()) next.username = 'Username is required.'
    else if (!/^[a-z0-9_]{3,30}$/.test(form.username.trim()))
      next.username = 'Use 3-30 lowercase letters, numbers or underscores.'
    if (!form.displayName.trim()) next.displayName = 'Display name is required.'
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Password is required.'
    else if (form.password.length < 8) next.password = 'Password must be at least 8 characters.'
    if (!agreed) next.agreed = 'Please accept the upload policy.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    setBusy(true)
    try {
      // Send JSON unless the user picked a profile picture (multipart).
      let payload
      if (avatarFile) {
        const body = new FormData()
        body.append('username', form.username.trim().toLowerCase())
        body.append('displayName', form.displayName.trim())
        body.append('email', form.email.trim().toLowerCase())
        body.append('password', form.password)
        body.append('avatar', avatarFile)
        payload = body
      } else {
        payload = {
          username: form.username.trim().toLowerCase(),
          displayName: form.displayName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }
      }

      const user = await register(payload)
      toast.success(`Welcome to MUSICA, ${user.displayName || user.username}!`)
      navigate('/', { replace: true })
    } catch (error) {
      toast.error(toFriendlyError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the community and start sharing your music."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-400 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Optional profile image */}
        <div className="flex items-center gap-4">
          <label
            htmlFor="avatar"
            className="grid h-16 w-16 cursor-pointer place-items-center overflow-hidden rounded-full bg-gradient-brand text-white ring-1 ring-white/15 transition-transform hover:scale-105"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="user" className="h-7 w-7" />
            )}
          </label>
          <div>
            <label htmlFor="avatar" className="text-sm font-semibold text-white">
              Profile image <span className="font-normal text-muted">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-muted">PNG or JPG, up to 5 MB.</p>
            {errors.avatar ? <p className="mt-1 text-xs text-rose-400">{errors.avatar}</p> : null}
          </div>
          <input id="avatar" type="file" accept="image/*" onChange={pickAvatar} className="sr-only" />
        </div>

        {FIELDS.map((field) => (
          <div key={field.name}>
            <label htmlFor={field.name} className="field-label">
              {field.label}
            </label>
            <div className="relative">
              <input
                id={field.name}
                type={field.name === 'password' && showPassword ? 'text' : field.type}
                autoComplete={field.autoComplete}
                className={`field ${field.name === 'password' ? 'pr-12' : ''}`}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                value={form[field.name]}
                onChange={update(field.name)}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={errors[field.name] ? `${field.name}-error` : `${field.name}-hint`}
              />
              {field.name === 'password' ? (
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
                </button>
              ) : null}
            </div>
            {errors[field.name] ? (
              <p id={`${field.name}-error`} className="mt-1.5 text-xs text-rose-400">
                {errors[field.name]}
              </p>
            ) : (
              <p id={`${field.name}-hint`} className="mt-1.5 text-xs text-muted/70">
                {field.hint}
              </p>
            )}
          </div>
        ))}

        {/* Upload / copyright policy acceptance */}
        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked)
                setErrors((current) => ({ ...current, agreed: undefined }))
              }}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
            />
            <span className="text-xs leading-relaxed text-muted">
              I will only upload music that I own or am authorised to distribute, and I agree to the
              MUSICA community guidelines. Copyrighted commercial music must not be uploaded without
              permission.
            </span>
          </label>
          {errors.agreed ? <p className="mt-1.5 text-xs text-rose-400">{errors.agreed}</p> : null}
        </div>

        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
          )}
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
