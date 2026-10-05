import { useEffect, useState } from 'react'
import { useApp } from '../context/app-context'
import { acceptBooking, completeBooking, listMyJobs, listOpenJobs, releaseBooking } from '../lib/api'
import { STATUS } from '../lib/booking'
import { formatDate, formatPrice } from '../lib/format'
import BookingCard from './BookingCard'
import { Empty, Failed, Loading } from './ListState'

// One request that no pro has taken yet. It shows the area, never the full address.
function OpenJob({ job, busy, onAccept }) {
  return (
    <article className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 flex items-start gap-4">
      <div className="w-12 h-12 flex-shrink-0 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl border border-slate-100" aria-hidden="true">
        {job.service_icon}
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h4 className="font-bold text-slate-900">{job.service_name}</h4>
          <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{formatPrice(job.price_cents, job.price_unit)}</span>
        </div>
        <p className="text-sm text-slate-600 mt-0.5">{job.option}</p>
        <p className="text-sm text-slate-700 font-semibold mt-2">
          {formatDate(job.scheduled_date)} <span className="text-slate-300 mx-1">|</span> {job.area} area
        </p>
        {job.details && <p className="text-sm text-slate-600 mt-2 break-words">“{job.details}”</p>}
        <button
          disabled={busy}
          onClick={() => onAccept(job)}
          className="mt-4 text-sm font-bold px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Accept job
        </button>
      </div>
    </article>
  )
}

// The dashboard for someone who provides services.
// `tab` is 'overview' (numbers and open requests) or 'bookings' (the jobs they took).
export default function ProPanel({ userId, tab }) {
  const { showToast } = useApp()

  const [data, setData] = useState({ status: 'loading', openJobs: [], myJobs: [], error: '' })
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState(false)
  const reload = () => setReloads((n) => n + 1)

  useEffect(() => {
    let active = true
    Promise.all([listOpenJobs(), listMyJobs(userId)]).then(
      ([openJobs, myJobs]) => {
        if (active) setData({ status: 'ready', openJobs, myJobs, error: '' })
      },
      (problem) => {
        if (active) setData((old) => ({ ...old, status: 'error', error: problem.message }))
      },
    )
    return () => {
      active = false
    }
  }, [userId, reloads, tab]) // moving between tabs also loads fresh data

  useEffect(() => {
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [])

  // Runs one action, says what happened, and loads the lists again either way:
  // if the action failed (say, another pro was quicker), the lists are out of date.
  const run = async (action, doneMessage) => {
    setBusy(true)
    try {
      await action()
      showToast(doneMessage)
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    setBusy(false)
    reload()
  }

  const handleAccept = (job) => run(() => acceptBooking(job.id), 'Job accepted. The address is now in My Jobs.')
  const handleRelease = (booking) => run(() => releaseBooking(booking.id), 'Job given back.')
  const handleComplete = (booking) => run(() => completeBooking(booking.id), 'Nice work! Job marked as done.')

  const toDo = data.myJobs.filter((job) => job.status === STATUS.ACCEPTED)
  const done = data.myJobs.filter((job) => job.status === STATUS.COMPLETED)
  const cancelled = data.myJobs.filter((job) => job.status === STATUS.CANCELLED)

  const cards = (jobs) =>
    jobs.map((job) => (
      <BookingCard key={job.id} booking={job} viewer="pro" userId={userId} busy={busy} onRelease={handleRelease} onComplete={handleComplete} />
    ))

  const state = (
    <>
      {data.status === 'loading' && <Loading label="Loading jobs" />}
      {data.status === 'error' && <Failed message={data.error} onRetry={reload} />}
    </>
  )

  if (tab === 'bookings') {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Jobs To Do</h3>
          <div className="space-y-4">
            {state}
            {data.status === 'ready' && toDo.length === 0 && (
              <Empty icon="🗓️" title="Nothing booked in yet.">
                Accept a request on the Overview tab and it shows up here, with the client and the address.
              </Empty>
            )}
            {cards(toDo)}
          </div>
        </section>
        {done.length > 0 && (
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Done</h3>
            <div className="space-y-4">{cards(done)}</div>
          </section>
        )}
        {cancelled.length > 0 && (
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Cancelled By The Client</h3>
            <div className="space-y-4">{cards(cancelled)}</div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* NUMBERS, counted from the real bookings */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Open Requests</p>
          <p className="text-3xl font-black text-slate-900">{data.openJobs.length}</p>
          <p className="text-xs text-emerald-600 font-bold mt-2">Waiting for a pro</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Jobs To Do</p>
          <p className="text-3xl font-black text-slate-900">{toDo.length}</p>
          <p className="text-xs text-slate-500 font-semibold mt-2">Accepted by you</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-3xl shadow-md border border-slate-800 text-white relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 text-6xl opacity-20" aria-hidden="true">⭐</div>
          <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 relative z-10">Jobs Completed</p>
          <p className="text-3xl font-black relative z-10">{done.length}</p>
          <p className="text-xs text-slate-300 font-semibold mt-2 relative z-10">{done.length === 0 ? 'Ready for your first one!' : 'Keep it up!'}</p>
        </div>
      </div>

      {/* OPEN REQUESTS */}
      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="text-lg font-bold text-slate-900">Available Jobs</h3>
          <button onClick={reload} className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full transition active:scale-95 cursor-pointer">
            ↻ Refresh
          </button>
        </div>
        <div className="space-y-4">
          {state}
          {data.status === 'ready' && data.openJobs.length === 0 && (
            <Empty icon="📍" title="No open requests at the moment.">
              When a client books a service, it appears here for you to accept.
            </Empty>
          )}
          {data.openJobs.map((job) => (
            <OpenJob key={job.id} job={job} busy={busy} onAccept={handleAccept} />
          ))}
        </div>
      </section>
    </div>
  )
}
