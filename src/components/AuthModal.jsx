import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { signIn, signUp } from '../lib/api'

const input = 'w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500'
const label = 'block text-xs font-bold uppercase text-slate-500 mb-1'

// The window for logging in and registering.
// `auth` is { mode, role }: mode is 'pricing', 'register' or 'login'.
export default function AuthModal({ auth, setAuth }) {
  const { showToast, withCurtain } = useApp()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { mode, role } = auth

  const close = () => setAuth(null)
  const goTo = (newMode) => {
    setError('')
    setAuth({ mode: newMode, role })
  }
  const setRole = (newRole) => setAuth({ mode, role: newRole })

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

  const roleSwitch = (
    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
      <button type="button" onClick={() => setRole('client')} aria-pressed={role === 'client'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${role === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
        🙋‍♂️ Client
      </button>
      <button type="button" onClick={() => setRole('pro')} aria-pressed={role === 'pro'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${role === 'pro' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
        💼 Pro
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Log in' : 'Create an account'} className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button onClick={close} aria-label="Close" className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 font-bold text-xl transition cursor-pointer">
          &times;
        </button>

        {mode === 'pricing' && (
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-6">Habitick Premium</h3>
            <div className="mb-6">{roleSwitch}</div>
            <div className="bg-slate-900 text-white rounded-2xl p-6 mb-6">
              <p className="text-4xl font-black mb-2">
                €7<span className="text-sm font-normal text-slate-400"> /1st mo</span>
              </p>
              <ul className="text-sm text-slate-300 space-y-2">
                <li>✔ {role === 'client' ? 'Access to 5-star Pros' : 'Priority Listing in Area'}</li>
                <li>✔ Cancel anytime</li>
              </ul>
            </div>
            <button onClick={() => goTo('register')} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 shadow-md transition active:scale-95 cursor-pointer">
              Continue to Register
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
              <input id="auth-name" type="text" name="fullName" autoComplete="name" required className={input} />
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
            {error && <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}
            <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-4 hover:bg-slate-800 transition active:scale-95 cursor-pointer">
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
            </div>
            {error && <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}
            <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-4 hover:bg-slate-800 transition active:scale-95 cursor-pointer">
              Log In
            </button>
          </form>
        )}

        <div className="text-center text-xs text-slate-400 pt-4 mt-4 border-t border-slate-100">
          {mode !== 'login' ? (
            <p>
              Have an account?{' '}
              <button type="button" onClick={() => goTo('login')} className="text-emerald-600 font-bold cursor-pointer hover:underline transition">
                Log in
              </button>
            </p>
          ) : (
            <p>
              New here?{' '}
              <button type="button" onClick={() => goTo('register')} className="text-emerald-600 font-bold cursor-pointer hover:underline transition">
                Join Habitick
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
