import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/app-context'
import { useLiveReload } from '../hooks/useLiveReload'
import { acceptBooking, completeBooking, demoAdvance, getLockedJobs, listMyJobs, listOpenJobs, paymentsEnabled, releaseBooking } from '../lib/api'
import { STATUS } from '../lib/booking'
import { formatDate, formatMoney } from '../lib/format'
import { Membership } from '../lib/plan'
import BookingCard from './BookingCard'
import { Empty, Failed, Loading } from './ListState'
import { smallGreen, smallQuiet } from './ui'

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
          <span className="text-lg font-black text-slate-900">{formatMoney(job.total_cents)}</span>
        </div>
        <p className="text-sm text-slate-600 mt-0.5">{job.option}</p>
        <p className="text-sm text-slate-700 font-semibold mt-2">
          {formatDate(job.scheduled_date)} <span className="text-slate-300 mx-1">|</span> {job.area} area
        </p>
        {job.details && <p className="text-sm text-slate-600 mt-2 break-words">“{job.details}”</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={busy} onClick={() => onAccept(job)} className={smallGreen}>
            Accept job
          </button>
          {job.early_access && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">Pro early access</span>
          )}
        </div>
      </div>
    </article>
  )
}

function Stat({ label, value, note, dark = false }) {
  return (
    <div className={`p-5 rounded-3xl shadow-sm border ${dark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100'}`}>
      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${dark ? 'text-emerald-400' : 'text-slate-500'}`}>{label}</p>
      <p className="text-3xl font-black">{value}</p>
      <p className={`text-xs font-semibold mt-2 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{note}</p>
    </div>
  )
}

// The dashboard for someone who provides services.
// `tab` is 'overview' (numbers and open requests) or 'bookings' (the jobs they took).
export default function ProPanel({ userId, tab, profile, inDemo, onOpenPlan }) {
  const { showToast, plan } = useApp()

  // `locked` is how many requests are still in Pro early access, and in how many minutes the next one opens.
  const [data, setData] = useState({ status: 'loading', openJobs: [], locked: { jobs: 0, minutes: 0 }, myJobs: [], error: '' })
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    let active = true
    Promise.all([listOpenJobs(), getLockedJobs(), listMyJobs(userId)]).then(
      ([openJobs, lockedJobs, myJobs]) => {
        if (!active) return
        const wait = lockedJobs.next_opens_at ? new Date(lockedJobs.next_opens_at) - Date.now() : 0
        const locked = { jobs: lockedJobs.jobs, minutes: Math.max(1, Math.ceil(wait / 60_000)) }
        setData({ status: 'ready', openJobs, locked, myJobs, error: '' })
      },
      (problem) => {
        if (active) setData((old) => ({ ...old, status: 'error', error: problem.message }))
      },
    )
    return () => {
      active = false
    }
  }, [userId, reloads, tab, profile?.pro_until]) // also when the Pro plan starts: early-access requests appear

  useLiveReload(reload)

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
  const handleDemoStep = (booking) => run(() => demoAdvance(booking.id), 'Demo: Aoife paid and left a review.')

  const toDo = data.myJobs.filter((job) => job.status === STATUS.ACCEPTED)
  const done = data.myJobs.filter((job) => job.status === STATUS.COMPLETED)
  const cancelled = data.myJobs.filter((job) => job.status === STATUS.CANCELLED)

  // The numbers at the top are all worked out from the pro's real jobs.
  const reviews = done.filter((job) => job.review).map((job) => job.review.rating)
  const rating = reviews.length ? (reviews.reduce((sum, stars) => sum + stars, 0) / reviews.length).toFixed(1) : '–'
  // With payments switched on, only jobs the client has paid count as earned.
  const earned = done.filter((job) => job.isPaid || !paymentsEnabled).reduce((sum, job) => sum + job.totalCents, 0)
  const membership = plan ? new Membership(profile, plan) : null

  const cards = (jobs) =>
    jobs.map((job) => (
      <BookingCard
        key={job.id}
        booking={job}
        viewer="pro"
        userId={userId}
        busy={busy}
        inDemo={inDemo}
        onRelease={handleRelease}
        onComplete={handleComplete}
        onDemoStep={handleDemoStep}
      />
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Jobs To Do" value={toDo.length} note={membership ? `Up to ${membership.activeJobLimit} at once` : 'Accepted by you'} />
        <Stat label="Jobs Completed" value={done.length} note={done.length === 0 ? 'Ready for your first one!' : 'Keep it up!'} />
        <Stat label="Your Rating" value={rating} note={reviews.length === 1 ? 'From 1 review' : `From ${reviews.length} reviews`} />
        <Stat label="Earned" value={formatMoney(earned)} note={paymentsEnabled ? 'From jobs clients have paid' : 'From the jobs you completed'} dark />
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
          {/* On the free plan, brand-new requests wait a few minutes. Say so, rather than hide it. */}
          {data.locked.jobs > 0 && (
            <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-bold">
                  <span aria-hidden="true">🔒</span>{' '}
                  {data.locked.jobs === 1 ? '1 new request is' : `${data.locked.jobs} new requests are`} in Pro early access
                </p>
                <p className="text-sm text-slate-300 mt-1">
                  Pro members can take {data.locked.jobs === 1 ? 'it' : 'them'} now. {data.locked.jobs === 1 ? 'It opens' : 'The next one opens'} to everyone in about{' '}
                  {data.locked.minutes} {data.locked.minutes === 1 ? 'minute' : 'minutes'}.
                </p>
              </div>
              <button onClick={onOpenPlan} className={`${smallQuiet} bg-white`}>
                See the Pro plan
              </button>
            </div>
          )}
          {state}
          {data.status === 'ready' && data.openJobs.length === 0 && (
            <Empty icon="📍" title="No open requests at the moment.">
              When a client books a service you offer, in an area you cover, it appears here for you to accept.
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
