import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { requestPasswordReset, signIn, signUp } from '../lib/api'
import { formatMoney } from '../lib/format'
import { Membership } from '../lib/plan'
import Modal from './Modal'
import { errorBox, input, primary, primaryGreen } from './ui'

const label = 'block text-xs font-bold uppercase text-slate-500 mb-1'
const link = 'text-emerald-600 font-bold cursor-pointer hover:underline transition'

const TITLES = { pro: 'Work with Habitick', register: 'Create an account', login: 'Log in', forgot: 'Reset your password' }

// The window for logging in, registering and asking for a new password.
// `auth` is { mode, role }: mode is 'pro' (what working here means), 'register',
// 'login' or 'forgot'; role is the kind of account being created.
export default function AuthModal({ auth, setAuth }) {
  const { showToast, withCurtain, plan } = useApp()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [resetSentTo, setResetSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const { mode, role } = auth

  const close = () => setAuth(null)
  const goTo = (newMode, newRole = role) => {
    setError('')
    setResetSentTo('')
    setAuth({ mode: newMode, role: newRole })
  }

  const handleRegister = (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const fullName = form.get('fullName').trim()
    const email = form.get('email').trim()
    const password = form.get('password')

    if (!fullName) return setError('Please tell us your name.')
    if (email !== form.get('confirmEmail').trim()) return setError('The two emails do not match.')
    if (password.length < 6) return setError('Please use a password with at least 6 characters.')
    if (password !== form.get('confirmPassword')) return setError('The two passwords do not match.')
    setError('')

    // The window stays open behind the curtain, so if something goes wrong
    // nothing that was typed is lost.
    withCurtain(async () => {
      try {
        const session = await signUp({ email, password, fullName, role })
        if (!session) {
          // Supabase is set to confirm emails: there is an account, but no login yet.
          showToast('Almost there! Check your inbox to confirm your email, then log in.')
          goTo('login')
          return false
        }
        close()
        navigate('/dashboard', { state: { role } })
        return true
      } catch (problem) {
        setError(problem.message)
        return false
      }
    }, 'Account Created! ✔')
  }

  const handleLogin = (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    setError('')

    withCurtain(async () => {
      try {
        await signIn({ email: form.get('email').trim(), password: form.get('password') })
        close()
        navigate('/dashboard')
        return true
      } catch (problem) {
        setError(problem.message)
        return false
      }
    }, 'Welcome Back! 🔓')
  }

  const handleForgot = async (event) => {
    event.preventDefault()
    const email = new FormData(event.target).get('email').trim()
    setError('')
    setBusy(true)
    try {
      await requestPasswordReset(email)
      setResetSentTo(email)
    } catch (problem) {
      setError(problem.message)
    }
    setBusy(false)
  }

  const roleSwitch = (
    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
      <button type="button" onClick={() => goTo(mode, 'client')} aria-pressed={role === 'client'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${role === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
        🙋‍♂️ Client
      </button>
      <button type="button" onClick={() => goTo(mode, 'pro')} aria-pressed={role === 'pro'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${role === 'pro' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
        💼 Pro
      </button>
    </div>
  )

  return (
    <Modal label={TITLES[mode]} onClose={close}>
      {mode === 'pro' && (
        <div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Work with Habitick</h3>
          <p className="text-slate-600 leading-relaxed mb-5">
            Create a free account, choose the services you offer and the areas you cover, and accept the jobs that suit you. You see the price before you accept.
          </p>
          {plan && (
            <div className="bg-slate-900 text-white rounded-2xl p-6 mb-6">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Optional: Habitick Pro</p>
              <p className="text-3xl font-black mb-3">
                {formatMoney(plan.price_cents)}
                <span className="text-sm font-normal text-slate-400"> for {plan.days} days, after a {plan.trial_days}-day free trial</span>
              </p>
              <ul className="text-sm text-slate-300 space-y-2">
                {new Membership(null, plan).benefits.map((benefit) => (
                  <li key={benefit}>✔ {benefit}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={() => goTo('register', 'pro')} className={primaryGreen}>
            Create a pro account
          </button>
        </div>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 mb-1">Create Account</h3>
          <div>
            <span className={label}>I want to</span>
            {roleSwitch}
            <p className="text-xs text-slate-500 mt-1.5">
              {role === 'client' ? 'Book services for my home.' : 'Offer my services and take jobs.'} You can switch later.
            </p>
          </div>
          <div>
            <label className={label} htmlFor="auth-name">Full name</label>
            <input id="auth-name" type="text" name="fullName" autoComplete="name" maxLength={80} required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" name="email" autoComplete="email" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="auth-email2">Confirm Email</label>
            <input id="auth-email2" type="email" name="confirmEmail" autoComplete="email" required className={input} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" name="password" autoComplete="new-password" minLength={6} required className={input} />
            </div>
            <div>
              <label className={label} htmlFor="auth-password2">Confirm</label>
              <input id="auth-password2" type="password" name="confirmPassword" autoComplete="new-password" required className={input} />
            </div>
          </div>
          {error && <p role="alert" className={errorBox}>{error}</p>}
          <button type="submit" className={`${primary} mt-4`}>
            Register Account
          </button>
        </form>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 mb-1">Welcome Back</h3>
          <div>
            <label className={label} htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" name="email" autoComplete="email" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" name="password" autoComplete="current-password" required className={input} />
            <button type="button" onClick={() => goTo('forgot')} className={`${link} text-xs mt-2`}>
              Forgot your password?
            </button>
          </div>
          {error && <p role="alert" className={errorBox}>{error}</p>}
          <button type="submit" className={`${primary} mt-4`}>
            Log In
          </button>
        </form>
      )}

      {mode === 'forgot' &&
        (resetSentTo ? (
          <div role="status">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Check your inbox</h3>
            <p className="text-slate-600 leading-relaxed">
              If there is an account for <strong>{resetSentTo}</strong>, an email with a link to choose a new password is on its way. It can take a minute to arrive.
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
            <h3 className="text-2xl font-bold text-slate-900 mb-1">Reset your password</h3>
            <p className="text-sm text-slate-600">Enter the email you registered with and we will send you a link to choose a new password.</p>
            <div>
              <label className={label} htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" name="email" autoComplete="email" required className={input} />
            </div>
            {error && <p role="alert" className={errorBox}>{error}</p>}
            <button type="submit" disabled={busy} className={`${primary} mt-4`}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ))}

      <div className="text-center text-xs text-slate-400 pt-4 mt-4 border-t border-slate-100">
        {mode === 'login' ? (
          <p>
            New here?{' '}
            <button type="button" onClick={() => goTo('register')} className={link}>
              Join Habitick
            </button>
          </p>
        ) : (
          <p>
            {mode === 'forgot' ? 'Remembered it?' : 'Have an account?'}{' '}
            <button type="button" onClick={() => goTo('login')} className={link}>
              Log in
            </button>
          </p>
        )}
      </div>
    </Modal>
  )
}
