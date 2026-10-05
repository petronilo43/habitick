import { useState } from 'react'
import { paymentsEnabled } from '../lib/api'
import { STATUS } from '../lib/booking'
import { formatDate, formatMoney, formatRating } from '../lib/format'
import Stars from './Stars'
import StatusBadge from './StatusBadge'
import { smallDanger, smallGreen, smallQuiet } from './ui'

// In the demo there is nobody on the other side, so the guest can play that person's
// next step. This says which step, if any, is next for this booking.
function demoStep(booking, viewer) {
  if (viewer === 'client' && booking.status === STATUS.REQUESTED) return 'Demo: let Seán accept this'
  if (viewer === 'client' && booking.status === STATUS.ACCEPTED) return 'Demo: let Seán finish the job'
  if (viewer === 'pro' && booking.isDone && !booking.isPaid) return 'Demo: let Aoife pay and review'
  return null
}

// One booking in a list. `viewer` is 'client' or 'pro' and decides what is shown:
// the client sees who is coming, the pro sees where to go and for whom.
// Which buttons appear is decided by the rules on the Booking itself (lib/booking.js).
export default function BookingCard({ booking, viewer, userId, busy, inDemo, onCancel, onRelease, onComplete, onPay, onReview, onDemoStep }) {
  // Cancelling and giving a job back ask "are you sure?" first.
  const [confirming, setConfirming] = useState(null) // null, 'cancel' or 'release'

  const canCancel = viewer === 'client' && booking.canBeCancelledBy(userId)
  const canPay = viewer === 'client' && paymentsEnabled && booking.canBePaidBy(userId)
  const canReview = viewer === 'client' && booking.canBeReviewedBy(userId)
  const canRelease = viewer === 'pro' && booking.canBeReleasedBy(userId)
  const canComplete = viewer === 'pro' && booking.canBeCompletedBy(userId)
  const waitingForDay = canRelease && !canComplete
  const nextDemoStep = inDemo ? demoStep(booking, viewer) : null

  return (
    <article className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 flex-shrink-0 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl border border-slate-100" aria-hidden="true">
          {booking.serviceIcon}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h4 className="font-bold text-slate-900">{booking.serviceName}</h4>
            <StatusBadge booking={booking} />
          </div>
          <p className="text-sm text-slate-600 mt-0.5">{booking.option}</p>

          <dl className="mt-3 grid grid-cols-[3.25rem_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500 font-medium">When</dt>
            <dd className="text-slate-700 font-semibold">{formatDate(booking.date)}</dd>
            <dt className="text-slate-500 font-medium">Where</dt>
            <dd className="text-slate-700 font-semibold">{booking.eircode}</dd>
            <dt className="text-slate-500 font-medium">Price</dt>
            <dd className="text-slate-700 font-semibold">{formatMoney(booking.totalCents)}</dd>
            {viewer === 'client' && booking.proName && (
              <>
                <dt className="text-slate-500 font-medium">Pro</dt>
                <dd className="text-slate-700 font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {booking.proName}
                  {booking.proIsMember && (
                    <span className="text-[10px] font-black tracking-wider bg-slate-900 text-emerald-400 px-1.5 py-0.5 rounded" title="Habitick Pro member">
                      PRO
                    </span>
                  )}
                  <span className="text-xs font-medium text-slate-500">
                    <span className="text-amber-500" aria-hidden="true">★</span> {formatRating(booking.proRating, booking.proReviews)}
                  </span>
                </dd>
              </>
            )}
            {viewer === 'pro' && (
              <>
                <dt className="text-slate-500 font-medium">Client</dt>
                <dd className="text-slate-700 font-semibold">{booking.clientName}</dd>
              </>
            )}
            {booking.details && (
              <>
                <dt className="text-slate-500 font-medium">Notes</dt>
                <dd className="text-slate-700 break-words">{booking.details}</dd>
              </>
            )}
            {booking.review && (
              <>
                <dt className="text-slate-500 font-medium">Review</dt>
                <dd className="text-slate-700 break-words">
                  <Stars rating={booking.review.rating} />
                  {booking.review.comment && <span className="block mt-0.5">“{booking.review.comment}”</span>}
                </dd>
              </>
            )}
          </dl>

          {(canCancel || canPay || canReview || canRelease || canComplete) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {confirming === null && (
                <>
                  {canComplete && (
                    <button className={smallGreen} disabled={busy} onClick={() => onComplete(booking)}>
                      Mark as done
                    </button>
                  )}
                  {canPay && (
                    <button className={smallGreen} disabled={busy} onClick={() => onPay(booking)}>
                      Pay {formatMoney(booking.totalCents)}
                    </button>
                  )}
                  {canReview && (
                    <button className={smallQuiet} disabled={busy} onClick={() => onReview(booking)}>
                      Leave a review
                    </button>
                  )}
                  {canRelease && (
                    <button className={smallQuiet} disabled={busy} onClick={() => setConfirming('release')}>
                      Give job back
                    </button>
                  )}
                  {canCancel && (
                    <button className={smallQuiet} disabled={busy} onClick={() => setConfirming('cancel')}>
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
                    className={smallDanger}
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null)
                      if (confirming === 'cancel') onCancel(booking)
                      else onRelease(booking)
                    }}
                  >
                    {confirming === 'cancel' ? 'Yes, cancel it' : 'Yes, give it back'}
                  </button>
                  <button className={smallQuiet} onClick={() => setConfirming(null)}>
                    No, keep it
                  </button>
                </>
              )}
            </div>
          )}

          {nextDemoStep && (
            <button
              disabled={busy}
              onClick={() => onDemoStep(booking)}
              className="mt-3 text-xs font-bold text-slate-600 border border-dashed border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            >
              ▶ {nextDemoStep}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
