import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { confirmPayment, getProfile, signOut } from '../lib/api'
import { firstName, greeting } from '../lib/format'
import ClientPanel from '../components/ClientPanel'
import Logo from '../components/Logo'
import PlanPanel from '../components/PlanPanel'
import ProPanel from '../components/ProPanel'
import SettingsPanel from '../components/SettingsPanel'

// The private area. The same account can book services (client mode) and take jobs
// (pro mode); the button in the top bar switches between the two.
export default function Dashboard() {
  const { session, showToast } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = session?.user?.id

  // The mode can be handed over by the page we came from (for example, after booking
  // we always land in client mode). Otherwise the profile's own setting is used.
  const [chosenRole, setChosenRole] = useState(location.state?.role ?? null)
  const [activeTab, setActiveTab] = useState(location.state?.tab ?? 'overview')
  const [profile, setProfile] = useState(null)
  const [refreshes, setRefreshes] = useState(0) // raised to make everything load again

  useEffect(() => {
    if (!userId) return
    let active = true
    getProfile(userId).then(
      (loaded) => {
        if (active) setProfile(loaded)
      },
      (problem) => {
        if (active) showToast(problem.message, 'error')
      },
    )
    return () => {
      active = false
    }
  }, [userId, refreshes, showToast])

  // ---- coming back from the payment page -----------------------------------------
  // Stripe returns the browser to /dashboard?payment=success&session_id=... (or
  // ?payment=cancelled). The address alone proves nothing, so the server is asked to
  // check with Stripe before anything is shown as paid.
  const paymentHandled = useRef(false)
  useEffect(() => {
    const outcome = searchParams.get('payment')
    if (!outcome || paymentHandled.current) return
    paymentHandled.current = true
    const checkoutId = searchParams.get('session_id')
    setSearchParams({}, { replace: true }) // so reloading the page does not repeat this

    if (outcome !== 'success' || !checkoutId) {
      showToast('Payment cancelled. Nothing was charged.', 'error')
      return
    }
    confirmPayment(checkoutId).then(
      ({ status, kind }) => {
        if (status !== 'paid') return showToast('That payment was not completed.', 'error')
        showToast(kind === 'pro_plan' ? 'Payment received. Welcome to Pro!' : 'Payment received. Thank you!')
        setChosenRole(kind === 'pro_plan' ? 'pro' : 'client')
        setActiveTab(kind === 'pro_plan' ? 'plan' : 'bookings')
        setRefreshes((n) => n + 1)
      },
      (problem) => showToast(problem.message, 'error'),
    )
  }, [searchParams, setSearchParams, showToast])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-bold text-xl animate-pulse">Loading Habitick...</div>
      </div>
    )
  }

  // Nobody is logged in: this page is not for them.
  if (session === null) return <Navigate to="/" replace />

  const email = session.user.email ?? null // demo guests have none
  const inDemo = Boolean(profile?.sandbox)
  const role = chosenRole ?? profile?.role ?? 'client'
  const name = firstName(profile?.full_name) || email?.split('@')[0] || 'there'

  const toggleRole = () => {
    const newRole = role === 'client' ? 'pro' : 'client'
    setChosenRole(newRole)
    if (activeTab !== 'settings') setActiveTab('overview')
    showToast(`Switched to ${newRole === 'client' ? 'Client' : 'Pro'} Dashboard`)
  }

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    navigate('/')
  }

  const tabs = [
    { id: 'overview', icon: '📊', label: 'Overview' },
    { id: 'bookings', icon: role === 'client' ? '📅' : '📋', label: role === 'client' ? 'My Bookings' : 'My Jobs' },
    ...(role === 'pro' ? [{ id: 'plan', icon: '⭐', label: 'Pro Plan' }] : []),
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* TOP BAR */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} aria-label="Habitick home" className="cursor-pointer hover:opacity-80 transition">
            <Logo />
          </button>

          <div className="flex items-center gap-4 sm:gap-6">
            <button onClick={toggleRole} aria-label={`Switch to ${role === 'client' ? 'providing' : 'client'} mode`} className="whitespace-nowrap text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-full transition flex items-center gap-2 active:scale-95 cursor-pointer">
              {/* On a phone there is only room for an icon and the name of the other mode. */}
              <span className="sm:hidden" aria-hidden="true">⇄</span>
              <span className="hidden sm:inline" aria-hidden="true">{role === 'client' ? '💼' : '🙋‍♂️'}</span>
              <span>
                <span className="hidden sm:inline">Switch to </span>
                {role === 'client' ? 'Providing' : 'Client'}
              </span>
            </button>
            <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold shadow-md border-2 border-emerald-500" aria-hidden="true">
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row gap-8">
        {/* SIDE MENU */}
        <aside className="w-full md:w-64 flex-shrink-0">
          {/* On a phone this is a compact row of tabs; from tablets up, the full side menu. */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-2 md:p-4 md:sticky md:top-24">
            <div className="hidden md:block mb-6 px-4 pt-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">My Account</p>
              <p className="font-bold text-slate-900 truncate">{email ?? 'Demo guest'}</p>
              <p className="text-xs font-bold text-emerald-600 mt-1 capitalize">{role} Mode Active</p>
            </div>

            <div className="flex md:block gap-1 md:space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  className={`flex-1 md:w-full flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-bold transition cursor-pointer active:scale-95 ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="text-lg" aria-hidden="true">{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-2 pt-2 md:mt-8 md:pt-4 border-t border-slate-100">
              <button onClick={handleLogout} className="w-full flex items-center justify-center md:justify-start gap-3 px-4 py-2 md:py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition cursor-pointer active:scale-95">
                <span className="text-lg" aria-hidden="true">🚪</span> Log Out
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN AREA */}
        <main className="flex-grow min-w-0">
          {inDemo && (
            <div className="mb-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl">
                <strong>You are in the demo.</strong> These are sample bookings that only you can see. Aoife and Seán are pretend people: use the ▶ Demo buttons to play their part.
              </p>
              <button onClick={() => setActiveTab('settings')} className="font-bold underline underline-offset-2 hover:no-underline cursor-pointer">
                End the demo
              </button>
            </div>
          )}

          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-8">
            {greeting()}, {name} 👋
          </h1>

          {activeTab === 'settings' &&
            (profile ? (
              <SettingsPanel
                profile={profile}
                email={email}
                role={role}
                inDemo={inDemo}
                onSaved={setProfile}
                onDeleted={() => {
                  showToast(inDemo ? 'The demo and its data have been deleted.' : 'Your account and its data have been deleted.')
                  navigate('/')
                }}
              />
            ) : (
              <p className="text-slate-500">Loading your settings…</p>
            ))}

          {activeTab === 'plan' && role === 'pro' && <PlanPanel profile={profile} onChanged={setProfile} />}

          {/* `key` gives each mode its own fresh panel, so switching never shows stale lists */}
          {(activeTab === 'overview' || activeTab === 'bookings') &&
            (role === 'client' ? (
              <ClientPanel key={`client-${refreshes}`} userId={userId} tab={activeTab} inDemo={inDemo} />
            ) : (
              <ProPanel key={`pro-${refreshes}`} userId={userId} tab={activeTab} profile={profile} inDemo={inDemo} onOpenPlan={() => setActiveTab('plan')} />
            ))}
        </main>
      </div>
    </div>
  )
}
