import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { updatePassword } from '../lib/api'
import PageShell from '../components/PageShell'
import { errorBox, input, label, primary } from '../components/ui'

// Where the link in a "forgot my password" email leads. Following that link logs the
// person in for this one purpose, so this page only has to ask for the new password.
export default function ResetPassword() {
  const { session, showToast, openAuth } = useApp()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const password = form.get('password')
    if (password.length < 6) return setError('Please use a password with at least 6 characters.')
    if (password !== form.get('confirm')) return setError('The two passwords do not match.')

    setError('')
    setSaving(true)
    try {
      await updatePassword(password)
      showToast('Your new password is saved.')
      navigate('/dashboard')
    } catch (problem) {
      setError(problem.message)
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <div className="max-w-md">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Choose a new password</h1>

        {session === undefined && <p className="text-slate-500 mt-4">One moment…</p>}

        {session === null && (
          <>
            <p className="text-slate-600 mt-4 leading-relaxed">
              This page opens from the link in a password-reset email, and that link has expired or was already used.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => openAuth('forgot')} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition active:scale-95 cursor-pointer">
                Send me a new link
              </button>
              <Link to="/" className="bg-white text-slate-700 px-6 py-3 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition">
                Back to the home page
              </Link>
            </div>
          </>
        )}

        {session && (
          <form onSubmit={handleSubmit} className="mt-6 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-4">
            <p className="text-sm text-slate-600">For the account <strong>{session.user.email}</strong>.</p>
            <div>
              <label className={label} htmlFor="new-password">New password</label>
              <input id="new-password" type="password" name="password" autoComplete="new-password" minLength={6} required className={input} />
            </div>
            <div>
              <label className={label} htmlFor="new-password2">Type it again</label>
              <input id="new-password2" type="password" name="confirm" autoComplete="new-password" required className={input} />
            </div>
            {error && <p role="alert" className={errorBox}>{error}</p>}
            <button type="submit" disabled={saving} className={primary}>
              {saving ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </PageShell>
  )
}
