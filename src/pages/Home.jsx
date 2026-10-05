import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { useCatalogue } from '../hooks/useCatalogue'
import { signOut, startDemo } from '../lib/api'
import { PricingRule, durationNote, priceLabel } from '../lib/pricing'
import BookingModal from '../components/BookingModal'
import Logo from '../components/Logo'
import Modal from '../components/Modal'
import SiteFooter from '../components/SiteFooter'
import { primaryGreen } from '../components/ui'
import workerImage from '../assets/worker.webp'

// The public page: what Habitick is, and the services that can be booked.
export default function Home() {
  const { session, showToast, withCurtain, openAuth } = useApp()
  const navigate = useNavigate()
  const catalogue = useCatalogue()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // ---- looking at a service, then booking it -----------------------------------------
  // A service can also be opened from a link such as /?book=dog-walking (the Quick Book
  // buttons on the dashboard use this).
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewed, setPreviewed] = useState(null)
  const [booking, setBooking] = useState(null)

  const linked =
    session !== undefined && catalogue.status === 'ready'
      ? catalogue.services.find((service) => service.slug === searchParams.get('book'))
      : null
  const previewService = previewed ?? (linked && !session ? linked : null)
  const bookingService = booking ?? (linked && session ? linked : null)

  const closeWindows = () => {
    setPreviewed(null)
    setBooking(null)
    if (searchParams.has('book')) setSearchParams({}, { replace: true })
  }

  const startBooking = (service) => {
    closeWindows()
    if (!session) {
      openAuth('register', 'client')
      showToast('Please create an account to book a service.')
      return
    }
    setBooking(service)
  }

  // A link to /#services-grid lands on the list of services.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#services-grid') document.getElementById('services-grid')?.scrollIntoView()
  }, [hash])

  // ---- the demo and the account menu ------------------------------------------------------
  const tryDemo = (role) =>
    withCurtain(async () => {
      try {
        await startDemo(role)
        navigate('/dashboard', { state: { role } })
        return true
      } catch (problem) {
        showToast(problem.message, 'error')
        return false
      }
    }, 'Your demo is ready ✔')

  const handleLogout = async () => {
    setIsMenuOpen(false)
    try {
      await signOut()
      showToast('Logged out successfully.')
    } catch (problem) {
      showToast(problem.message, 'error')
    }
  }

  const account = session?.user.email ?? 'Demo guest'

  return (
    <div className="flex flex-col justify-between min-h-screen overflow-x-clip">
      {isMenuOpen && <div onClick={() => setIsMenuOpen(false)} className="fixed inset-0 z-30"></div>}

      <div className="flex-grow">
        {/* NAVBAR */}
        <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center bg-transparent relative z-40 mt-2">
          <Logo />
          <div className="flex gap-3 sm:gap-5 items-center">
            {session ? (
              <div className="flex items-center gap-4 relative">
                <button onClick={() => navigate('/dashboard')} className="text-sm font-bold text-emerald-600 hover:text-emerald-800 transition active:scale-95 cursor-pointer hidden sm:flex items-center gap-2">
                  <span aria-hidden="true">📊</span> Go to Dashboard
                </button>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  aria-label="Account menu"
                  aria-expanded={isMenuOpen}
                  className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:bg-slate-800 transition active:scale-95 shadow-md"
                >
                  {account.charAt(0).toUpperCase()}
                </button>
                {isMenuOpen && (
                  <div className="absolute top-14 right-0 w-56 bg-white border border-slate-200 shadow-xl rounded-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-3 border-b border-slate-100 mb-1 bg-slate-50 rounded-t-xl mt-[-8px]">
                      <p className="text-sm font-bold text-slate-900 truncate">{account}</p>
                    </div>
                    <button onClick={() => navigate('/dashboard')} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition flex items-center gap-2 cursor-pointer">
                      <span aria-hidden="true">📊</span> Dashboard
                    </button>
                    <button onClick={() => navigate('/dashboard', { state: { tab: 'settings' } })} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition flex items-center gap-2 cursor-pointer">
                      <span aria-hidden="true">⚙️</span> Settings
                    </button>
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2 cursor-pointer">
                        <span aria-hidden="true">🚪</span> Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => openAuth('pro', 'pro')} className="hidden sm:block text-sm font-bold text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer">
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
              Cleaning, gardening, dog walking and repairs across Ireland. See the exact price before you book, and a local professional takes it from there.
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
                  onClick={() => openAuth('pro', 'pro')}
                  className="bg-white text-slate-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition active:scale-95 shadow-md border border-slate-200 cursor-pointer text-center"
                >
                  Work with us
                </button>
              )}
            </div>

            {/* THE DEMO: for visitors who want to look around without registering */}
            {session === null && (
              <div className="mt-8 max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-4">
                <p className="text-sm font-bold text-slate-900">Just looking around?</p>
                <p className="text-sm text-slate-600 mt-0.5">Try the demo with sample bookings. No sign-up, and nothing you do there is real.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => tryDemo('client')} className="text-sm font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer">
                    Try it as a client
                  </button>
                  <button onClick={() => tryDemo('pro')} className="text-sm font-bold px-4 py-2 rounded-xl border border-slate-300 text-slate-800 hover:bg-slate-50 transition active:scale-95 cursor-pointer">
                    Try it as a professional
                  </button>
                </div>
              </div>
            )}
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
              <button onClick={catalogue.retry} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition active:scale-95 cursor-pointer">
                Try again
              </button>
            </div>
          )}

          {catalogue.status === 'ready' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {catalogue.services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => setPreviewed(service)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-emerald-200 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left active:scale-95 group"
                >
                  <div>
                    <div className="text-4xl mb-4 transform group-hover:scale-110 transition duration-300 origin-left" aria-hidden="true">{service.icon}</div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">{service.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-wider">{priceLabel(service)}</p>
                  </div>
                  <div className="mt-6 text-sm font-bold text-emerald-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    View Details <span aria-hidden="true">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <SiteFooter />

      {/* SERVICE DETAILS */}
      {previewService && (
        <Modal label={previewService.name} onClose={closeWindows} size="sm">
          <div className="text-5xl mb-4" aria-hidden="true">{previewService.icon}</div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{previewService.name}</h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">{previewService.description}</p>

          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prices</p>
          <ul className="mb-6 divide-y divide-slate-100 border-y border-slate-100">
            {previewService.options.map((option) => (
              <li key={option.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="text-slate-700">
                  {option.label}
                  {durationNote(option) && <span className="text-slate-500"> · {durationNote(option)}</span>}
                </span>
                <span className="font-bold text-slate-900 whitespace-nowrap">{PricingRule.for(previewService, option).totalLabel}</span>
              </li>
            ))}
          </ul>

          <button onClick={() => startBooking(previewService)} className={primaryGreen}>
            Book This Service
          </button>
        </Modal>
      )}

      {bookingService && <BookingModal service={bookingService} onClose={closeWindows} />}
    </div>
  )
}
