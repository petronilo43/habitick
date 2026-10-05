import { useState } from 'react'
import { formatDate } from '../lib/format'
import StatusBadge from './StatusBadge'

const quiet = 'text-sm font-bold px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
const strong = 'text-sm font-bold px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
const danger = 'text-sm font-bold px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

// One booking in a list. `viewer` is 'client' or 'pro' and decides what is shown:
// the client sees who is coming, the pro sees where to go and for whom.
// Which buttons appear is decided by the rules on the Booking itself (lib/booking.js).
export default function BookingCard({ booking, viewer, userId, busy, onCancel, onRelease, onComplete }) {
  // Cancelling and giving a job back ask "are you sure?" first.
  const [confirming, setConfirming] = useState(null) // null, 'cancel' or 'release'

  const canCancel = viewer === 'client' && booking.canBeCancelledBy(userId)
  const canRelease = viewer === 'pro' && booking.canBeReleasedBy(userId)
  const canComplete = viewer === 'pro' && booking.canBeCompletedBy(userId)
  const waitingForDay = canRelease && !canComplete

  return (
    <article className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 flex-shrink-0 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl border border-slate-100" aria-hidden="true">
          {booking.serviceIcon}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h4 className="font-bold text-slate-900">{booking.serviceName}</h4>
            <StatusBadge booking={booking} />
          </div>
          <p className="text-sm text-slate-600 mt-0.5">{booking.option}</p>

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-400 font-medium">When</dt>
            <dd className="text-slate-700 font-semibold">{formatDate(booking.date)}</dd>
            <dt className="text-slate-400 font-medium">Where</dt>
            <dd className="text-slate-700 font-semibold">{booking.eircode}</dd>
            {viewer === 'client' && booking.proName && (
              <>
                <dt className="text-slate-400 font-medium">Pro</dt>
                <dd className="text-slate-700 font-semibold">{booking.proName}</dd>
              </>
            )}
            {viewer === 'pro' && (
              <>
                <dt className="text-slate-400 font-medium">Client</dt>
                <dd className="text-slate-700 font-semibold">{booking.clientName}</dd>
              </>
            )}
            {booking.details && (
              <>
                <dt className="text-slate-400 font-medium">Notes</dt>
                <dd className="text-slate-700 break-words">{booking.details}</dd>
              </>
            )}
          </dl>

          {(canCancel || canRelease || canComplete) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {confirming === null && (
                <>
                  {canComplete && (
                    <button className={strong} disabled={busy} onClick={() => onComplete(booking)}>
                      Mark as done
                    </button>
                  )}
                  {canRelease && (
                    <button className={quiet} disabled={busy} onClick={() => setConfirming('release')}>
                      Give job back
                    </button>
                  )}
                  {canCancel && (
                    <button className={quiet} disabled={busy} onClick={() => setConfirming('cancel')}>
                      Cancel booking
                    </button>
                  )}
                  {waitingForDay && <span className="text-xs text-slate-500">You can mark it as done on {formatDate(booking.date)}.</span>}
                </>
              )}

              {confirming !== null && (
                <>
                  <span className="text-sm font-semibold text-slate-700 mr-1">
                    {confirming === 'cancel' ? 'Cancel this booking?' : 'Give this job back to other pros?'}
                  </span>
                  <button
                    className={danger}
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null)
                      if (confirming === 'cancel') onCancel(booking)
                      else onRelease(booking)
                    }}
                  >
                    {confirming === 'cancel' ? 'Yes, cancel it' : 'Yes, give it back'}
                  </button>
                  <button className={quiet} onClick={() => setConfirming(null)}>
                    No, keep it
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
