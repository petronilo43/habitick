import { useEffect, useState } from 'react'
import { useApp } from '../context/app-context'
import { useCatalogue } from '../hooks/useCatalogue'
import { getProPreferences, setProPreferences } from '../lib/api'
import { parseAreas } from '../lib/booking'
import { errorBox, input, label, smallDark } from './ui'

// A professional chooses which services they offer and which areas they cover.
// Requests outside those choices are not shown to them. Choosing nothing means "all".
export default function ProPreferences({ userId }) {
  const { showToast } = useApp()
  const catalogue = useCatalogue()
  const [serviceIds, setServiceIds] = useState(null) // null until loaded
  const [areasText, setAreasText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    getProPreferences(userId).then(
      (saved) => {
        if (!active) return
        setServiceIds(saved.serviceIds)
        setAreasText(saved.areas.join(', '))
      },
      (problem) => {
        if (active) setError(problem.message)
      },
    )
    return () => {
      active = false
    }
  }, [userId])

  const toggle = (id) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]))

  const handleSubmit = async (event) => {
    event.preventDefault()
    const areas = parseAreas(areasText)
    if (!areas) return setError('Areas are the first 3 characters of an Eircode, for example V94 or D6W.')

    setError('')
    setSaving(true)
    try {
      await setProPreferences({ serviceIds, areas })
      setAreasText(areas.join(', '))
      showToast('Saved. Your list of available jobs now follows these choices.')
    } catch (problem) {
      setError(problem.message)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-5">
      <div>
        <h3 className="text-xl font-bold text-slate-900">What you offer</h3>
        <p className="text-sm text-slate-600 mt-1">You are only shown requests for these services in these areas. Leave a part empty to see everything.</p>
      </div>

      <fieldset>
        <legend className={label}>Services</legend>
        {serviceIds === null || catalogue.status !== 'ready' ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {catalogue.services.map((service) => (
              <label
                key={service.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition text-sm font-semibold ${serviceIds.includes(service.id) ? 'border-emerald-500 bg-emerald-50 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
              >
                <input type="checkbox" checked={serviceIds.includes(service.id)} onChange={() => toggle(service.id)} className="accent-emerald-600 w-4 h-4" />
                <span aria-hidden="true">{service.icon}</span> {service.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <label className={label} htmlFor="pro-areas">Areas you cover</label>
        {/* Not editable until the saved choices have arrived, or they would overwrite what was typed. */}
        <input
          id="pro-areas"
          type="text"
          value={areasText}
          onChange={(e) => setAreasText(e.target.value)}
          disabled={serviceIds === null}
          placeholder={serviceIds === null ? 'Loading…' : 'V94, V95, T12'}
          className={`${input} uppercase placeholder:normal-case disabled:opacity-60`}
        />
        <p className="text-xs text-slate-500 mt-1.5">The first 3 characters of an Eircode, separated by commas. Limerick city is V94, Cork city is T12.</p>
      </div>

      {error && <p role="alert" className={errorBox}>{error}</p>}

      <button type="submit" disabled={saving || serviceIds === null} className={`${smallDark} px-6 py-3`}>
        {saving ? 'Saving…' : 'Save what I offer'}
      </button>
    </form>
  )
}
