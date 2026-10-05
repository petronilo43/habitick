import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { listServices, signOut } from '../lib/api'
import { formatPrice } from '../lib/format'
import BookingModal from '../components/BookingModal'
import workerImage from '../assets/worker.webp'

// The public page: what Habitick is, and the services that can be booked.
export default function Home() {
  const { session, showToast, openAuth } = useApp()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // ---- the services, loaded from the database ------------------------------------
  const [catalogue, setCatalogue] = useState({ status: 'loading', services: [], error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    listServices().then(
      (services) => {
        if (active) setCatalogue({ status: 'ready', services, error: '' })
      },
      (problem) => {
        if (active) setCatalogue({ status: 'error', services: [], error: problem.message })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  const retry = () => {
    setCatalogue({ status: 'loading', services: [], error: '' })
    setAttempt((n) => n + 1)
  }

  // ---- looking at a service, then booking it -----------------------------------------
  const [previewService, setPreviewService] = useState(null)
  const [bookingService, setBookingService] = useState(null)

  const startBooking = (service) => {
    setPreviewService(null)
    if (!session) {
      openAuth('register', 'client')
      showToast('Please create an account to book a service.')
      return
    }
    setBookingService(service)
  }

  const handleLogout = async () => {
    setIsMenuOpen(false)
    try {
      await signOut()
      showToast('Logged out successfully.')
    } catch (problem) {
      showToast(problem.message, 'error')
    }
  }

  return (
    <div className="flex flex-col justify-between min-h-screen">
      {isMenuOpen && <div onClick={() => setIsMenuOpen(false)} className="fixed inset-0 z-30"></div>}

      <div className="flex-grow">
        {/* NAVBAR */}
        <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center bg-transparent relative z-40 mt-2">
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            Habi<span className="text-emerald-600">tick.ie</span>
          </div>
          <div className="flex gap-3 sm:gap-5 items-center">
            {session ? (
              <div className="flex items-center gap-4 relative">
                <button onClick={() => navigate('/dashboard')} className="text-sm font-bold text-emerald-600 hover:text-emerald-800 transition active:scale-95 cursor-pointer hidden sm:flex items-center gap-2">
                  <span>📊</span> Go to Dashboard
                </button>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  aria-label="Account menu"
                  aria-expanded={isMenuOpen}
                  className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:bg-slate-800 transition active:scale-95 shadow-md"
                >
                  {session.user.email.charAt(0).toUpperCase()}
                </button>
                {isMenuOpen && (
                  <div className="absolute top-14 right-0 w-56 bg-white border border-slate-200 shadow-xl rounded-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-3 border-b border-slate-100 mb-1 bg-slate-50 rounded-t-xl mt-[-8px]">
                      <p className="text-sm font-bold text-slate-900 truncate">{session.user.email}</p>
                    </div>
                    <button onClick={() => navigate('/dashboard')} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition flex items-center gap-2 cursor-pointer">
                      <span>📊</span> Dashboard
                    </button>
                    <button onClick={() => navigate('/dashboard', { state: { tab: 'settings' } })} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition flex items-center gap-2 cursor-pointer">
                      <span>⚙️</span> Settings
                    </button>
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2 cursor-pointer">
                        <span>🚪</span> Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => openAuth('pricing', 'pro')} className="hidden sm:block text-sm font-bold text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer">
                  Become a Pro
                </button>
                <span className="text-slate-200 hidden sm:inline">|</span>
                <button onClick={() => openAuth('login')} className="text-sm font-bold text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer">
                  Login
                </button>
                <button onClick={() => openAuth('register', 'client')} className="bg-slate-900 text-white text-sm px-5 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg active:scale-95 cursor-pointer">
                  Register
                </button>
              </>
            )}
          </div>
        </nav>

        {/* HERO */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-20 relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-8">
          <div className="w-full lg:w-1/2 text-left pt-8">
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider inline-block mb-6 border border-emerald-200 shadow-sm">
              Ireland&apos;s On-Demand Services
            </span>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
              Your home, sorted <br />
              <span className="text-emerald-600">in one click.</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-lg leading-relaxed">
              The premium home marketplace across Ireland. Trusted local professionals, fair pricing starting at minimum wage, and instant secure booking.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => document.getElementById('services-grid').scrollIntoView({ behavior: 'smooth' })}
                className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-emerald-500 transition active:scale-95 shadow-xl shadow-emerald-600/20 cursor-pointer text-center"
              >
                Book a Service
              </button>
              {!session && (
                <button
                  onClick={() => openAuth('pricing', 'pro')}
                  className="bg-white text-slate-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition active:scale-95 shadow-md border border-slate-200 cursor-pointer text-center"
                >
                  Work with us
                </button>
              )}
            </div>
          </div>

          <div className="w-full lg:w-1/2 relative mt-8 lg:mt-0 flex justify-end">
            <div className="absolute top-6 -right-4 lg:-right-6 w-[90%] h-full bg-emerald-500 rounded-3xl shadow-2xl transform rotate-2"></div>
            <img
              src={workerImage}
              alt="A professional cleaning a home"
              width="1600"
              height="900"
              className="relative z-10 w-[95%] h-[400px] sm:h-[500px] object-cover rounded-3xl shadow-xl transform -rotate-1 transition-transform hover:rotate-0 duration-300"
            />
          </div>
        </section>

        {/* SERVICES */}
        <section id="services-grid" className="max-w-7xl mx-auto px-6 py-16 scroll-mt-10 relative z-10">
          <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-10 tracking-tight">Select a service to view details & book</h2>

          {catalogue.status === 'loading' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Loading services">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-44 animate-pulse">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl mb-4"></div>
                  <div className="h-5 w-2/3 bg-slate-100 rounded mb-2"></div>
                  <div className="h-3 w-1/3 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
          )}

          {catalogue.status === 'error' && (
            <div className="bg-white rounded-3xl p-10 shadow-sm border border-slate-100 text-center max-w-xl mx-auto">
              <p className="font-bold text-slate-900 mb-1">The services could not be loaded.</p>
              <p className="text-sm text-slate-500 mb-6">{catalogue.error}</p>
              <button onClick={retry} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition active:scale-95 cursor-pointer">
                Try again
              </button>
            </div>
          )}

          {catalogue.status === 'ready' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {catalogue.services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => setPreviewService(service)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-emerald-200 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left active:scale-95 group"
                >
                  <div>
                    <div className="text-4xl mb-4 transform group-hover:scale-110 transition duration-300 origin-left">{service.icon}</div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">{service.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">{formatPrice(service.price_cents, service.price_unit)}</p>
                  </div>
                  <div className="mt-6 text-sm font-bold text-emerald-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    View Details <span>→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-100 mt-16 relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-10 md:flex md:items-center md:justify-between">
          <div>
            <div className="text-xl font-bold text-slate-900 tracking-tight">
              Habi<span className="text-emerald-600">tick.ie</span>
            </div>
            <p className="text-sm text-slate-500 mt-2 max-w-xs">The smartest way to book trusted home services in Ireland.</p>
          </div>
          <p className="text-sm text-slate-500 mt-6 md:mt-0 max-w-xs md:text-right">
            A portfolio project by Thiago Petronilo. The services and prices are examples; no real bookings are fulfilled.
          </p>
        </div>
      </footer>

      {/* SERVICE DETAILS */}
      {previewService && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div role="dialog" aria-modal="true" aria-label={previewService.name} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button onClick={() => setPreviewService(null)} aria-label="Close" className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 font-bold text-xl active:scale-90 transition cursor-pointer">
              &times;
            </button>
            <div className="text-5xl mb-4">{previewService.icon}</div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{previewService.name}</h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Service Description</p>
              <p className="text-sm text-slate-600 leading-relaxed">{previewService.description}</p>
            </div>
            <div className="mb-6 px-1">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estimated Rate</p>
              <p className="text-xl font-extrabold text-slate-900">{formatPrice(previewService.price_cents, previewService.price_unit)}</p>
            </div>
            <button onClick={() => startBooking(previewService)} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 shadow-md transition active:scale-95 cursor-pointer">
              Book This Service
            </button>
          </div>
        </div>
      )}

      {bookingService && <BookingModal service={bookingService} onClose={() => setBookingService(null)} />}
    </div>
  )
}
