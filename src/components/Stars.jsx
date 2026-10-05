// A rating shown as five stars, with the number spelled out for screen readers.
export default function Stars({ rating }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="text-amber-500 tracking-tight">
      {'★'.repeat(rating)}
      <span className="text-slate-200">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}
