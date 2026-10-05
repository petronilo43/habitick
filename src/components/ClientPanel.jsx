import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { cancelBooking, listMyBookings } from '../lib/api'
import BookingCard from './BookingCard'
import { Empty, Failed, Loading } from './ListState'

const QUICK_BOOK = [
  { icon: '🧹', name: 'Cleaning' },
  { icon: '🏡', name: 'Gardening' },
  { icon: '🚗', name: 'Car Wash' },
  { icon: '🔨', name: 'Handyman' },
  { icon: '➕', name: 'More' },
]

// The dashboard for someone who books services.
// `tab` is 'overview' (what is going on now) or 'bookings' (everything, past included).
export default function ClientPanel({ userId, tab }) {
  const { showToast } = useApp()
  const navigate = useNavigate()

  const [list, setList] = useState({ status: 'loading', bookings: [], error: '' })
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState(false)
  const reload = () => setReloads((n) => n + 1)

  // Load the bookings: at the start, after every change, when moving between tabs, and
  // when the window gets attention again (a pro may have accepted something meanwhile).
  useEffect(() => {
    let active = true
    listMyBookings(userId).then(
      (bookings) => {
        if (active) setList({ status: 'ready', bookings, error: '' })
      },
      (problem) => {
        if (active) setList((old) => ({ ...old, status: 'error', error: problem.message }))
      },
    )
    return () => {
      active = false
    }
  }, [userId, reloads, tab])

  useEffect(() => {
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [])

  const handleCancel = async (booking) => {
    setBusy(true)
    try {
      await cancelBooking(booking.id)
      showToast('Booking cancelled.')
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    setBusy(false)
    reload()
  }

  const active = list.bookings.filter((booking) => booking.isActive).reverse() // soonest first
  const past = list.bookings.filter((booking) => !booking.isActive)

  const cards = (bookings) =>
    bookings.map((booking) => (
      <BookingCard key={booking.id} booking={booking} viewer="client" userId={userId} busy={busy} onCancel={handleCancel} />
    ))

  const activeSection = (
    <section>
      <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Active Bookings</h3>
      <div className="space-y-4">
        {list.status === 'loading' && <Loading label="Loading your bookings" />}
        {list.status === 'error' && <Failed message={list.error} onRetry={reload} />}
        {list.status === 'ready' && active.length === 0 && (
          <Empty icon="📭" title="No active bookings right now.">
            When you book a service, you can follow it here.
          </Empty>
        )}
        {cards(active)}
      </div>
    </section>
  )

  if (tab === 'bookings') {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {activeSection}
        {past.length > 0 && (
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Past Bookings</h3>
            <div className="space-y-4">{cards(past)}</div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* BANNER */}
      <div className="bg-slate-900 rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-slate-900/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="relative z-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">Need your home sorted today?</h2>
          <p className="text-slate-300 max-w-md text-sm mb-6 leading-relaxed">Pick a service, tell us when and where, and a local professional takes it from there.</p>
          <button onClick={() => navigate('/')} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-lg">
            Explore Services →
          </button>
        </div>
      </div>

      {/* QUICK BOOK */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Quick Book</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {QUICK_BOOK.map((item) => (
            <button key={item.name} onClick={() => navigate('/')} className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-transform">
              <span className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-3xl group-hover:border-emerald-300 group-hover:shadow-md transition-all">
                {item.icon}
              </span>
              <span className="text-xs font-bold text-slate-600">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {activeSection}
    </div>
  )
}
