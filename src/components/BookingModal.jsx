import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { createBooking } from '../lib/api'
import { MAX_DAYS_AHEAD, MAX_DETAILS_LENGTH, addDays, todayInIreland, validateBookingForm } from '../lib/booking'
import { PricingRule, durationNote } from '../lib/pricing'
import Modal from './Modal'
import { errorBox, input, label, primary } from './ui'

// The form for booking one service. The question it asks ("Property size",
// "Walk duration", ...), the answers and their prices come with the service
// from the database.
export default function BookingModal({ service, onClose }) {
  const { withCurtain } = useApp()
  const navigate = useNavigate()
  const today = todayInIreland()

  const [optionId, setOptionId] = useState(null)
  const [details, setDetails] = useState('')
  const [eircode, setEircode] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')

  const chosen = service.options.find((option) => option.id === optionId)
  const price = chosen ? PricingRule.for(service, chosen) : null

  const handleSubmit = (event) => {
    event.preventDefault()

    // Catch mistakes here first; the database checks the same things again.
    const problem = validateBookingForm({ service, optionId, details, eircode, date }, today)
    if (problem) return setError(problem)
    setError('')

    withCurtain(async () => {
      try {
        await createBooking({ optionId, details, eircode, date })
        onClose()
        navigate('/dashboard', { state: { role: 'client', tab: 'bookings' } })
        return true
      } catch (failure) {
        setError(failure.message)
        return false
      }
    }, 'Booking sent! ✔')
  }

  return (
    <Modal label={`Book ${service.name}`} onClose={onClose} size="sm">
      <h3 className="text-xl font-bold text-slate-900 mb-4 pr-8">
        Book <span className="text-emerald-600">{service.name}</span>
      </h3>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <fieldset>
          <legend className={label}>{service.option_label}</legend>
          <div className="space-y-2">
            {service.options.map((option) => {
              const rule = PricingRule.for(service, option)
              const checked = option.id === optionId
              return (
                <label
                  key={option.id}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition ${checked ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <input type="radio" name="option" checked={checked} onChange={() => setOptionId(option.id)} className="accent-emerald-600 w-4 h-4 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                      {durationNote(option) && <span className="block text-xs text-slate-500">{durationNote(option)}</span>}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">{rule.totalLabel}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div>
          <label className={label} htmlFor="booking-details">Notes for the pro (optional)</label>
          <textarea
            id="booking-details"
            placeholder="Anything the pro should know: access, pets, parking..."
            value={details}
            maxLength={MAX_DETAILS_LENGTH}
            onChange={(e) => setDetails(e.target.value)}
            className={`${input} text-sm h-20 resize-none`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="booking-eircode">Eircode</label>
            <input id="booking-eircode" type="text" placeholder="V94 T9PX" autoComplete="postal-code" value={eircode} onChange={(e) => setEircode(e.target.value)} className={`${input} uppercase placeholder:normal-case`} />
          </div>
          <div>
            <label className={label} htmlFor="booking-date">Date</label>
            <input id="booking-date" type="date" min={today} max={addDays(today, MAX_DAYS_AHEAD)} value={date} onChange={(e) => setDate(e.target.value)} className={`${input} text-sm`} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Pros see only your area (the first 3 characters) until one of them accepts the job.</p>

        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-4" aria-live="polite">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</p>
            <p className="text-xs text-slate-500 mt-0.5">{price ? `${price.describe()}.` : 'Choose an option to see the price.'} You pay after the job is done.</p>
          </div>
          <p className="text-2xl font-black text-slate-900 whitespace-nowrap">{price ? price.totalLabel : '–'}</p>
        </div>

        {error && <p role="alert" className={errorBox}>{error}</p>}

        <button type="submit" className={primary}>
          Send booking request
        </button>
      </form>
    </Modal>
  )
}
