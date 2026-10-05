// The three things a list can be before it has rows to show.

export function Loading({ label }) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse" aria-busy="true" aria-label={label}>
      <div className="h-5 w-1/3 bg-slate-100 rounded mb-3"></div>
      <div className="h-4 w-2/3 bg-slate-100 rounded"></div>
    </div>
  )
}

export function Failed({ message, onRetry }) {
  return (
    <div role="alert" className="bg-white rounded-3xl p-6 shadow-sm border border-red-100 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="font-bold text-slate-900">This could not be loaded.</p>
        <p className="text-sm text-slate-500 mt-1">{message}</p>
      </div>
      <button onClick={onRetry} className="text-sm font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer">
        Try again
      </button>
    </div>
  )
}

export function Empty({ icon, title, children }) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-6">
      <div className="w-12 h-12 flex-shrink-0 bg-slate-50 rounded-full flex items-center justify-center text-2xl border border-slate-100" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="font-bold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500 mt-1">{children}</p>
      </div>
    </div>
  )
}
