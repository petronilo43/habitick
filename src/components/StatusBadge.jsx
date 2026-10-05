import { paymentsEnabled } from '../lib/api'
import { STATUS } from '../lib/booking'

const STYLES = {
  [STATUS.REQUESTED]: 'bg-amber-50 text-amber-800 border-amber-200',
  [STATUS.ACCEPTED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [STATUS.COMPLETED]: 'bg-slate-100 text-slate-600 border-slate-200',
  [STATUS.CANCELLED]: 'bg-red-50 text-red-700 border-red-200',
}

const badge = 'text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap'

export default function StatusBadge({ booking }) {
  return (
    <span className="flex flex-wrap gap-1.5 justify-end">
      <span className={`${badge} ${STYLES[booking.status]}`}>{booking.statusLabel}</span>
      {/* "Payment due" only makes sense on a site where paying is switched on */}
      {booking.isDone && (booking.isPaid || paymentsEnabled) && (
        <span className={`${badge} ${booking.isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          {booking.isPaid ? 'Paid' : 'Payment due'}
        </span>
      )}
    </span>
  )
}
