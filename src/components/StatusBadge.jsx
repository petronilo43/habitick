import { STATUS } from '../lib/booking'

const STYLES = {
  [STATUS.REQUESTED]: 'bg-amber-50 text-amber-800 border-amber-200',
  [STATUS.ACCEPTED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [STATUS.COMPLETED]: 'bg-slate-100 text-slate-600 border-slate-200',
  [STATUS.CANCELLED]: 'bg-red-50 text-red-700 border-red-200',
}

export default function StatusBadge({ booking }) {
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${STYLES[booking.status]}`}>
      {booking.statusLabel}
    </span>
  )
}
