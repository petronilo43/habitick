import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { AppContext } from './context/app-context'
import { getProPlan } from './lib/api'
import AuthModal from './components/AuthModal'
import Home from './pages/Home'

// The home page is part of the first download. The other pages are fetched the first
// time someone opens them, so a visitor does not wait for code they may never use.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Privacy = lazy(() => import('./pages/Privacy'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const NotFound = lazy(() => import('./pages/NotFound'))

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The frame around every page: who is logged in, the messages at the top of the screen,
// the opening animation, the "curtain" shown while something is being saved, and the
// login window. Pages reach these through useApp() (see context/app-context.js).
export default function App() {
  const navigate = useNavigate()

  // ---- 1. Who is logged in --------------------------------------------------
  // undefined = still checking, null = nobody, otherwise the Supabase session.
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      // Someone followed the link in a "forgot my password" email.
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password')
    })
    return () => data.subscription.unsubscribe()
  }, [navigate])

  // ---- 2. The Pro plan's numbers, read once from the database ------------------
  const [plan, setPlan] = useState(null)

  useEffect(() => {
    getProPlan().then(setPlan, () => {}) // pages cope without it; they show the plan once it is here
  }, [])

  // ---- 3. Toast messages ----------------------------------------------------
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  // ---- 4. Opening animation, once per visit -----------------------------------
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem('habitickIntroSeen'))
  const [introStep, setIntroStep] = useState(0)

  useEffect(() => {
    if (!showIntro) return
    const timers = [
      setTimeout(() => setIntroStep(1), 100),
      setTimeout(() => setIntroStep(2), 700),
      setTimeout(() => setIntroStep(3), 1800),
      setTimeout(() => {
        setShowIntro(false)
        sessionStorage.setItem('habitickIntroSeen', 'true')
      }, 2500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [showIntro])

  // ---- 5. The curtain -----------------------------------------------------------
  // Covers the screen while `action` runs. If the action returns true, the curtain
  // shows `successMessage` for a moment before lifting.
  const [curtain, setCurtain] = useState(null) // null, or the text to show

  const withCurtain = useCallback(async (action, successMessage) => {
    setCurtain('')
    await wait(400)
    const succeeded = await action()
    if (succeeded) {
      setCurtain(successMessage)
      await wait(1000)
    }
    setCurtain(null)
    return succeeded
  }, [])

  // ---- 6. The login / register window ---------------------------------------------
  // null when closed, otherwise { mode: 'login' | 'register' | 'forgot' | 'pro', role: 'client' | 'pro' }.
  const [auth, setAuth] = useState(null)

  const openAuth = useCallback((mode, role = 'client') => {
    setAuth({ mode, role })
  }, [])

  const app = useMemo(
    () => ({ session, plan, showToast, withCurtain, openAuth }),
    [session, plan, showToast, withCurtain, openAuth],
  )

  return (
    <AppContext.Provider value={app}>
      <div className="bg-slate-50 min-h-screen font-sans text-slate-800 relative scroll-smooth">
        {/* TOAST */}
        {toast && (
          <div
            role="status"
            className={`fixed top-8 left-1/2 -translate-x-1/2 z-[10000] w-max max-w-[calc(100vw-2rem)] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-10 duration-300 font-medium ${toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}
          >
            <span className="text-xl" aria-hidden="true">{toast.type === 'error' ? '🛑' : '✨'}</span>
            {toast.message}
          </div>
        )}

        {/* CURTAIN */}
        <div
          className={`fixed inset-0 z-[9000] bg-slate-900 flex items-center justify-center transition-all duration-500 ease-in-out ${curtain !== null ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
        >
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tighter animate-pulse text-center px-6">
            {curtain ? (
              <span className="text-emerald-400">{curtain}</span>
            ) : (
              <>
                Habi<span className="text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]">tick.ie</span>
              </>
            )}
          </div>
        </div>

        {/* OPENING ANIMATION */}
        {showIntro && (
          <div
            className={`fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center transition-transform duration-700 ease-in-out ${introStep === 3 ? '-translate-y-full' : 'translate-y-0'}`}
          >
            <div className="flex items-center text-5xl sm:text-7xl font-extrabold text-white tracking-tight overflow-hidden">
              <span className={`transition-all duration-700 ease-out ${introStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>Habi</span>
              <span className={`transition-all duration-700 ease-out text-emerald-500 ${introStep >= 2 ? 'opacity-100 scale-100 drop-shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'opacity-0 scale-50'}`}>tick.ie</span>
            </div>
            <div className={`mt-6 w-48 h-1 bg-slate-800 rounded-full overflow-hidden transition-opacity duration-500 ${introStep >= 1 ? 'opacity-100' : 'opacity-0'}`}>
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-in-out" style={{ width: introStep >= 2 ? '100%' : '0%' }}></div>
            </div>
          </div>
        )}

        {/* Suspense shows nothing for the instant a page's code is still arriving. */}
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>

        {auth && <AuthModal auth={auth} setAuth={setAuth} />}
      </div>
    </AppContext.Provider>
  )
}
