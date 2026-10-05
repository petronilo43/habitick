import { useState } from 'react'
import { useApp } from '../context/app-context'
import { updateProfile } from '../lib/api'

const input = 'w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500'
const label = 'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1'

// Lets people change their name and which dashboard opens first.
export default function SettingsPanel({ profile, email, onSaved }) {
  const { showToast } = useApp()
  const [fullName, setFullName] = useState(profile.full_name)
  const [role, setRole] = useState(profile.role)
  const [saving, setSaving] = useState(false)

  const unchanged = fullName.trim() === profile.full_name && role === profile.role

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!fullName.trim()) return showToast('Please enter your name.', 'error')
    setSaving(true)
    try {
      const saved = await updateProfile(profile.id, { full_name: fullName.trim(), role })
      onSaved(saved)
      showToast('Settings saved.')
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 max-w-xl space-y-5 animate-in fade-in duration-300">
      <h3 className="text-xl font-bold text-slate-900">Settings</h3>

      <div>
        <label className={label} htmlFor="settings-name">Full name</label>
        <input id="settings-name" type="text" autoComplete="name" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} className={input} />
        <p className="text-xs text-slate-500 mt-1.5">Shown to the other person once a booking is accepted.</p>
      </div>

      <div>
        <span className={label}>Email</span>
        <p className="px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500">{email}</p>
      </div>

      <fieldset>
        <legend className={label}>Open my dashboard as</legend>
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
          <button type="button" onClick={() => setRole('client')} aria-pressed={role === 'client'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${role === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            🙋‍♂️ Client
          </button>
          <button type="button" onClick={() => setRole('pro')} aria-pressed={role === 'pro'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${role === 'pro' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            💼 Pro
          </button>
        </div>
      </fieldset>

      <button type="submit" disabled={saving || unchanged} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
