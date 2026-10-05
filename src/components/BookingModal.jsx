import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { createBooking } from '../lib/api'
import { MAX_DAYS_AHEAD, MAX_DETAILS_LENGTH, addDays, todayInIreland, validateBookingForm } from '../lib/booking'

const input = 'w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500'
const label = 'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1'

// The form for booking one service. The question it asks ("Property Size",
// "Walk Duration", ...) and its answers come with the service from the database.
export default function BookingModal({ service, onClose }) {
  const { withCurtain } = useApp()
  const navigate = useNavigate()
  const today = todayInIreland()

  const [option, setOption] = useState('')
  const [details, setDetails] = useState('')
  const [eircode, setEircode] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()

    // Catch mistakes here first; the database checks the same things again.
    const problem = validateBookingForm({ service, option, details, eircode, date }, today)
    if (problem) return setError(problem)
    setError('')

    withCurtain(async () => {
      try {
        await createBooking({ serviceId: service.id, option, details, eircode, date })
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label={`Book ${service.name}`} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-slate-400 font-bold text-xl cursor-pointer hover:text-slate-600">
          &times;
        </button>
        <h3 className="text-xl font-bold text-slate-900 mb-4">
          Book <span className="text-emerald-600">{service.name}</span>
        </h3>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className={label} htmlFor="booking-option">{service.option_label}</label>
            <select id="booking-option" value={option} onChange={(e) => setOption(e.target.value)} className={`${input} cursor-pointer`}>
              <option value="" disabled>Select an option</option>
              {service.options.map((choice) => (
                <option key={choice} value={choice}>{choice}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="booking-details">
              {option === 'Other' ? 'Please Specify' : 'Notes for the pro (optional)'}
            </label>
            <textarea
              id="booking-details"
              placeholder="Tell the Pro what you need..."
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

          {error && <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}

          <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition active:scale-95 cursor-pointer mt-2">
            Send booking request
          </button>
        </form>
      </div>
    </div>
  )
}
