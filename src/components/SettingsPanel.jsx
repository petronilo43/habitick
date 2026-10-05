import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { deleteAccount, updateProfile } from '../lib/api'
import Modal from './Modal'
import ProPreferences from './ProPreferences'
import { input, label, smallDanger, smallDangerQuiet, smallDark, smallQuiet } from './ui'

// Settings: the person's name and starting dashboard, what they offer as a pro,
// and deleting the account.
//   onSaved(profile)  after the profile is saved
//   onDeleted()       after the account is gone
export default function SettingsPanel({ profile, email, role, inDemo, onSaved, onDeleted }) {
  const { showToast } = useApp()
  const [fullName, setFullName] = useState(profile.full_name)
  const [startAs, setStartAs] = useState(profile.role)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const unchanged = fullName.trim() === profile.full_name && startAs === profile.role

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!fullName.trim()) return showToast('Please enter your name.', 'error')
    setSaving(true)
    try {
      onSaved(await updateProfile(profile.id, { full_name: fullName.trim(), role: startAs }))
      showToast('Settings saved.')
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteAccount()
      onDeleted()
    } catch (problem) {
      showToast(problem.message, 'error')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6 animate-in fade-in duration-300">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-5">
        <h3 className="text-xl font-bold text-slate-900">Settings</h3>

        <div>
          <label className={label} htmlFor="settings-name">Full name</label>
          <input id="settings-name" type="text" autoComplete="name" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} className={input} />
          <p className="text-xs text-slate-500 mt-1.5">Shown to the other person once a booking is accepted.</p>
        </div>

        <div>
          <span className={label}>Email</span>
          <p className="px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500">{email ?? 'None: this is a demo guest'}</p>
        </div>

        <fieldset>
          <legend className={label}>Open my dashboard as</legend>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button type="button" onClick={() => setStartAs('client')} aria-pressed={startAs === 'client'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${startAs === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              🙋‍♂️ Client
            </button>
            <button type="button" onClick={() => setStartAs('pro')} aria-pressed={startAs === 'pro'} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${startAs === 'pro' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              💼 Pro
            </button>
          </div>
        </fieldset>

        <button type="submit" disabled={saving || unchanged} className={`${smallDark} px-6 py-3`}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* Only relevant while providing services */}
      {role === 'pro' && <ProPreferences userId={profile.id} />}

      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
        <h3 className="text-xl font-bold text-slate-900">Your data</h3>
        <p className="text-sm text-slate-600 mt-1">
          <Link to="/privacy" className="font-bold text-emerald-700 hover:underline">
            What this site stores and who can see it
          </Link>
        </p>
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-600 max-w-xs">
            {inDemo ? 'Ending the demo deletes its sample data straight away.' : 'Deleting your account removes your profile, bookings, reviews and preferences for good.'}
          </p>
          <button onClick={() => setConfirmingDelete(true)} className={smallDangerQuiet}>
            {inDemo ? 'End the demo' : 'Delete my account'}
          </button>
        </div>
      </section>

      {confirmingDelete && (
        <Modal label={inDemo ? 'End the demo' : 'Delete my account'} onClose={() => setConfirmingDelete(false)} size="sm">
          <h3 className="text-xl font-bold text-slate-900 mb-2 pr-8">{inDemo ? 'End the demo?' : 'Delete your account?'}</h3>
          <p className="text-slate-600 leading-relaxed">
            {inDemo
              ? 'The sample bookings and everything you did in the demo will be deleted.'
              : 'Your profile, the bookings you made, your reviews and your preferences will be deleted. Jobs you accepted go back on offer. This cannot be undone.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={handleDelete} disabled={deleting} className={`${smallDanger} px-5 py-2.5`}>
              {deleting ? 'Deleting…' : inDemo ? 'Yes, end it' : 'Yes, delete everything'}
            </button>
            <button onClick={() => setConfirmingDelete(false)} className={`${smallQuiet} px-5 py-2.5`}>
              No, keep it
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
